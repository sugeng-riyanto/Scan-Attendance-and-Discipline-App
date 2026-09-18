#!/usr/bin/env bash
#
# dev-down.sh — stop exactly what dev-up.sh started in this checkout.
#
# The flip side of `npm run dev:up`, and deliberately narrow:
#
#   * it stops the supervisor **first** — the process dev-up hands the stack to, which
#     puts a dead service back by running dev-up again. Stopping the services first would
#     have it repair them a few seconds later, which looks exactly like a stubborn leak;
#     a supervisor left running after its services would keep resurrecting them;
#   * it acts on the state dev-up recorded (.zscripts/dev-up.state.json), never
#     on a port sweep or a command-line pattern match;
#   * only a service that state marks `startedByDevUp: true` is a candidate. One
#     dev-up merely *found* running is reported and left alone, so a developer's
#     own PostgreSQL, a dev server started by hand, or a preview session's server
#     survives a `dev:down`;
#   * a candidate is stopped only while the recorded pid is still the process the
#     OS shows owning the recorded port. A pid that has since been recycled, or a
#     port someone else now serves, is reported — this script never kills an
#     unverified process;
#   * PostgreSQL gets a clean `pg_ctl stop -m fast` when the local cluster's tools
#     are present, so the next start does not have to run recovery.
#
# Safe to re-run, and safe to run when nothing is up: services whose process is
# already gone are reported and nothing else happens. Re-running is what a second
# `dev:down` is, and what CI relies on when a bring-up step failed before dev-up
# could write any state.
#
# Exit status is non-zero only when something this script owns is *still* serving
# its port after the attempt — a silent leak would be worse than a red run.
#
# Usage:
#   npm run dev:down                   # or: bash .zscripts/dev-down.sh
#   bash .zscripts/dev-down.sh --json  # machine-readable report on stdout
#
# Environment:
#   DEV_UP_LOG_DIR  the same override dev-up takes: read the record from there
#                   instead of .zscripts/, so a scratch stack can be torn down
#                   without touching the live one.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT" || exit 1
SELF="$SCRIPT_DIR/dev-down.sh"

# Paths, probes and output helpers shared with dev-up.sh — see lib-stack.sh.
# shellcheck source=.zscripts/lib-stack.sh
source "$SCRIPT_DIR/lib-stack.sh"

JSON=0
for arg in "$@"; do
  case "$arg" in
    --json) JSON=1 ;;
    -h|--help)
      usage "$SELF"
      exit 0
      ;;
    *) printf 'unknown option: %s (try --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

command -v node >/dev/null 2>&1 || fail "node is required but is not on PATH"
if [ "$WINDOWS" != 1 ] && ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
  fail "need either lsof or ss to tell which process owns a port"
fi

PG_DIR="$ROOT/local-pg"
PG_CTL="$PG_DIR/pgsql/bin/pg_ctl$EXE"
# Where the socket service runs from, which is the directory its own claim about itself
# names — so a claim left by a service started elsewhere is not this run's to delete.
SOCKET_DIR="$ROOT/mini-services/attendance-socket"

# -------------------------------------------------------------------- the record

