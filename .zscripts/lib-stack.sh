#!/usr/bin/env bash
#
# lib-stack.sh — what dev-up.sh and dev-down.sh must agree on.
#
# Sourced, never run. The caller sets ROOT (the checkout to operate on) and keeps
# its own flags, setting JSON=1 when it wants machine-readable output.
#
# Three things live here, and for the same reason — a copy in each script would
# drift:
#
#   * the paths. dev-down has to read exactly the state dev-up wrote, and both
#     need one answer to "where are the logs, the pid file and the state file?".
#     DEV_UP_LOG_DIR moves all of them together, so a scratch run can neither
#     read nor truncate the live stack's files.
#   * the probes. "Who owns this port?" and "is this port served at all?" are
#     asked by dev-up before it starts anything and by dev-down before it stops
#     anything. Disagreeing about that is how you kill the wrong process.
#   * what "the source moved on" means. A running service is stale when a file it read
#     once at boot has changed since it started — `APP_RESTART_INPUTS`,
#     `SOCKET_RESTART_INPUTS`, `stale_since_start`. dev-up is the one that says so (a
#     preview attached to a process that will never re-read its own config is the thing
#     this exists to prevent), but "which files was that service started from" is one
#     answer, written down once, rather than a judgement each caller re-makes.

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
# What each service says about itself at boot (see `published_pid`). The defaults are
# $ROOT/.zscripts/dev-server.json and $ROOT/.zscripts/attendance-socket.json, which is
# where a hand-started `npm run dev` and `bun index.ts` write them; dev-up passes these
# paths to the services it starts, so a relocated log directory carries the files with it.
SERVER_PID_FILE="$LOG_DIR/dev-server.json"
SOCKET_PID_FILE="$LOG_DIR/attendance-socket.json"
# Where the app answers the same document over HTTP (the app's own
# `IDENTITY_PATH` in src/lib/dev-server-identity.ts). This is what a boot-time claim is
# confirmed against, because an answer on the port cannot be stale the way a file can.
SERVER_IDENTITY_PATH="/api/dev-identity"

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
    # Try each route until one actually names a pid, because being installed is not
    # the same as answering. What each one does is measured rather than assumed (see
    # the Port probe lab workflow): for a listener held by this user, lsof, ss and
    # /proc all name it; for one held by another user — CI's service-container
    # Postgres, a system daemon — none of them do, and lsof exits 1 saying nothing.
    # That is a permission boundary, not a tool defect, so the caller must be able
    # to hear "served, owner unreadable" without mistaking it for "nothing there".
    # The last route needs nothing installed at all. Whoever answers first wins.
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

# One field of a service's boot-time claim, or empty.
#
# Each service writes this file at boot (`src/lib/service-identity.ts`): the dev server
# via `src/instrumentation.ts`, the socket mini-service at the top of its own
# `index.ts`. The answer therefore comes from the process that is serving rather than
# from the kernel's socket table — which names a holder only for sockets whose owner you
# may read. That is the case `listener_pid` above can only ever report as "served, owner
# unreadable".
#
# Checked the same way for both: a socket's claim is a claim to check, not a fact.
#
# Everything in the file is a claim to check, not a fact. It has to name this port and
# this checkout, and its pid has to be alive; anything else — a file from another port,
# another checkout, or a server killed before it could clean up — is ignored and the
# caller falls back to the probe. EPERM counts as alive, which is the usual meaning of
# "signal 0 worked": the process exists, we just may not signal it (an elevated server).
#
# `$5 = 0` drops the liveness requirement, which is what `dev:down` needs: it asks about
# a claim for the server it has *just stopped*, so a live pid is the one thing that
# cannot be true, and that is precisely when the stale claim should be deleted.
#
# The boot marker is read through this too, and that is deliberate: a staleness verdict is
# built by comparing that marker against file mtimes, so it must come from a claim that
# passed exactly the same checks as the pid. A file from another port or another checkout
# can no more drive "this service is stale" than it can name its pid.
claim_field() { # $1 file, $2 expected port, $3 expected directory, $4 field, $5 "0" to accept a claim whose pid is already gone
  local file="$1" port="$2" root="$3" field="$4"
  [ -n "$file" ] && [ -r "$file" ] || return 0
  node -e '
    const fs = require("fs");
    const [file, port, root, field, mustBeAlive] = process.argv.slice(1);
    // Both sides of a path comparison on Windows: case and separators are not
    // meaningful there, and a file from another checkout must not be trusted.
    const norm = (p) => String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    let claim;
    try { claim = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(0) }
    if (!claim || !Number.isInteger(claim.pid) || claim.pid <= 0) process.exit(0);
    if (Number(claim.port) !== Number(port)) process.exit(0);
    if (norm(claim.cwd) !== norm(root)) process.exit(0);
    if (mustBeAlive !== "0") {
      try { process.kill(claim.pid, 0); } catch (error) { if (error.code !== "EPERM") process.exit(0) }
    }
    const value = claim[field];
    if (typeof value === "string" && value !== "") process.stdout.write(value);
    else if (typeof value === "number" && Number.isFinite(value)) process.stdout.write(String(value));
  ' "$file" "$port" "$root" "$field" "${5:-1}" 2>/dev/null
}

