#!/usr/bin/env bash
#
# dev-supervise.sh — keep this checkout's stack up, and write down what it had to do.
#
# `dev-up` used to be start-and-forget: it spawned the dev server and the socket
# mini-service, confirmed both were up, printed a summary and left. If either died
# afterwards, nothing noticed — and the failure that motivated this script is the quiet
# one: the relay on :3003 dies, the app on :3000 keeps answering, a Preview tab looks fine,
# and no dashboard ever updates again. A dead relay behind a working app is
# indistinguishable from a working one until someone waits for a live number to move.
#
# So one process now watches both ports for as long as the stack is meant to be up. It is
# started by `dev-up` (see the supervisor step there) and stopped by `dev-down`, which
# stops it *first*: a supervisor that outlived its services would resurrect them.
#
# What it is, and what it deliberately is not:
#
#   * One supervisor for both services, not one per service, because they are one stack —
#     so the report is one line in the next `dev:up` summary rather than two that can
#     disagree about the same minute.
#
#   * It repairs by running **the script a developer runs**: `.zscripts/dev-up.sh
#     --no-schema --json --no-supervise`, which is idempotent by contract and already knows
#     how to start exactly the service that is missing while leaving the rest alone. There
#     is no second copy of the start commands here to drift from the first, and a restart
#     goes through the same claims, the same pid resolution and the same state file as a
#     manual bring-up. Spawning the services here instead would mean this script owning
#     pids, claims and logs that dev-up already owns.
#
#   * "Crashed" means *the port stopped being served* — the only failure it can diagnose
#     with certainty. It is not a health check: an app answering 500s is up, and a relay
#     that is listening but never connected (a missing `SOCKET_RELAY_TOKEN`, which dev-up
#     warns about when it starts one) is up too. Watching for those would mean guessing at
#     what each service should be saying.
#
#   * Bounded, because a repair loop that runs forever is worse than the crash. A service
#     that will not come back is retried on an exponential backoff, and after
#     DEV_SUPERVISE_MAX_FAILURES consecutive failures the retry interval drops to
#     DEV_SUPERVISE_COOLDOWN seconds and the record says so. Nothing waits inside the
#     watch loop — a service being repaired never stops the other one being watched — so
#     the backoff is a deadline per service rather than a sleep.
#
#   * It does not restart PostgreSQL. The database is started by `dev-up` and stopped with
#     `pg_ctl -m fast`; deciding unattended that a database process should come back is not
#     a repair this script is willing to make.
#
# Every detection, restart and failure is one timestamped line in
# `.zscripts/dev-supervisor.log`, and the counts are in the record the next `dev:up` and
# `dev:down` read, so a restart cannot happen silently.
#
# Environment (dev-up passes the first three so a scratch stack's supervisor watches the
# scratch ports and writes beside the scratch logs):
#   DEV_UP_LOG_DIR          where the record and the log go (default .zscripts/)
#   SUPERVISE_APP_PORT      the dev server port to watch (default 3000, as dev-up resolved it)
#   SUPERVISE_SOCKET_PORT   the socket service port to watch (default 3003)
#   DEV_SUPERVISE_INTERVAL  seconds between checks (default 10)
#   DEV_SUPERVISE_MAX_FAILURES  consecutive failed repairs before slowing down (default 5)
#   DEV_SUPERVISE_COOLDOWN  seconds between attempts once it has slowed down (default 300)
#
# Started detached by dev-up. Not meant to be run in the foreground by hand, since it never
# exits on its own — `npm run dev:down` is how you are rid of it.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT" || exit 1
SELF="$SCRIPT_DIR/dev-supervise.sh"