# name, port, pid, supervisor, "started by dev-up" — one line per service. Node
# reads the state file (the same reader pattern dev-up uses to write it), and the
# checkout check matters: a state file from another worktree must not be acted on.
read_state_rows() {
  STATE_ROOT="$ROOT" node -e '
    const fs = require("fs");
    const file = process.argv[1];
    let state;
    try {
      state = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (err) {
      console.error("cannot read " + file + ": " + err.message);
      process.exit(3);
    }
    // The two sides of this comparison reach node by different routes, and on
    // Windows/MSYS one of them gets path-converted (F:/… ) while the other stays
    // POSIX (/f/…). Compare them normalised rather than trusting either spelling.
    const norm = (p) =>
      String(p)
        .replace(/\\/g, "/")
        .replace(/^([A-Za-z]):\//, (m, drive) => "/" + drive.toLowerCase() + "/")
        .replace(/\/+$/, "")
        .toLowerCase();
    if (norm(state.root) !== norm(process.env.STATE_ROOT)) {
      console.error("that state belongs to " + state.root + ", not " + process.env.STATE_ROOT);
      process.exit(4);
    }
    for (const [name, s] of Object.entries(state.services || {})) {
      console.log([name, s.port ?? "", s.pid ?? "", s.supervisor ?? "", s.startedByDevUp ? 1 : 0].join("\t"));
    }
  ' "$(native_path "$STATE_FILE")"
}

# --------------------------------------------------------------- what it decided

ACT_SUP=""; WHY_SUP=""; SUP_PID_SEEN=""; SUP_RESTARTS=""
ACT_DEV=""; WHY_DEV=""; DEV_PORT=""; DEV_PID=""
ACT_SOCKET=""; WHY_SOCKET=""; SOCKET_PORT_SEEN=""; SOCKET_PID_SEEN=""
ACT_PG=""; WHY_PG=""; PG_PORT=""; PG_PID=""

set_action() { # $1 name, $2 action, $3 reason
  case "$1" in
    dev) ACT_DEV="$2"; WHY_DEV="$3" ;;
    socket) ACT_SOCKET="$2"; WHY_SOCKET="$3" ;;
    postgres) ACT_PG="$2"; WHY_PG="$3" ;;
  esac
}

# The recorded row for one service: name, port, pid, supervisor, ours.
row_for() { # $1 name
  printf '%s\n' "${rows:-}" | awk -F'\t' -v want="$1" '$1 == want { print; exit }'
}

service_label() { # $1 name
  case "$1" in
    dev) printf 'dev server' ;;
    socket) printf 'live-update socket service' ;;
    postgres) printf 'PostgreSQL' ;;
    *) printf '%s' "$1" ;;
  esac
}

# Stop one service, and only ever by the pid the record names. Success is judged
# by the port: "I sent a signal" is not the same as "it is gone".
stop_service() { # $1 name, $2 port, $3 pid, $4 supervisor
  local name="$1" port="$2" pid="$3" sup="$4"
  if [ "$name" = "postgres" ] && [ -x "$PG_CTL" ]; then
    info "pg_ctl -m fast stop (clean shutdown, so the next start needs no recovery)"
    "$PG_CTL" -D "$PG_DIR/data" -m fast -w stop >/dev/null 2>&1 || true
  fi
  if port_taken "$port"; then
    info "stopping pid $pid${sup:+ (spawned from $sup)}"
    kill_tree "$pid"
  fi
  if wait_for_port_free "$port" 10; then
    # The supervisor is only ever killed after its child was verified as ours and
    # stopped, so this pid cannot have been recycled while that child was alive.
    if [ -n "$sup" ] && [ "$sup" != "$pid" ]; then kill_tree "$sup"; fi
    return 0
  fi
  warn ":$port is still served after a clean stop — forcing pid $pid"
  force_kill_tree "$pid"
  if [ -n "$sup" ] && [ "$sup" != "$pid" ]; then force_kill_tree "$sup"; fi
  wait_for_port_free "$port" 10
}

# -------------------------------------------------------------------- the run

note "dev-down — $ROOT"
note "  state: $(native_path "$STATE_FILE")"
note "  logs:  $(native_path "$DEV_LOG")  ·  $(native_path "$SOCKET_LOG")"

# ----------------------------------------------------------------- the supervisor

# Stopped before anything else is touched, and for a reason that is invisible until it bites:
# the supervisor's whole job is to notice a service that stopped being served and start it
# again, so a dev-down that stopped the services first would watch them come straight back.
# It is the stack's own process, so it goes first and the services it was watching go after.
#
# Two sources have to agree before anything is killed: the pid dev-up recorded, and the
# supervisor's own record naming this checkout. Either side alone can be stale (a state file
# from before a restart, a record whose process has exited and whose pid was recycled), and a
# supervisor is a process nobody wants killed by inference.
supervisor_pid_recorded() {
  node -e '
    const fs = require("fs");
    try {
      const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const pid = state.supervisor && state.supervisor.pid;
      if (Number.isInteger(pid) && pid > 0) process.stdout.write(String(pid));
    } catch (error) {}
  ' "$(native_path "$STATE_FILE")" 2>/dev/null
}

if [ ! -f "$STATE_FILE" ]; then
  ACT_SUP="absent"; WHY_SUP="no state file"