# The pid a service published about itself, or empty — the field everything else is built
# on, and the one dev-up hands to a preview.
published_pid() { # $1 file, $2 expected port, $3 expected directory, $4 "0" to accept a claim whose pid is already gone
  claim_field "$1" "$2" "$3" pid "${4:-1}"
}

# The pid a service reports over HTTP, or empty — for the services that answer.
#
# Whoever answers on a port *is* the process holding it, so this is the one route that
# cannot be stale: a file outlives its writer, a response does not. That is what makes it
# the confirmation for a boot-time claim rather than a second opinion, and the reason the
# app serves its identity document at `SERVER_IDENTITY_PATH`.
#
# The body has to look like an answer — JSON naming an integer pid *for this port* — because
# everything else that can come back (a 404 page, an HTML error, an empty reply) is not one,
# and mistaking it for a pid is exactly the failure this route exists to prevent.
answered_pid() { # $1 port, $2 identity path (empty when the service has no such route)
  local path="${2:-}" body
  [ -n "$path" ] || return 0
  body="$(curl -s --max-time 5 "http://localhost:$1$path" 2>/dev/null)" || return 0
  [ -n "$body" ] || return 0
  printf '%s' "$body" | node -e '
    let raw = "";
    process.stdin.on("data", (chunk) => { raw += chunk });
    process.stdin.on("end", () => {
      let answer;
      try { answer = JSON.parse(raw) } catch { process.exit(0) }
      if (!answer || !Number.isInteger(answer.pid) || answer.pid <= 0) process.exit(0);
      if (Number(answer.port) !== Number(process.argv[1])) process.exit(0);
      process.stdout.write(String(answer.pid));
    });
  ' "$1"
}

