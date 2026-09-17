#!/usr/bin/env bash
#
# lib-stack.sh — what dev-up.sh and dev-down.sh must agree on.
#
# Sourced, never run. The caller sets ROOT (the checkout to operate on) and keeps
# its own flags, setting JSON=1 when it wants machine-readable output.
#
# Two things live here, and for the same reason — a copy in each script would
# drift:
#
#   * the paths. dev-down has to read exactly the state dev-up wrote, and both
#     need one answer to "where are the logs, the pid file and the state file?".
#     DEV_UP_LOG_DIR moves all of them together, so a scratch run can neither
#     read nor truncate the live stack's files.
#   * the probes. "Who owns this port?" and "is this port served at all?" are
#     asked by dev-up before it starts anything and by dev-down before it stops
#     anything. Disagreeing about that is how you kill the wrong process.

# Git Bash/MSYS needs ".exe" on native binaries, and Windows paths for them.
WINDOWS=0
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) WINDOWS=1 ;;
esac
EXE=""
[ "$WINDOWS" = 1 ] && EXE=".exe"

LOG_DIR="${DEV_UP_LOG_DIR:-$ROOT/.zscripts}"
DEV_LOG="$LOG_DIR/dev-up.log"
SOCKET_LOG="$LOG_DIR/dev-up-socket.log"
PID_FILE="$LOG_DIR/dev-up.pid"
STATE_FILE="$LOG_DIR/dev-up.state.json"

# ---------------------------------------------------------------- output helpers