# Paths, probes and the kill helpers shared with dev-up.sh / dev-down.sh — see
# lib-stack.sh.
#
# JSON=1 on purpose, and it is about *which stream* carries what. In this mode lib-stack
# routes its human-facing output to stderr, and dev-up starts this script with both streams
# going to the same log file — so nothing is lost, while stdout is left free for the one kind
# of output a caller captures: the value of a command substitution. A helper that printed to
# stdout while being captured would put its own words into the variable, which is exactly the
# bug this comment exists to keep fixed (the first live repair logged `back up ... (pid 20:…
# repairing with: … 7808)` — the pid, the log line and all).
# shellcheck source=.zscripts/lib-stack.sh
JSON=1
source "$SCRIPT_DIR/lib-stack.sh"
mkdir -p "$LOG_DIR"

INTERVAL="${DEV_SUPERVISE_INTERVAL:-10}"
MAX_FAILURES="${DEV_SUPERVISE_MAX_FAILURES:-5}"
COOLDOWN="${DEV_SUPERVISE_COOLDOWN:-300}"
APP_PORT="${SUPERVISE_APP_PORT:-3000}"
SOCKET_PORT="${SUPERVISE_SOCKET_PORT:-3003}"

# Which pid to publish about ourselves — and it is not `$$`.
#
# Under Git Bash, `$$` is an MSYS pid: a number in that shell's own table that no Windows
# process can see. `process.kill(pid, 0)` says "no such process", and `taskkill /PID` — which
# is how dev-down stops a process tree on Windows — finds nothing either. So a supervisor
# reporting `$$` would be a supervisor every reader is entitled to dismiss as gone, which is
# what the first live run did: dev-up refused its own record and said so.
#
# MSYS keeps the OS's number in `/proc/<pid>/winpid`, so that is what gets published: the
# number the OS itself uses, which is the entire point of a service reporting about itself.
# Absent on Linux (`$$` is already the right answer there) and on any shell without it.
SELF_PID="$$"
if [ -r "/proc/$$/winpid" ]; then
  SELF_PID="$(tr -d ' \r\n' <"/proc/$$/winpid")"
fi

# The record dev-up and dev-down read. Kept apart from the *log* on purpose: the record
# describes a process that is running (and is removed when this one exits cleanly, like the
# services' own claims), while the log is the history of what it did and outlives it.
RECORD="$SUPERVISOR_STATE"
EVENTS="$LOG_DIR/dev-supervisor.events.jsonl"
: >"$EVENTS"

# Per-service watch state. `FAILED_*` is consecutive failed repairs; `REPORTED_*` says the
# current outage has already been announced, so a long outage is one event rather than one
# per interval; `NEXT_*` is the earliest epoch second a repair may be attempted again.
FAILED_DEV=0; FAILED_SOCKET=0
REPORTED_DEV=0; REPORTED_SOCKET=0
NEXT_DEV=0; NEXT_SOCKET=0
GAVE_UP=""
RESTARTS=0
STOPPING=0

# One timestamped line, on stderr: this script's log is its stderr (dev-up redirects it
# there), and stdout belongs to whatever a caller captures. See the JSON=1 note above.
logline() { # $1 message
  printf '[%s] %s\n' "$(date -u +%FT%TZ)" "$1" >&2
}

# One event, in both places: the human log's companion file and the machine-readable
# record. JSONL, so the record's counters and its `events` list are derived from one stream
# rather than maintained twice.
record_event() { # $1 service (dev|socket|-), $2 kind, $3 detail, $4 was-pid, $5 now-pid
  SERVICE="$1" KIND="$2" DETAIL="$3" WAS="${4:-}" NOW="${5:-}" node -e '
    const e = process.env;
    process.stdout.write(JSON.stringify({
      at: new Date().toISOString(),
      service: e.SERVICE,
      kind: e.KIND,
      detail: e.DETAIL,
      wasPid: e.WAS ? Number(e.WAS) : null,
      nowPid: e.NOW ? Number(e.NOW) : null,
    }) + "\n");
  ' >>"$EVENTS"
}