else
  recorded="$(supervisor_pid_recorded)"
  live="$(supervisor_pid "$SUPERVISOR_STATE" "$ROOT")"
  SUP_RESTARTS="$(supervisor_field "$SUPERVISOR_STATE" "$ROOT" restarts.total)"
  step "supervisor"
  if [ -z "$recorded" ] && [ -z "$live" ]; then
    info "none recorded for this checkout"
    ACT_SUP="absent"; WHY_SUP="none recorded"
  elif [ -z "$live" ]; then
    # The record survives a supervisor that died on its own (it is removed only on a clean
    # exit), so a recorded pid with no live record means it is already gone.
    info "already down: pid $recorded is not watching any more (no record of it)"
    ACT_SUP="already-down"; WHY_SUP="its own record is gone"
    rm -f "$SUPERVISOR_STATE"
  elif [ -n "$recorded" ] && [ "$recorded" != "$live" ]; then
    info "left alone: the state file names pid $recorded, but pid $live is what is watching this checkout"
    warn "not killing a pid the record does not match — the next dev:up will reconcile them"
    ACT_SUP="left-alone"; WHY_SUP="recorded pid does not match the live record"
  else
    SUP_PID_SEEN="$live"
    info "stopping pid $live (it has restarted something ${SUP_RESTARTS:-0}× in this stack)"
    kill_tree "$live"
    # Waited for by *process*, never by its record — the record can go first, and it used to:
    # a supervisor between checks is inside a foreground sleep, bash defers a trap until that
    # finishes, so an earlier version saw the record disappear and reported `stopped` about a
    # process that was still running (the runner reaped it as an orphan at the end of the job).
    # A few seconds of patience here is normal rather than a refusal.
    waited=0
    while [ "$waited" -lt 5 ] && pid_alive "$live"; do
      sleep 1
      waited=$((waited + 1))
    done
    if pid_alive "$live"; then
      info "  still alive after ${waited}s (a supervisor can be mid-repair) — forcing the tree"
      force_kill_tree "$live"
      waited=0
      while [ "$waited" -lt 5 ] && pid_alive "$live"; do
        sleep 1
        waited=$((waited + 1))
      done
    fi
    if pid_alive "$live"; then
      # Nothing else here can stop it, and it will put this stack back up a few seconds from
      # now — which is worth a non-zero exit rather than a reassuring word.
      warn "pid $live is still running after both attempts, and it will put the services back up"
      ACT_SUP="failed"; WHY_SUP="still running after a forced stop"
    else
      ACT_SUP="stopped"
      # A forced stop never runs the exit cleanup, so the record can outlive the process that
      # wrote it — removed here, but only if it is still the one this run stopped.
      if [ -f "$SUPERVISOR_STATE" ] && [ "$(supervisor_field "$SUPERVISOR_STATE" "$ROOT" pid 0)" = "$live" ]; then
        rm -f "$SUPERVISOR_STATE"
      fi
    fi
  fi
fi

if [ ! -f "$STATE_FILE" ]; then
  note ""
  note "Nothing to stop: no state file, so dev-up has not started anything here"
  note "(or a previous dev-down already cleaned up)."