# The pid serving on a port: what the service says about itself first — live if it can be
# asked, otherwise from the file it wrote at boot — and the OS probe only as a fallback.
# Prints two space-separated fields — `<pid> <source>`, where source is `self` or `probe` —
# so the caller can tell a report from an inference; the pid alone would make the two look
# identical. Both services in this stack are queried this way, so neither pid is inferred
# from a probe the kernel may refuse to answer. Callers read it the way dev-up already reads
# the DATABASE_URL parse:
#
#   read -r PID_DEV SERVER_PID_SOURCE <<<"$(service_pid "$APP_PORT" "$SERVER_PID_FILE" "$ROOT" "$SERVER_IDENTITY_PATH")"
#
# (Two fields rather than a global, because a global set inside a `$(...)` subshell
# would be lost by the time the caller looked at it.) Empty pid and empty source mean
# neither route named one.
#
# `$3` is the directory the service runs in, which is what its claim is checked against:
# the app runs from the checkout root, the socket mini-service from its own package
# directory, and a claim naming some other directory is ignored rather than believed.
#
# `$4` is that service's identity path, and passing it changes the trust model: the claim
# stops being the answer and becomes corroboration of the live one. A claim that disagrees
# with the live answer is stale by definition — the process holding the port said otherwise —
# so it is reported and discarded, which is what closes the "killed service, recycled pid"
# hole a file cannot close by itself. A service that cannot be asked live (the socket
# mini-service has no HTTP route of its own) keeps the file route unchanged, because there
# is nothing better to check it against.
service_pid() { # $1 port, $2 published-pid file (may be empty), $3 the service's directory, $4 identity path (empty when it has none)
  local claimed answered probed
  claimed="$(published_pid "$2" "$1" "$3")"

  if [ -n "${4:-}" ]; then
    answered="$(answered_pid "$1" "$4")"
    if [ -n "$answered" ]; then
      if [ -n "$claimed" ] && [ "$claimed" != "$answered" ]; then
        warn "$2 names pid $claimed, but whatever is serving :$1 reports pid $answered — using the live answer and treating that claim as stale (that is how a file lies: a pid recycled after a hard kill)"
      fi
      printf '%s self' "$answered"
      return 0
    fi
    # Nothing on that port answers its identity route, so this claim cannot be confirmed —
    # an older build, or a different program on the port entirely. An unconfirmable claim is
    # not believed; the probe below may still name the holder, or say nobody will.
    claimed=""
  fi

  if [ -n "$claimed" ]; then
    printf '%s self' "$claimed"
    return 0
  fi
  probed="$(listener_pid "$1")"
  [ -n "$probed" ] || return 0
  printf '%s probe' "$probed"
}

# ------------------------------------------- is a running service running old code?

# The files a service read once and will never read again: what makes "the source changed"
# a question with an answer, and deliberately narrower than "anything under src/".
#
# A dev server compiles `src/**` as it changes, so an edit there reaches the running process
# and warning about it would be noise — noise is what makes a warning people stop reading. What
# it does *not* re-read is what it took at boot: the environment (a module captures what it read
# at import: `DATABASE_URL` into the Prisma client, the relay URL into the socket client, and
# Prisma's query engine with it), `package.json`, the Prisma schema and the generated client,
# and `src/instrumentation.ts`, which Next runs once per server. Config files are here for the
# same reason even though Next usually restarts itself when one changes: if it did, the new
# process is younger than the file and this says nothing (see `stale_since_start`).
#
# The socket mini-service is the simple case — it is executed from source with no watcher at
# all, so any file under its own directory, or the one module it imports from outside it,
# leaves a running copy behind its own source.
#
# Paths are relative to the checkout root; directories are walked (skipping dependencies,
# build output and the database cluster).
APP_RESTART_INPUTS=(
  .env.local
  next.config.ts next.config.js next.config.mjs
  tsconfig.json
  package.json
  prisma/schema.prisma
  src/generated/prisma
  src/instrumentation.ts
)
SOCKET_RESTART_INPUTS=(
  mini-services/attendance-socket
  src/lib/service-identity.ts
  .env.local
)

# Both services are replaced by the same command, so how to get rid of a stale one is spelled
# once. Printed in the warning, carried in `--json`, quoted in the docs.
RESTART_CMD="npm run dev:down && npm run dev:up"