# The record, written atomically (temp file plus rename) so a reader never catches half a
# document — the rule the services' own claims follow, and for the same reason: dev-up and
# dev-down read this at arbitrary moments.
write_record() {
  RECORD_FILE="$RECORD" EVENTS_FILE="$EVENTS" PID="$SELF_PID" ROOT="$ROOT" \
    STARTED_AT="$STARTED_AT" INTERVAL="$INTERVAL" APP_PORT="$APP_PORT" SOCKET_PORT="$SOCKET_PORT" \
    FAILED_DEV="$FAILED_DEV" FAILED_SOCKET="$FAILED_SOCKET" GAVE_UP="$GAVE_UP" \
    RESTARTS="$RESTARTS" LOG="$SUPERVISOR_LOG" node -e '
    const fs = require("fs");
    const e = process.env;
    let events = [];
    try {
      events = fs.readFileSync(e.EVENTS_FILE, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    } catch (error) {}
    const count = (kind, service) =>
      events.filter((event) => event.kind === kind && (!service || event.service === service)).length;
    const last = events.length ? events[events.length - 1] : null;
    const record = {
      service: "dev-supervisor",
      pid: Number(e.PID),
      root: e.ROOT,
      startedAt: e.STARTED_AT,
      interval: Number(e.INTERVAL),
      watching: { app: Number(e.APP_PORT), socket: Number(e.SOCKET_PORT) },
      // How many times it put something back, in total and per service. This is the number
      // a reader actually wants: "was anything restarted while I was not looking?"
      restarts: {
        total: Number(e.RESTARTS),
        dev: count("restarted", "dev"),
        socket: count("restarted", "socket"),
      },
      // Consecutive failures *now*, not a total: what matters is whether this supervisor is
      // currently able to keep a service up. The history is in `events`.
      failures: { dev: Number(e.FAILED_DEV), socket: Number(e.FAILED_SOCKET) },
      // Services this supervisor has stopped retrying quickly, with its reason recorded
      // beside it in `events` (kind `gave-up`).
      gaveUp: (e.GAVE_UP || "").split(" ").filter(Boolean),
      lastEvent: last,
      // The last 20 only: enough for a summary and for the shape of an incident, and
      // bounded so a long-lived stack cannot grow this file forever.
      events: events.slice(-20),
      log: e.LOG,
    };
    const temp = e.RECORD_FILE + "." + e.PID + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(record, null, 2) + "\n");
    fs.renameSync(temp, e.RECORD_FILE);
  ' 2>/dev/null
}

port_label() { # $1 service
  case "$1" in
    dev) printf 'dev server' ;;
    socket) printf 'live-update socket service' ;;
    *) printf '%s' "$1" ;;
  esac
}

port_of() { case "$1" in dev) printf '%s' "$APP_PORT" ;; socket) printf '%s' "$SOCKET_PORT" ;; esac; }
failures_of() { case "$1" in dev) printf '%s' "$FAILED_DEV" ;; socket) printf '%s' "$FAILED_SOCKET" ;; esac; }
reported_of() { case "$1" in dev) printf '%s' "$REPORTED_DEV" ;; socket) printf '%s' "$REPORTED_SOCKET" ;; esac; }
next_of() { case "$1" in dev) printf '%s' "$NEXT_DEV" ;; socket) printf '%s' "$NEXT_SOCKET" ;; esac; }

set_failures() { case "$1" in dev) FAILED_DEV="$2" ;; socket) FAILED_SOCKET="$2" ;; esac; }
set_reported() { case "$1" in dev) REPORTED_DEV="$2" ;; socket) REPORTED_SOCKET="$2" ;; esac; }
set_next() { case "$1" in dev) NEXT_DEV="$2" ;; socket) NEXT_SOCKET="$2" ;; esac; }

gave_up() { case " $GAVE_UP " in *" $1 "*) return 0 ;; esac; return 1; }
give_up() { gave_up "$1" || GAVE_UP="${GAVE_UP:+$GAVE_UP }$1"; }