else
  rows="$(read_state_rows)"
  status=$?
  case "$status" in
    0) ;;
    3) fail "the state file is not valid JSON — delete $(native_path "$STATE_FILE") if the stack is really gone, then run dev:up again" ;;
    4) fail "that state file belongs to another checkout (see above) — refusing to act on it" ;;
    *) fail "could not read the state file" ;;
  esac

  # App first, then the socket, then the database: stopping the app before its
  # dependencies keeps every intermediate moment a working stack.
  for name in dev socket postgres; do
    row="$(printf '%s\n' "$rows" | awk -F'\t' -v want="$name" '$1 == want { print; exit }')"
    [ -n "$row" ] || continue
    port="$(printf '%s' "$row" | cut -f2)"
    pid="$(printf '%s' "$row" | cut -f3)"
    sup="$(printf '%s' "$row" | cut -f4)"
    ours="$(printf '%s' "$row" | cut -f5)"
    label="$(service_label "$name")"
    case "$name" in
      dev) DEV_PORT="$port"; DEV_PID="$pid" ;;
      socket) SOCKET_PORT_SEEN="$port"; SOCKET_PID_SEEN="$pid" ;;
      postgres) PG_PORT="$port"; PG_PID="$pid" ;;
    esac

    step "$label${port:+ :$port}"

    if [ "$ours" != "1" ]; then
      info "left alone: dev-up found this one already running, so it is not ours to stop"
      set_action "$name" "left-alone" "not started by dev-up"
    elif [ -z "$pid" ] || [ -z "$port" ]; then
      info "left alone: the record has no pid for it"
      set_action "$name" "left-alone" "no pid recorded"
    else
      owner="$(listener_pid "$port")"
      if [ -z "$owner" ]; then
        info "already down: nothing is listening on :$port (recorded pid $pid)"
        set_action "$name" "already-down" "nothing listening"
      elif [ "$owner" != "$pid" ]; then
        info "left alone: pid $owner is on :$port, not the recorded pid $pid"
        warn "not killing a pid the record does not match — check what is running there"
        set_action "$name" "left-alone" "recorded pid does not own the port"
      elif stop_service "$name" "$port" "$pid" "$sup"; then
        info "stopped: :$port is free"
        set_action "$name" "stopped" ""
      else
        warn "pid $pid is still serving :$port — it ignored both attempts"
        set_action "$name" "failed" "still listening after a forced stop"
      fi
    fi
  done
fi

# The pid file describes the app-port listener only, so it is removed only when
# that listener is known to be gone; a service this script left alone keeps it.
PIDFILE_REMOVED=false
SERVER_PIDFILE_REMOVED=false
SOCKET_PIDFILE_REMOVED=false
if [ -f "$PID_FILE" ] && { [ "$ACT_DEV" = "stopped" ] || [ "$ACT_DEV" = "already-down" ]; }; then
  rm -f "$PID_FILE" && PIDFILE_REMOVED=true
fi

# Each service's own report goes with it — but only the claim that belongs to the process
# this run stopped, so one written by a different service (another checkout, another port)
# is left where it is. Removing them here matters because a killed service cannot clean up
# after itself: its exit handler never runs, and a stale claim naming a since-recycled pid
# is the one way the file route can be wrong. Same pids, same reason, as the pid file above.
#
# A claim left by a service that died on its own is not removed here (there is no recorded
# pid that still matches one), but it is also harmless: the next `dev:up` rejects it unless
# the pid is alive, and the next boot overwrites it.
if [ -f "$SERVER_PID_FILE" ] && [ -n "$DEV_PID" ] && [ -n "$DEV_PORT" ] && \
   [ "$ACT_DEV" = "stopped" ] && \
   [ "$(published_pid "$SERVER_PID_FILE" "$DEV_PORT" "$ROOT" 0)" = "$DEV_PID" ]; then
  rm -f "$SERVER_PID_FILE" && SERVER_PIDFILE_REMOVED=true
fi

if [ -f "$SOCKET_PID_FILE" ] && [ -n "$SOCKET_PID_SEEN" ] && [ -n "$SOCKET_PORT_SEEN" ] && \
   [ "$ACT_SOCKET" = "stopped" ] && \
   [ "$(published_pid "$SOCKET_PID_FILE" "$SOCKET_PORT_SEEN" "$SOCKET_DIR" 0)" = "$SOCKET_PID_SEEN" ]; then
  rm -f "$SOCKET_PID_FILE" && SOCKET_PIDFILE_REMOVED=true
fi

# ------------------------------------------------------------------- the report

# Which recorded ports are still served afterwards — the answer a caller (or CI)
# actually cares about, whichever outcome produced it. Two lists, because they mean
# opposite things: STILL is every recorded port still listening (a service dev-up
# merely *found* is meant to stay), LEAKED is narrower — a service this script owns
# and tried to stop that is still there, which is the only outcome it exits non-zero
# for. Reporting them as one number is how "we left your Postgres alone" reads like
# "a process escaped".
STILL=""
LEAKED=""
for name in dev socket postgres; do
  port="$(row_for "$name" | cut -f2)"
  [ -n "$port" ] || continue
  port_taken "$port" || continue
  STILL="$STILL$port "
  case "$name" in
    dev) action="$ACT_DEV" ;;
    socket) action="$ACT_SOCKET" ;;
    postgres) action="$ACT_PG" ;;
  esac
  [ "$action" = "failed" ] && LEAKED="$LEAKED$port "