# The newest restart-required input that changed after a boot marker.
#
# Prints `<changed at ISO>TAB<how long after the start>TAB<path>` — the pieces the warning and
# the `--json` fields are both built from, so the sentence a human reads and the fields a script
# reads cannot disagree. Tab-separated because a path may contain spaces. Nothing at all means
# no input is newer than the marker, which is the ordinary case.
#
# Timestamps only: a file modified in the same instant the service booted is not evidence of
# anything, so the comparison is strict. Clock granularity makes that a conservative test, which
# is the right way round for a warning.
newest_change_since() { # $1 boot marker (ISO), $2.. restart-required inputs, relative to $ROOT
  [ -n "$1" ] || return 0
  node -e '
    const fs = require("fs");
    const path = require("path");
    const [root, startedAt, ...inputs] = process.argv.slice(1);
    const since = Date.parse(startedAt);
    if (Number.isNaN(since)) process.exit(0);
    // Never source: dependencies, build output, the database cluster, and the logs beside them.
    const SKIP = new Set(["node_modules", ".git", ".next", ".turbo", "local-pg", ".freebuff"]);
    let newest = null;
    const consider = (file) => {
      let st;
      try { st = fs.statSync(file) } catch { return }
      if (!st.isFile() || !(st.mtimeMs > since)) return;
      if (!newest || st.mtimeMs > newest.mtimeMs) newest = { mtimeMs: st.mtimeMs, file };
    };
    const walk = (dir, depth) => {
      if (depth > 8) return;
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (SKIP.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, depth + 1);
        else consider(full);
      }
    };
    for (const input of inputs) {
      const full = path.resolve(root, input);
      let st;
      try { st = fs.statSync(full) } catch { continue }
      if (st.isDirectory()) walk(full, 0);
      else consider(full);
    }
    if (!newest) process.exit(0);
    // Two units at most: "13m" reads, "13m 42s" is more than a warning needs.
    const units = [["d", 864e5], ["h", 36e5], ["m", 6e4], ["s", 1e3]];
    const parts = [];
    let left = newest.mtimeMs - since;
    for (const [label, size] of units) {
      const count = Math.floor(left / size);
      if (count > 0) { parts.push(count + label); left -= count * size; }
      if (parts.length === 2) break;
    }
    process.stdout.write([
      new Date(newest.mtimeMs).toISOString(),
      parts.join(" ") || "0s",
      path.relative(root, newest.file).split(path.sep).join("/"),
    ].join("\t"));
  ' "$ROOT" "$1" "${@:2}" 2>/dev/null
}

# Was the process a claim describes started before the source it runs changed?
#
# Prints `<boot marker>TAB<changed at>TAB<how long after>TAB<path>`, with the last three empty
# when nothing changed — the marker is printed either way, so a caller can tell "checked, and
# current" from "nothing to check against", which one empty answer could not express. No output
# at all means the second: a service that published no boot marker (an older build, a claim
# whose file was removed, or one naming another port or checkout and refused by `claim_field`)
# is not "current", it is unknown, and the honest report says which.
stale_since_start() { # $1 claim file, $2 port, $3 the service's directory, $4.. restart-required inputs
  local started changed
  started="$(claim_field "$1" "$2" "$3" startedAt)"
  [ -n "$started" ] || return 0
  changed="$(newest_change_since "$started" "${@:4}")"
  printf '%s\t%s\n' "$started" "$changed"
}

# Why a newer input means a restart, in the service's own terms. Not one shared sentence: one
# service has a compiler that re-reads most of its tree, the other has no watcher at all.
stale_reason() { # $1 the service's name, as it publishes it
  case "$1" in
    dev-server) printf 'Next recompiles src/** as it changes, but reads the environment, the config and instrumentation once, at boot' ;;
    attendance-socket) printf 'it runs from source with no watcher, so nothing re-reads a file once the process is up' ;;
    *) printf 'the running process does not re-read this file' ;;
  esac
}

# Where a pid came from, in words, for anyone reading the summary. `$2` names the thing
# that reported, because two services report now and "by the server" would be wrong for one
# of them.
pid_source_text() { # $1 source, $2 what to call it (default: the server)
  case "$1" in
    self) printf 'self-reported by %s' "${2:-the server}" ;;
    probe) printf 'named by the OS probe' ;;
    *) printf 'source unknown' ;;
  esac
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
# there, Next booted ("Ready in 1398ms") and the relay connected, yet the loop
# never saw a *named* listener and failed a stack that was up. Naming the pid stays
# listener_pid's job; "is someone there" is port_taken's, which is what this is
# asking. (What the naming routes report on a runner is settled by measurement now,
# not by this guess: the Port probe lab workflow prints all of them side by side.)
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