# The claim file, directory and identity route for a service — the same three answers dev-up
# resolves, needed again here because a repair is a bring-up.
claim_file_for() { case "$1" in dev) printf '%s' "$SERVER_PID_FILE" ;; socket) printf '%s' "$SOCKET_PID_FILE" ;; esac; }
service_dir_for() { case "$1" in dev) printf '%s' "$ROOT" ;; socket) printf '%s' "$ROOT/mini-services/attendance-socket" ;; esac; }
identity_path_for() { case "$1" in dev) printf '%s' "$SERVER_IDENTITY_PATH" ;; *) printf '' ;; esac; }

# The pid a service reports on its port, however it can be established: the live answer for
# the app, the boot-time claim for the socket. Reported to the log so a reader can tell a
# restarted service's pid from the one that died.
serving_pid() { # $1 service, $2 port
  service_pid "$2" "$(claim_file_for "$1")" "$(service_dir_for "$1")" "$(identity_path_for "$1")" | cut -d' ' -f1
}

# The pid the state file records for a service: what was there before this repair, so the
# line and the event answer "which pid died" rather than only "something did".
recorded_pid() { # $1 service
  node -e '
    const fs = require("fs");
    try {
      const state = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const service = (state.services || {})[process.argv[2]];
      if (service && Number.isInteger(service.pid) && service.pid > 0) process.stdout.write(String(service.pid));
    } catch (error) {}
  ' "$(native_path "$STATE_FILE")" "$1" 2>/dev/null
}

# Put back exactly the service that died, by running the documented bring-up: it reuses
# everything still up and starts only what is missing (its idempotency contract, and the
# reason the start commands are not written down a second time in this checkout).
#
# `--no-supervise` matters: this run is already supervised, and a nested supervisor would
# both duplicate the watching and count its own restart. The run is bounded by dev-up's own
# waits (it gives up on a service that never listens), so there is no timeout to invent here.
restore_service() { # $1 service, $2 its port
  local service="$1" out="$LOG_DIR/dev-supervisor.restore.$service.log"
  logline "  repairing with: bash .zscripts/dev-up.sh --no-schema --json --no-supervise"
  DEV_UP_LOG_DIR="$LOG_DIR" SOCKET_PORT="$SOCKET_PORT" \
    "${BASH:-bash}" "$ROOT/.zscripts/dev-up.sh" --no-schema --json --no-supervise >"$out" 2>&1
  local status=$?
  if [ "$status" != 0 ]; then
    logline "  dev-up exited $status — its own words, last lines of $(basename "$out"):"
    tail -6 "$out" | sed 's/^/        /' | while IFS= read -r line; do logline "$line"; done
  fi
  # The JSON is the only thing dev-up writes to stdout in that mode, so the object starts at
  # the first line beginning with `{` — the same slice CI takes from the same output. Its
  # `pid` is the one dev-up itself verified, which is why it is preferred to another probe.
  sed -n '/^{/,$p' "$out" >"$out.json" 2>/dev/null
  local pid
  pid="$(node -e '
    const fs = require("fs");
    try {
      const report = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      const service = (report.services || {})[process.argv[2]];
      if (service && Number.isInteger(service.pid) && service.pid > 0) process.stdout.write(String(service.pid));
    } catch (error) {}
  ' "$out.json" "$service" 2>/dev/null)"
  printf '%s' "$pid"
}

# ------------------------------------------------------------------- the stop path

on_term() {
  STOPPING=1
  logline "stop requested — stopping the watch only; the services are a decision for whoever asked"
}
trap on_term TERM INT

# A clean exit takes its own record with it, and only while the record still names this pid
# — the rule the services' claims follow, for the same reason: a record that outlived its
# supervisor would tell the next `dev:up` that something is watching when nothing is.
cleanup() {
  if [ -f "$RECORD" ] && [ "$(supervisor_field "$RECORD" "$ROOT" pid 0)" = "$SELF_PID" ]; then
    rm -f "$RECORD"
  fi
  if [ "$RESTARTS" -gt 0 ]; then
    logline "stopped (pid $SELF_PID) after restarting $RESTARTS time(s)"
  else
    logline "stopped (pid $SELF_PID) — it never had to restart anything"
  fi
  rm -f "$EVENTS"
}
trap cleanup EXIT