done

build_down_report() {
  REP_ROOT="$ROOT" REP_STATE_FILE="$STATE_FILE" REP_PID_FILE="$PID_FILE"
  REP_SERVER_PID_FILE="$SERVER_PID_FILE"
  REP_SERVER_PIDFILE_REMOVED="$SERVER_PIDFILE_REMOVED"
  REP_SOCKET_PID_FILE="$SOCKET_PID_FILE"
  REP_SOCKET_PIDFILE_REMOVED="$SOCKET_PIDFILE_REMOVED"
  REP_WRITTEN="$(date -u +%FT%TZ)" REP_PIDFILE_REMOVED="$PIDFILE_REMOVED" REP_STILL="$STILL"
  REP_LEAKED="$LEAKED"
  REP_DEV_ACTION="$ACT_DEV" REP_DEV_REASON="$WHY_DEV" REP_DEV_PORT="$DEV_PORT" REP_DEV_PID="$DEV_PID"
  REP_SUP_ACTION="$ACT_SUP" REP_SUP_REASON="$WHY_SUP" REP_SUP_PID="$SUP_PID_SEEN" REP_SUP_RESTARTS="$SUP_RESTARTS"
  REP_SUPERVISOR_STATE_FILE="$SUPERVISOR_STATE"
  REP_SOCKET_ACTION="$ACT_SOCKET" REP_SOCKET_REASON="$WHY_SOCKET"
  REP_SOCKET_PORT="$SOCKET_PORT_SEEN" REP_SOCKET_PID="$SOCKET_PID_SEEN"
  REP_PG_ACTION="$ACT_PG" REP_PG_REASON="$WHY_PG" REP_PG_PORT="$PG_PORT" REP_PG_PID="$PG_PID"
  export REP_ROOT REP_STATE_FILE REP_PID_FILE REP_WRITTEN REP_PIDFILE_REMOVED REP_STILL REP_LEAKED
  export REP_SERVER_PID_FILE REP_SERVER_PIDFILE_REMOVED
  export REP_SOCKET_PID_FILE REP_SOCKET_PIDFILE_REMOVED
  export REP_DEV_ACTION REP_DEV_REASON REP_DEV_PORT REP_DEV_PID
  export REP_SUP_ACTION REP_SUP_REASON REP_SUP_PID REP_SUP_RESTARTS REP_SUPERVISOR_STATE_FILE
  export REP_SOCKET_ACTION REP_SOCKET_REASON REP_SOCKET_PORT REP_SOCKET_PID
  export REP_PG_ACTION REP_PG_REASON REP_PG_PORT REP_PG_PID
  node -e '
    const e = process.env;
    const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
    const services = {};
    const add = (name, action, reason, port, pid) => {
      if (!action) return;
      services[name] = { port: num(port), pid: num(pid), action, reason: reason || null };
    };
    add("postgres", e.REP_PG_ACTION, e.REP_PG_REASON, e.REP_PG_PORT, e.REP_PG_PID);
    add("socket", e.REP_SOCKET_ACTION, e.REP_SOCKET_REASON, e.REP_SOCKET_PORT, e.REP_SOCKET_PID);
    add("dev", e.REP_DEV_ACTION, e.REP_DEV_REASON, e.REP_DEV_PORT, e.REP_DEV_PID);
    const report = {
      root: e.REP_ROOT,
      written: e.REP_WRITTEN,
      stateFile: e.REP_STATE_FILE,
      pidFile: e.REP_PID_FILE,
      pidFileRemoved: e.REP_PIDFILE_REMOVED === "true",
      // The boot-time reports the services publish about themselves, each removed only
      // when this run stopped the very process it describes (null path: no such file
      // involved).
      serverPidFile: e.REP_SERVER_PID_FILE || null,
      serverPidFileRemoved: e.REP_SERVER_PIDFILE_REMOVED === "true",
      socketPidFile: e.REP_SOCKET_PID_FILE || null,
      socketPidFileRemoved: e.REP_SOCKET_PIDFILE_REMOVED === "true",
      // What was watching before this ran, and what happened to it. Reported first because
      // it is the one thing here that had to be stopped *before* the services: a supervisor
      // still running would have restarted them again, a few seconds behind this run.
      supervisor: {
        action: e.REP_SUP_ACTION || null,
        reason: e.REP_SUP_REASON || null,
        pid: num(e.REP_SUP_PID),
        // How many times it had repaired this stack before being stopped — the count
        // dev-down is the last chance to see, since the record goes with the process.
        restarts: num(e.REP_SUP_RESTARTS),
        record: e.REP_SUPERVISOR_STATE_FILE || null,
      },
      services,
      stopped: Object.keys(services).filter((n) => services[n].action === "stopped"),
      // stillListening: every recorded port still served (services left alone are
      // meant to be here). leaked: the subset this script owns and could not stop,
      // which is also what makes the exit status non-zero.
      stillListening: (e.REP_STILL || "").split(" ").filter(Boolean).map(Number),
      leaked: (e.REP_LEAKED || "").split(" ").filter(Boolean).map(Number),
    };
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  '
}