# In --json mode stdout carries the JSON object and nothing else, so all
# human-facing output is routed to stderr (still on the terminal, still captured).
step() { if [ "$JSON" = 1 ]; then printf '\n==> %s\n' "$*" >&2; else printf '\n==> %s\n' "$*"; fi; }
info() { if [ "$JSON" = 1 ]; then printf '    %s\n' "$*" >&2; else printf '    %s\n' "$*"; fi; }
note() { if [ "$JSON" = 1 ]; then printf '%s\n' "$*" >&2; else printf '%s\n' "$*"; fi; }
indent() { if [ "$JSON" = 1 ]; then sed 's/^/      /' >&2; else sed 's/^/      /'; fi; }
warn() { printf '    ! %s\n' "$*" >&2; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

# The leading # block of a script is its help text.
usage() { # $1 the script file to read
  awk 'NR > 1 { if ($0 !~ /^#/) exit; sub(/^# ?/, ""); print }' "$1"
}

# ------------------------------------------------------------------- port probes

# The inode of the LISTEN socket on $1 as /proc/net/tcp reports it, or empty.
# Each row is `sl local_address rem_address st ... inode`, state 0A is LISTEN, and
# the local port is the part of the address after the last colon.
listen_inode() { # $1 port
  local port="$1" hex
  [ -r /proc/net/tcp ] || return 0
  hex="$(printf '%04X' "$port")"
  awk -v want=":$hex" '$4 == "0A" && $2 ~ want"$" { print $10 }' \
    /proc/net/tcp /proc/net/tcp6 2>/dev/null | head -1
}

# pid holding the LISTEN socket on $1, resolved through /proc alone: no lsof, no
# ss, no iproute2, nothing that has to be installed. /proc/net/tcp names every TCP
# socket by inode and its holder has that inode open as `socket:[inode]`, so the
# answer is the OS's own bookkeeping rather than a tool's summary of it.
#
# This sees exactly what the kernel lets us read, which is the point: a listener
# owned by another user (a service container's published port, a root-owned
# PostgreSQL) has no readable /proc/<pid>/fd here either, so the caller still
# learns "served, owner unreadable" rather than a wrong pid. Same-user listeners —
# every service this script starts — are always resolvable, which is what makes the
# ownership assertions in the test suite runnable instead of skippable.
pid_by_proc() { # $1 port
  local port="$1" inode pid fd
  inode="$(listen_inode "$port")"
  [ -n "$inode" ] || return 0
  for fd in /proc/[0-9]*/fd/*; do
    [ "$(readlink "$fd" 2>/dev/null)" = "socket:[$inode]" ] || continue
    pid="${fd#/proc/}"
    printf '%s' "${pid%%/*}"
    return 0
  done
}

# pid owning the LISTEN socket on $1, or empty. Cross-platform, and each branch is
# a different tool for the same question.
listener_pid() {
  local port="$1" found=""
  [ -n "$port" ] || return 0
  if [ "$WINDOWS" = 1 ]; then
    found="$(netstat -ano -p tcp 2>/dev/null | tr -d '\r' \
      | awk -v want=":$port" '$1 == "TCP" && $4 == "LISTENING" && $2 ~ want"$" { print $5 }' \
      | sort -u | head -1)"
  else
    # Try each tool until one actually names a pid. Being installed is not the same
    # as answering: lsof can be present and still say nothing about a process it may
    # not inspect, and choosing tools by `command -v` meant the script reported no
    # owner for a port that was served the whole time — while the test suite's own
    # probe, which *does* fall back, named it. Whoever answers first wins.
    if command -v lsof >/dev/null 2>&1; then
      found="$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | head -1)"
    fi
    if [ -z "$found" ] && command -v ss >/dev/null 2>&1; then
      found="$(ss -ltnpH "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | head -1)"
    fi
    # Last, and the only link that installs nothing and asks nobody: /proc. A
    # minimal image (no lsof, no iproute2) and a tool that answers nothing are the
    # same problem to the two checks above, and this covers both.
    if [ -z "$found" ]; then
      found="$(pid_by_proc "$port")"
    fi
  fi
  printf '%s' "$found"
}

# 0 when a TCP connection to $1:$2 is accepted — the fallback for "is someone
# already there?" when the OS will not name the owner. A listener belonging to
# another user (a container's published port in CI, a system PostgreSQL) has a
# socket lsof/ss cannot attribute to a pid we are allowed to read.
tcp_open() {
  node -e '
    const s = require("net").connect({ host: process.argv[1], port: Number(process.argv[2]) });
    const done = (code) => { try { s.destroy(); } catch {} process.exit(code); };
    s.setTimeout(1500);
    s.on("connect", () => done(0));
    s.on("timeout", () => done(1));
    s.on("error", () => done(1));
  ' "$1" "$2" >/dev/null 2>&1
}

# Is the port being served, whether or not we can tell who owns it? Starting a
# second copy of something already running is the thing this prevents, and
# stopping a port we do not own is the other; listener_pid stays the source of
# truth for the pid itself.
port_taken() { # $1 port
  [ -n "$(listener_pid "$1")" ] && return 0
  tcp_open 127.0.0.1 "$1"
}

# Until the port is being served. This asks port_taken, not listener_pid, and the
# difference is the whole reason the first CI run could not bring the stack up:
# there, Next booted ("Ready in 1398ms") and the relay connected, but neither
# lsof nor ss named the owning pid from the runner, so a loop that required a
# *named* listener span for its full 300s and then failed a stack that was up.
# Naming the pid stays listener_pid's job; "is someone there" is port_taken's,
# which is what this is asking.
wait_for_port() { # $1 port, $2 seconds — until something LISTENs on it
  local deadline=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$deadline" ]; do
    port_taken "$1" && return 0
    sleep 1
  done
  return 1
}

# One line for a failure message: what each probe actually saw. "Nothing is
# listening" and "something is listening that this OS will not name for us" are
# very different problems, and the second is every bring-up in a container.
probe_detail() { # $1 port
  local port="$1" tools why=""
  if [ "$WINDOWS" = 1 ]; then
    tools="netstat: $(command -v netstat >/dev/null 2>&1 && printf present || printf absent)"
  else
    tools="lsof: $(command -v lsof >/dev/null 2>&1 && printf present || printf absent)"
    tools="$tools, ss: $(command -v ss >/dev/null 2>&1 && printf present || printf absent)"
    tools="$tools, /proc/net/tcp: $([ -r /proc/net/tcp ] && printf present || printf absent)"
    # When the socket is right there and still has no readable holder, say so: the
    # pid is being withheld by permissions, which no tool in this list can fix.
    if [ -r /proc/net/tcp ] && [ -n "$(listen_inode "$port")" ]; then
      why=" — its LISTEN socket exists (inode $(listen_inode "$port")) but no process running as $(id -un) has it open, so the owner is another user's"
    fi
  fi
  if [ -n "$(listener_pid "$port")" ]; then
    printf 'pid %s owns it' "$(listener_pid "$port")"
  elif tcp_open 127.0.0.1 "$port"; then
    printf 'a TCP connect is accepted but nothing names the owner (%s)%s' "$tools" "$why"
  else
    printf 'no TCP connect either (%s)' "$tools"
  fi
}

wait_for_port_free() { # $1 port, $2 seconds — the down-side of wait_for_port
  local deadline=$((SECONDS + $2))
  while [ "$SECONDS" -lt "$deadline" ]; do
    port_taken "$1" || return 0
    sleep 1
  done
  ! port_taken "$1"
}

tail_log() { # $1 file
  [ -f "$1" ] || return 0
  info "last lines of $(basename "$1"):"
  tail -15 "$1" | indent
}

# Node and bun are native Windows binaries: an MSYS path like /f/… is meaningless
# to them, so anything they must open is handed over as a Windows path.
native_path() {
  if [ "$WINDOWS" = 1 ] && command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

# --------------------------------------------------------------- stopping trees

# Killing a process tree. On Windows that means taskkill, and calling taskkill
# from Git Bash is a minefield worth spelling out:
#
#   taskkill /PID 1234   → Git Bash rewrites the leading-slash argument as a path
#                          (`C:/Program Files/Git/PID`) and taskkill fails with
#                          "Invalid argument/option". A silent no-op.
#   taskkill //PID 1234  → the documented MSYS escape, but it *stops* working when
#                          MSYS_NO_PATHCONV is set in the environment, which is a
#                          common thing to have in a .bashrc.
#
# So neither spelling is dependable. Powershell is asked to run taskkill instead:
# inside the `-Command` string the argument is never a shell word, so no rule
# applies to it and both environment settings behave the same.
windows_kill_tree() { # $1 pid
  powershell -NoProfile -Command "taskkill /PID $1 /T /F" >/dev/null 2>&1
}

# Terminate a process and its descendants, deepest first. Both branches tolerate
# a pid that is already gone — the caller checks the *port*, not the pid, to
# decide whether it worked.
kill_tree() { # $1 pid
  local pid="$1" kids
  [ -n "$pid" ] || return 0
  if [ "$WINDOWS" = 1 ]; then
    windows_kill_tree "$pid"
    return $?
  fi
  kids="$(ps -o pid= --ppid "$pid" 2>/dev/null | tr -d ' ')"
  for k in $kids; do kill_tree "$k"; done
  kill -TERM "$pid" 2>/dev/null
}

# The same walk without the chance to shut down cleanly, for a service that
# ignored the first attempt.
force_kill_tree() { # $1 pid
  local pid="$1" kids
  [ -n "$pid" ] || return 0
  if [ "$WINDOWS" = 1 ]; then
    windows_kill_tree "$pid"
    return $?
  fi
  kids="$(ps -o pid= --ppid "$pid" 2>/dev/null | tr -d ' ')"
  for k in $kids; do force_kill_tree "$k"; done
  kill -KILL "$pid" 2>/dev/null
}

# "reused" with no pid means something is serving the port that the OS will not
# name for us (a container's published port) — say so, rather than printing a
# bare dash next to "reused" and looking broken.
state_text() { # $1 state, $2 pid
  if [ "$1" = "reused" ] && [ -z "$2" ]; then printf 'reused (owner not visible)'; else printf '%s' "$1"; fi
}