# ------------------------------------------------------------------- the run

STARTED_AT="$(date -u +%FT%TZ)"
logline "starting on $ROOT (pid $SELF_PID, every ${INTERVAL}s)"
logline "  watching: dev server :$APP_PORT  ·  live-update socket service :$SOCKET_PORT"
logline "  repairs run: bash .zscripts/dev-up.sh --no-schema --json --no-supervise"
logline "  record: $(native_path "$RECORD")"
record_event "-" "watching" "started"
write_record

while [ "$STOPPING" = 0 ]; do
  for service in dev socket; do
    [ "$STOPPING" = 1 ] && break
    port="$(port_of "$service")"
    label="$(port_label "$service")"
    if port_taken "$port"; then
      # Back: whatever was wrong is over, and the next outage is a new one to announce.
      if [ "$(reported_of "$service")" = 1 ]; then
        set_reported "$service" 0
        set_failures "$service" 0
        logline "$label is serving :$port again"
      fi
      continue
    fi

    now="$(date +%s)"
    if [ "$(reported_of "$service")" != 1 ]; then
      was_pid="$(recorded_pid "$service")"
      if [ -n "$was_pid" ]; then
        logline "$label is gone: nothing is serving :$port (recorded pid $was_pid)"
      else
        logline "$label is gone: nothing is serving :$port"
      fi
      record_event "$service" "detected" ":$port stopped being served" "$was_pid"
      set_reported "$service" 1
      write_record
    fi

    if [ "$now" -lt "$(next_of "$service")" ]; then
      # Not due yet: the other service is still watched while this one waits, which is why
      # the backoff is a deadline rather than a sleep.
      continue
    fi

    was_pid="$(recorded_pid "$service")"
    now_pid="$(restore_service "$service" "$port")"
    if [ -z "$now_pid" ] && port_taken "$port"; then
      now_pid="$(serving_pid "$service" "$port")"
    fi
    if [ -n "$now_pid" ] && port_taken "$port"; then
      logline "  back up: $label on :$port (pid $now_pid)"
      record_event "$service" "restarted" ":$port is served again" "$was_pid" "$now_pid"
      set_failures "$service" 0
      set_next "$service" 0
      RESTARTS=$((RESTARTS + 1))
      # An app restart changes the pid a Preview tab was registered with, and nothing here
      # can re-register it. The next `dev:up` prints the current call; this prints it now, so
      # whoever finds a dead tab can see what happened to it.
      if [ "$service" = "dev" ]; then
        logline "  a Preview tab registered with the old pid is stale — re-register: register_preview({ url: \"http://localhost:$APP_PORT/\", pid: $now_pid })"
      fi
    else
      set_failures "$service" "$(( $(failures_of "$service") + 1 ))"
      logline "  still down after a repair ($(failures_of "$service") consecutive failures) — the repair's own words are in $(basename "$LOG_DIR/dev-supervisor.restore.$service.log")"
      record_event "$service" "restart-failed" ":$port is still not served" "$was_pid"
      if [ "$(failures_of "$service")" -ge "$MAX_FAILURES" ] && ! gave_up "$service"; then
        give_up "$service"
        logline "  slowing down on the $label: $MAX_FAILURES consecutive failures, so at most one attempt every ${COOLDOWN}s from here"
        record_event "$service" "gave-up" "$MAX_FAILURES consecutive failed repairs" "$was_pid"
      fi
      if gave_up "$service"; then
        set_next "$service" "$((now + COOLDOWN))"
        logline "  next attempt no sooner than $((COOLDOWN))s from now"
      else
        backoff=$(( INTERVAL * 2 ** $(failures_of "$service") ))
        [ "$backoff" -gt "$COOLDOWN" ] && backoff="$COOLDOWN"
        set_next "$service" "$((now + backoff))"
        logline "  next attempt in ${backoff}s"
      fi
    fi
    write_record
  done
  sleep "$INTERVAL"
done