action_text() { # $1 action
  case "$1" in
    stopped) printf 'stopped' ;;
    left-alone) printf 'left alone' ;;
    already-down) printf 'already down' ;;
    failed) printf 'STILL RUNNING' ;;
    absent) printf 'none for this checkout' ;;
    *) printf 'not in the state' ;;
  esac
}

print_summary() {
  printf '\n%s\n' "──────────────────────────────────────────────────────────────"
  printf '  %-12s %-7s %-8s %s\n' service port pid action
  for pair in "PostgreSQL:postgres:$ACT_PG" "socket.io:socket:$ACT_SOCKET" "dev-server:dev:$ACT_DEV"; do
    name="$(printf '%s' "$pair" | cut -d: -f2)"
    row="$(row_for "$name")"
    printf '  %-12s %-7s %-8s %s\n' \
      "$(printf '%s' "$pair" | cut -d: -f1)" \
      "$(printf '%s' "$row" | cut -f2 | sed 's/^$/-/')" \
      "$(printf '%s' "$row" | cut -f3 | sed 's/^$/-/')" \
      "$(action_text "$(printf '%s' "$pair" | cut -d: -f3)")"
  done
  printf '%s\n' "──────────────────────────────────────────────────────────────"
  if [ "$PIDFILE_REMOVED" = true ]; then
    printf '  %s\n' "removed $(native_path "$PID_FILE") (its listener is gone)"
  fi
  if [ "$SERVER_PIDFILE_REMOVED" = true ]; then
    printf '  %s\n' "removed $(native_path "$SERVER_PID_FILE") (and the claim it made about the server)"
  fi
  if [ "$SOCKET_PIDFILE_REMOVED" = true ]; then
    printf '  %s\n' "removed $(native_path "$SOCKET_PID_FILE") (and the claim it made about the socket service)"
  fi
  sup_row="$(action_text "$ACT_SUP")"
  printf '  %s\n' "supervisor: $sup_row${SUP_PID_SEEN:+ (pid $SUP_PID_SEEN)}"$([ -n "$SUP_RESTARTS" ] && printf ' — it had restarted %s×' "$SUP_RESTARTS")
  if [ -n "$LEAKED" ]; then
    printf '  %s\n' "STILL SERVING after a forced stop: ${LEAKED% }"
  elif [ -n "$STILL" ]; then
    printf '  %s\n' "still serving (left alone, not started by dev-up): ${STILL% }"
  else
    printf '  %s\n' "nothing this script owns is serving a port"
  fi
}

REPORT="$(build_down_report)"

if [ "$JSON" = 1 ]; then print_summary >&2; else print_summary; fi

# A supervisor that would not stop counts as a failure of this teardown even though it owns
# no port: it is the one thing here that will put the services back up, and reporting success
# while it is still running is exactly the kind of reassurance this script avoids elsewhere.
FAILED=0
for a in "$ACT_DEV" "$ACT_SOCKET" "$ACT_PG" "$ACT_SUP"; do
  [ "$a" = "failed" ] && FAILED=1
done

if [ "$JSON" = 1 ]; then printf '%s\n' "$REPORT"; fi

exit "$FAILED"
