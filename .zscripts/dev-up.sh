#!/usr/bin/env bash
#
# dev-up.sh — bring up this checkout's whole local stack in one idempotent command:
#
#   1. the project-local PostgreSQL cluster (local-pg/, port 55432) + its schema
#   2. the socket.io mini-service that carries live dashboard updates (port 3003)
#   3. the Next.js dev server (the port pinned by package.json's "dev" script)
#
# Nothing is ever killed, and nothing is started twice: every service is probed by
# its TCP port first, so an already-running one is reported and left alone. Safe to
# re-run at any time, including while the whole stack is up (it just reports).
#
# It finishes by resolving the pid that actually owns the LISTEN socket on the app
# port — read from the OS, not the pid of the wrapper we spawned (npm -> node ->
# next -> worker). That distinction is what has bitten us when registering a
# preview, where a wrapper pid looks alive while the listener is a grandchild — so
# the summary and the JSON also carry the exact `register_preview` call, built from
# that verified pid. Nobody should have to rediscover the listener to open the app.
#
# Reusing a service has one risk this script cannot remove: the service can be older than
# the code it is meant to be running. A running service whose restart-required inputs
# (lib-stack.sh: the environment, config, the generated Prisma client and instrumentation
# for the app; its whole source for the watcher-less socket service) changed after it booted
# is therefore reported as stale — which file, how long after it started, and the command
# that replaces it. It is never restarted for you: nothing here kills anything. What it
# prevents is the silent version, a preview tab attached to a server that will never
# re-read its own config.
#
# Reusing a service has one risk this script cannot remove: the service can be older
# than the code it is meant to be running. A running service whose restart-required
# inputs (lib-stack.sh: env, config, the generated Prisma client, instrumentation for the
# app; its whole source for the watcher-less socket service) changed after it booted is
# therefore reported as stale — which file, how long after it started, and the command
# that replaces it. It is never restarted for you: nothing here kills anything. What it
# prevents is the silent version, a preview tab attached to a server that will never
# re-read its own config.
#
# Usage:
#   npm run dev:up                    # or: bash .zscripts/dev-up.sh
#   bash .zscripts/dev-up.sh --no-schema   # skip prisma generate / db push
#   bash .zscripts/dev-up.sh --pid         # print the app-port listener pid, start nothing
#   bash .zscripts/dev-up.sh --preview     # print the register_preview call to run,
#                                          # start nothing; non-zero if not registerable
#   bash .zscripts/dev-up.sh --json        # finish with a JSON summary on stdout
#                                          # (progress moves to stderr, so `| jq` is safe)
#
# Environment:
#   DEV_UP_LOG_DIR  where the per-service logs and the pid file go (default
#                   .zscripts/). Point it at a temp dir to exercise a scratch
#                   port without truncating the logs of the live services.
#   SOCKET_PORT     override the live-update socket port (default: index.ts)
#   DEV_UP_APP_TIMEOUT  seconds to wait for the app to listen (default 120) and
#                   then to answer (default 90). CI raises it for a cold runner.
#   DEV_UP_PREVIEW_TIMEOUT  seconds --preview gives the URL to answer before refusing to
#                   hand it over (default 60): a page is compiled before it is served, and
#                   the landing page is usually the first thing asked for on a cold runner.
#                   The wait ends at the first answer, so this ceiling costs nothing when
#                   the page does answer; it is only ever paid by a page that does not.
#
# Staleness is reported in two places: a `stale:` line in the summary (beside the
# preview call, which is what it is warning you about) and
# `services.<name>.staleness` in --json — `checked: false` there means the service
# published no boot marker to compare against, which is not the same as current.
#
# Every step here is the manual sequence recorded in .freebuff/run.md, and the
# per-service logs are the ones that doc names.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT" || exit 1
SELF="$SCRIPT_DIR/dev-up.sh"

# Paths, probes and output helpers shared with dev-down.sh — see lib-stack.sh.
# shellcheck source=.zscripts/lib-stack.sh
source "$SCRIPT_DIR/lib-stack.sh"
mkdir -p "$LOG_DIR"

SCHEMA=1
PID_ONLY=0
PREVIEW_ONLY=0
JSON=0
for arg in "$@"; do
  case "$arg" in
    --no-schema) SCHEMA=0 ;;
    --pid) PID_ONLY=1 ;;
    --preview) PREVIEW_ONLY=1 ;;
    --json) JSON=1 ;;
    -h|--help)
      usage "$SELF"
      exit 0
      ;;
    *) printf 'unknown option: %s (try --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

# Output helpers, port probes, path resolution and the state-file location all
# live in lib-stack.sh (sourced above), so that dev-down.sh cannot disagree with
# this script about any of them.

http_code() { # $1 url -> status code, or 000 when nothing answered
  # `%{http_code}` is written even when curl gives up, and a refused connection or a
  # timeout writes 000 itself — so the `|| printf 000` this used to have appended a
  # SECOND one, handing callers "000000": a string that matches no status pattern and
  # no equality check. Harmless while every caller only asked "does it start with 5?",
  # and not harmless the moment one asks "did it answer at all?" (which the preview
  # handoff does). Normalise to exactly one spelling of "no answer".
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null)" || true
  case "$code" in
    ''|000*|*[!0-9]*) printf '000' ;;
    *) printf '%s' "$code" ;;
  esac
}

wait_for_http() { # $1 url, $2 seconds — succeeds on any real answer, even a 500
  local deadline=$((SECONDS + $2)) code
  while [ "$SECONDS" -lt "$deadline" ]; do
    code="$(http_code "$1")"
    case "$code" in 2*|3*|4*|5*) return 0 ;; esac
    sleep 1
  done
  return 1
}

tail_log() { # $1 file
  [ -f "$1" ] || return 0
  info "last lines of $(basename "$1"):"
  tail -15 "$1" | indent
}

# ------------------------------------------------------------- detached spawning

STARTED_PID=""
# $1 working directory, $2 log file, $3.. command. All three stdio streams are
# redirected so the child cannot hold the caller's terminal/pipe open, and nohup
# keeps it alive after this script exits.
start_detached() {
  local dir="$1" log="$2"
  shift 2
  mkdir -p "$(dirname "$log")"
  STARTED_PID="$( ( cd "$dir" || exit 1; nohup "$@" >"$log" 2>&1 </dev/null & printf '%s' "$!" ) )"
}

# ------------------------------------------------------------------ env / config

# Read a key out of .env.local without sourcing it (quotes stripped, CRLF safe).
env_local() {
  [ -f "$ROOT/.env.local" ] || return 0
  sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ROOT/.env.local" \
    | tr -d '\r' | head -1 \
    | sed -E "s/^\"(.*)\"$/\1/; s/^'(.*)'$/\1/"
}

# Wait for the socket service's boot-time claim to land. It publishes within milliseconds of
# binding — synchronously, before it announces itself — so a few seconds is a real bound here,
# unlike the app's, whose publication is gated on its runtime booting (`report_app_readiness`
# is what waits for that one). Only used where this script started the service, since that is
# where a publication is expected; the pid is the same either way, so a timeout costs a
# bounded pause and nothing else.
wait_for_published_claim() { # $1 pid file, $2 port, $3 the service's directory, $4 seconds
  local waited=0
  while [ "$waited" -lt "$4" ]; do
    [ -n "$(published_pid "$1" "$2" "$3")" ] && return 0
    sleep 1
    waited=$((waited + 1))
  done
  return 0
}

# The port the dev server listens on, taken from the "dev" script so it cannot
# drift from what `npm run dev` actually does.
dev_script_port() {
  sed -n 's/.*"dev"[[:space:]]*:[[:space:]]*".*-p[[:space:]]*\([0-9]\{2,\}\).*/\1/p' package.json | head -1
}

# Whether the app's boot-time claim is about the server that is answering — the
# precondition for reading its `startedAt` as *this* server's start. True when there is
# nothing to compare (no claim, or nothing answering on the port); false only when the two
# disagree, which is the stale-claim case `service_pid` already warns about: a pid can be
# recycled after a hard kill, and a file that outlived its writer is evidence about that
# writer only.
claim_is_about_this_server() { # $1 claim file, $2 port
  local claim answer
  claim="$(published_pid "$1" "$2" "$ROOT")"
  [ -n "$claim" ] || return 0
  answer="$(answered_pid "$2" "$SERVER_IDENTITY_PATH")"
  [ -n "$answer" ] || return 0
  [ "$claim" = "$answer" ]
}

# Say whether the process serving a port was started before the source it serves changed,
# and remember the answer for the summary and the JSON.
#
# Sets STALE_<PREFIX>_{CHECKED,STARTED,CHANGED,AGE,PATH} — four values rather than one, and
# as variables, because the two call sites need them in different places: the socket service
# reports its own line early, while the app's claim only settles once the confirmation at the
# end of the run has compared it against the live answer. `CHECKED` distinguishes "compared,
# and current" from "nothing to compare against" (no boot marker), which the warning below
# does not need but `--json` does.
check_source_freshness() { # $1 prefix (DEV|SOCKET), $2 claim file, $3 port, $4 pid, $5 the service's directory, $6.. restart-required inputs
  local prefix="$1" file="$2" port="$3" pid="$4" dir="$5"
  local label service line started changed age path
  case "$prefix" in
    DEV) label="the dev server"; service="dev-server" ;;
    SOCKET) label="the socket service"; service="attendance-socket" ;;
    *) label="the service"; service="" ;;
  esac
  local var
  for var in CHECKED STARTED CHANGED AGE PATH; do printf -v "STALE_${prefix}_${var}" '%s' ""; done

  line="$(stale_since_start "$file" "$port" "$dir" "${@:6}")"
  [ -n "$line" ] || return 0
  printf -v "STALE_${prefix}_CHECKED" '%s' 1
  IFS=$'\t' read -r started changed age path <<<"$line"
  printf -v "STALE_${prefix}_STARTED" '%s' "$started"
  [ -n "$path" ] || return 0
  printf -v "STALE_${prefix}_CHANGED" '%s' "$changed"
  printf -v "STALE_${prefix}_AGE" '%s' "$age"
  printf -v "STALE_${prefix}_PATH" '%s' "$path"

  # Two lines, because the first is what happened and the second is what to do: a warning
  # that leaves the reader to work out the command is one a reader skips.
  warn "$label on :$port${pid:+ (pid $pid)} started $started, and $path changed $age later — it still runs the code from before that change"
  warn "  $(stale_reason "$service"); restart it: $RESTART_CMD"
}

# One `stale:` line for the summary, naming the file rather than only the service, so the
# table that hands over a preview also says whether that preview is looking at current code.
stale_note() { # $1 prefix, $2 label, $3 port, $4 pid
  local prefix="$1" label="$2" port="$3" pid="$4"
  local vfile="STALE_${prefix}_PATH" vstarted="STALE_${prefix}_STARTED" vage="STALE_${prefix}_AGE"
  local file="${!vfile:-}"
  [ -n "$file" ] || return 0
  printf '  stale:   %s on :%s%s started %s, but %s changed %s later — restart: %s\n' \
    "$label" "$port" "${pid:+ (pid $pid)}" "${!vstarted}" "$file" "${!vage:-}" "$RESTART_CMD"
}

for tool in node curl; do
  command -v "$tool" >/dev/null 2>&1 || fail "$tool is required but is not on PATH"
done
if [ "$WINDOWS" != 1 ] && ! command -v lsof >/dev/null 2>&1 && ! command -v ss >/dev/null 2>&1; then
  fail "need either lsof or ss to find the process owning a port"
fi

APP_PORT="$(dev_script_port)"
[ -n "$APP_PORT" ] || APP_PORT=3000
# PORT=0 is how some shells/tooling spell "unset", so only a real value counts.
if [ -n "${PORT:-}" ] && [ "${PORT:-0}" != "0" ] && [ "$PORT" != "$APP_PORT" ]; then
  warn "PORT=$PORT is ignored: package.json's dev script pins $APP_PORT"
fi

# How long to give the app, first to listen and then to answer a request. One
# knob for both, because a slow machine is slow at both; the defaults are the
# historical ones, and CI raises it to keep the ceiling its own readiness poll
# used to have (see .github/workflows/ci.yml).
APP_WAIT="${DEV_UP_APP_TIMEOUT:-120}"
HTTP_WAIT="${DEV_UP_APP_TIMEOUT:-90}"
# How long `--preview` keeps asking the URL before it refuses to hand over a call. Separate
# from the two above on purpose: those wait for a stack this script is bringing up, while this
# one is a handoff someone is watching for — patient enough for a first compile, short enough
# to still be an answer.
#
# One page, not one stack, and it is compiled *after* the readiness probe was already answered,
# so this number covers a single cold compile — which a runner does for the landing page at a
# moment when nothing else in the job has asked for it. The loop returns on the first answer,
# so 60 is not 60 seconds of delay but a ceiling only a page that never answers can reach; the
# two refusal paths (no pid, app not answering at all) do not wait on it at all.
PREVIEW_WAIT="${DEV_UP_PREVIEW_TIMEOUT:-60}"

if [ "$PID_ONLY" = 1 ]; then
  read -r pid PID_SOURCE <<<"$(service_pid "$APP_PORT" "$SERVER_PID_FILE" "$ROOT" "$SERVER_IDENTITY_PATH")"
  [ -n "$pid" ] || exit 1
  printf '%s\n' "$pid"
  exit 0
fi

# ------------------------------------------------------ the preview handoff ---

# Opening the app in this thread's Preview tab takes exactly two pieces of data —
# the URL and the pid that owns it — and getting the second one wrong is a mistake
# this script has already made and fixed (a wrapper pid looks alive while the
# listener is a grandchild). So the values are resolved in one place here, and the
# summary, `--preview` and `--json` all render from it: nobody should have to
# rediscover the listener to watch the app.
preview_url() { printf 'http://localhost:%s/' "$APP_PORT"; }

# The status `$PREVIEW_URL` answers with — asked until it answers, rather than once.
#
# A `next dev` compiles a page before it serves it, and `/` is the first thing a preview loads
# and, on a cold runner, the first thing anything asks for at all. So one five-second look
# reports "never answered" for a page that is merely still being built, which is the one answer
# this must not get wrong: the question is "would registering this URL show an error page?", and
# a compile in progress is not an answer to that either way. Measured on CI, where nothing else
# in the job had requested the landing page and this fetch is what failed the run. Bounded by
# PREVIEW_WAIT, because this is also a handoff someone is waiting for; prints the last code seen
# (000 when it never answered at all).
preview_url_code() {
  local code="" deadline=$((SECONDS + PREVIEW_WAIT))
  while [ "$SECONDS" -lt "$deadline" ]; do
    code="$(http_code "$(preview_url)")"
    [ "$code" = "000" ] || break
    sleep 1
  done
  [ -n "$code" ] || code="$(http_code "$(preview_url)")"
  printf '%s' "$code"
}

# The literal tool call, so it can be copied (or read by a machine) as-is.
register_preview_line() { # $1 listener pid
  printf 'register_preview({ url: "%s", pid: %s })\n' "$(preview_url)" "$1"
}

if [ "$PREVIEW_ONLY" = 1 ]; then
  read -r pid PID_SOURCE <<<"$(service_pid "$APP_PORT" "$SERVER_PID_FILE" "$ROOT" "$SERVER_IDENTITY_PATH")"
  # The pid first: with nothing to hand over, the answer is already no and asking the URL would
  # only delay it by the patience above (a refusal that takes 20 s to arrive reads like a hang).
  if [ -z "$pid" ]; then
    printf 'dev-up --preview: nothing here names the process listening on %s, and register_preview needs its pid — the server published no readable %s, and the OS probe says: %s\n' \
      "$APP_PORT" "$(native_path "$SERVER_PID_FILE")" "$(probe_detail "$APP_PORT")" >&2
    exit 1
  fi
  code="$(preview_url_code)"
  if [ "$code" = "000" ]; then
    printf 'dev:up --preview: pid %s owns %s but %s never answered in %ss, so registering it would show an error page — check %s\n' \
      "$pid" "$APP_PORT" "$(preview_url)" "$PREVIEW_WAIT" "$DEV_LOG" >&2
    exit 1
  fi
  # The call is still printed — the pid and the URL are current, and the app as it stands
  # is usually what someone wants to watch — but if this server predates the code it was
  # started from, that is said first. A preview attached to a process that will never
  # re-read its own config is the silent case this whole check exists for.
  if claim_is_about_this_server "$SERVER_PID_FILE" "$APP_PORT"; then
    check_source_freshness DEV "$SERVER_PID_FILE" "$APP_PORT" "$pid" "$ROOT" "${APP_RESTART_INPUTS[@]}"
  fi
  register_preview_line "$pid"
  exit 0
fi

DB_URL="${DATABASE_URL:-$(env_local DATABASE_URL)}"
DB_HOST=""; DB_PORT=""; DB_NAME=""; DB_USER=""
if [ -n "$DB_URL" ]; then
  read -r DB_HOST DB_PORT DB_NAME DB_USER <<<"$(
    DATABASE_URL="$DB_URL" node -e '
      let u
      try { u = new URL(process.env.DATABASE_URL) } catch { process.exit(3) }
      process.stdout.write([
        u.hostname || "localhost",
        u.port || "5432",
        decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
        u.username || "postgres",
      ].join(" "))
    ' 2>/dev/null
  )"
fi

[ -z "$DB_URL" ] || [ -n "$DB_HOST" ] \
  || warn "could not parse DATABASE_URL (expected postgresql://user@host:port/db)"

note "dev-up — $ROOT"
note "  app port $APP_PORT · socket port ${SOCKET_PORT:-3003} · database ${DB_HOST:-<none>}${DB_PORT:+:$DB_PORT}"

# ------------------------------------------------ state: what this run owns ---

# Machine-readable step states — also what --json reports, so tests assert on
# these rather than on the rendered table:
#   services: skipped | external | reused | started | exited | failed
#   schema:   skipped | in-sync | failed
#
# OURS_* is the part dev-down.sh acts on: a service is stopped only because this
# run (or an earlier run in this checkout) started it, never because something
# happens to be listening on a port we recognise.
STATE_PG="skipped"; PID_PG=""; SUP_PG=""; OURS_PG=0
STATE_SCHEMA="skipped"
STATE_SOCKET="skipped"; PID_SOCKET=""; SUP_SOCKET=""; OURS_SOCKET=0; SOCKET_RUNNER=""
# "self" or "probe": which route named the socket's pid, exactly as for the dev server.
SOCKET_PID_SOURCE=""
# Whether each running service predates the source it serves. `CHECKED` is "there was a
# boot marker to compare against"; `PATH` is set only when something changed after it.
# Initialised here because print_summary and build_report must both be safe under `set -u`
# on every path — including the failure paths that run before a service is ever resolved.
STALE_DEV_CHECKED=""; STALE_DEV_STARTED=""; STALE_DEV_CHANGED=""; STALE_DEV_AGE=""; STALE_DEV_PATH=""
STALE_SOCKET_CHECKED=""; STALE_SOCKET_STARTED=""; STALE_SOCKET_CHANGED=""; STALE_SOCKET_AGE=""; STALE_SOCKET_PATH=""
STATE_DEV="skipped"; PID_DEV=""; SUP_DEV=""; OURS_DEV=0
APP_LISTENING=0
# The status the readiness probe below got from the app, so the preview handoff can
# say whether the URL it names actually answers — and whether it is worth
# registering. Empty means "not probed yet".
APP_HTTP_CODE=""
# Defined here so build_report() can run at any later point under `set -u` — but
# self-assigned, because a plain `SOCKET_PORT=""` would clobber the environment
# override this script documents.
SOCKET_PORT="${SOCKET_PORT:-}"

# The state file dev-down.sh reads and the --json payload are the same object:
# what is up, on which pid, and which of it this script started. Node encodes it,
# so nothing here has to hand-escape Windows paths, and it carries ownership over
# from the previous run — a service an earlier dev-up started is still ours to
# stop, even when this run merely found it running.
build_report() {
  REP_ROOT="$ROOT" REP_STATE_FILE="$STATE_FILE" REP_PID_FILE="$PID_FILE"
  REP_DEV_LOG="$DEV_LOG" REP_SOCKET_LOG="$SOCKET_LOG"
  REP_WRITTEN="$(date -u +%FT%TZ)"
  REP_APP_PORT="$APP_PORT" REP_SOCKET_PORT="$SOCKET_PORT" REP_DB_PORT="${DB_PORT:-}"
  REP_DB_HOST="$DB_HOST" REP_DB_NAME="$DB_NAME" REP_DB_USER="$DB_USER"
  REP_SCHEMA_STATE="$STATE_SCHEMA" REP_APP_LISTENING="$APP_LISTENING"
  REP_PG_PORT="${DB_PORT:-}" REP_PG_PID="$PID_PG" REP_PG_SUP="$SUP_PG"
  REP_PG_STATE="$STATE_PG" REP_PG_OURS="$OURS_PG"
  REP_SOCKET_PID="$PID_SOCKET" REP_SOCKET_SUP="$SUP_SOCKET"
  REP_SOCKET_STATE="$STATE_SOCKET" REP_SOCKET_OURS="$OURS_SOCKET" REP_SOCKET_RUNNER="$SOCKET_RUNNER"
  REP_DEV_PID="$PID_DEV" REP_DEV_SUP="$SUP_DEV" REP_DEV_STATE="$STATE_DEV" REP_DEV_OURS="$OURS_DEV"
  # Which route named the socket's pid, for the same reason as the dev server's below.
  REP_SOCKET_PID_SOURCE="${SOCKET_PID_SOURCE:-}"
  # What the app's boot-time file named, and whether the live answer agreed with it.
  REP_LISTENER_CLAIM_PID="${LISTENER_CLAIM_PID:-}"
  REP_LISTENER_CLAIM_AGREES="${LISTENER_CLAIM_AGREES:-}"
  # Whether each running service predates the source it serves, and the file that proves it.
  REP_DEV_STALE_CHECKED="${STALE_DEV_CHECKED:-}" REP_DEV_STALE_STARTED="${STALE_DEV_STARTED:-}"
  REP_DEV_STALE_CHANGED="${STALE_DEV_CHANGED:-}" REP_DEV_STALE_AGE="${STALE_DEV_AGE:-}"
  REP_DEV_STALE_PATH="${STALE_DEV_PATH:-}"
  REP_SOCKET_STALE_CHECKED="${STALE_SOCKET_CHECKED:-}" REP_SOCKET_STALE_STARTED="${STALE_SOCKET_STARTED:-}"
  REP_SOCKET_STALE_CHANGED="${STALE_SOCKET_CHANGED:-}" REP_SOCKET_STALE_AGE="${STALE_SOCKET_AGE:-}"
  REP_SOCKET_STALE_PATH="${STALE_SOCKET_PATH:-}"
  REP_RESTART_CMD="$RESTART_CMD"
  # "self" or "probe": which route named the dev server's pid. Defaulted because a
  # failure path can build this report before any pid has been resolved.
  REP_DEV_PID_SOURCE="${SERVER_PID_SOURCE:-}"
  # Assigned a default so build_report() can be called before the handoff block runs
  # (a failure path records the state file early) under `set -u`.
  REP_PREVIEW_URL="${PREVIEW_URL:-http://localhost:$APP_PORT/}"
  REP_PREVIEW_PID="${PREVIEW_PID:-$PID_DEV}"
  REP_PREVIEW_HTTP="${PREVIEW_HTTP:-$APP_HTTP_CODE}"
  REP_PREVIEW_READY="${PREVIEW_READY:-0}"
  REP_PREVIEW_NOTE="${PREVIEW_NOTE:-}"
  export REP_ROOT REP_STATE_FILE REP_PID_FILE REP_DEV_LOG REP_SOCKET_LOG REP_WRITTEN
  export REP_APP_PORT REP_SOCKET_PORT REP_DB_PORT REP_DB_HOST REP_DB_NAME REP_DB_USER
  export REP_SCHEMA_STATE REP_APP_LISTENING REP_PG_PORT
  export REP_PG_PID REP_PG_SUP REP_PG_STATE REP_PG_OURS
  export REP_SOCKET_PID REP_SOCKET_SUP REP_SOCKET_STATE REP_SOCKET_OURS REP_SOCKET_RUNNER
  export REP_DEV_PID REP_DEV_SUP REP_DEV_STATE REP_DEV_OURS REP_DEV_PID_SOURCE
  export REP_SOCKET_PID_SOURCE
  export REP_LISTENER_CLAIM_PID REP_LISTENER_CLAIM_AGREES
  export REP_DEV_STALE_CHECKED REP_DEV_STALE_STARTED REP_DEV_STALE_CHANGED REP_DEV_STALE_AGE REP_DEV_STALE_PATH
  export REP_SOCKET_STALE_CHECKED REP_SOCKET_STALE_STARTED REP_SOCKET_STALE_CHANGED REP_SOCKET_STALE_AGE REP_SOCKET_STALE_PATH
  export REP_RESTART_CMD
  export REP_PREVIEW_URL REP_PREVIEW_PID REP_PREVIEW_HTTP REP_PREVIEW_READY REP_PREVIEW_NOTE
  node -e '
    const fs = require("fs");
    const e = process.env;
    const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
    // Whether a running service is older than the files it was started from. `checked:
    // false` is not "current": it is "there was no boot marker to compare against", which
    // is what an older build or a removed claim file looks like from here.
    const staleness = (checked, startedAt, changedAt, changedIn, file) =>
      checked === "1"
        ? {
            checked: true,
            stale: Boolean(file),
            startedAt: startedAt || null,
            changedAt: changedAt || null,
            changedIn: changedIn || null,
            path: file || null,
            restart: file ? e.REP_RESTART_CMD : null,
          }
        : {
            checked: false,
            stale: null,
            startedAt: null,
            changedAt: null,
            changedIn: null,
            path: null,
            restart: null,
          };
    const svc = (port, pid, supervisor, state, ours, extra) =>
      Object.assign(
        { port: num(port), pid: num(pid), supervisor: num(supervisor), state, startedByDevUp: ours === "1" },
        extra || {},
      );
    const report = {
      root: e.REP_ROOT,
      written: e.REP_WRITTEN,
      appPort: num(e.REP_APP_PORT),
      socketPort: num(e.REP_SOCKET_PORT),
      dbPort: num(e.REP_DB_PORT),
      listenerPid: num(e.REP_DEV_PID),
      appListening: e.REP_APP_LISTENING === "1",
      pidFile: e.REP_PID_FILE,
      // Which route named the app-port listener: the boot-time report the server
      // published (`self`, which is what a run against this repo should say), or the
      // OS probe where that file was missing or untrustworthy (`probe`).
      listenerPidSource: e.REP_DEV_PID_SOURCE || null,
      // The claim the app wrote at boot, and whether the answer on the port agreed with it
      // (null when there was no claim, or nothing answered to compare against). The live
      // answer is what `listenerPid` carries; this says it was really cross-checked, and a
      // disagreement means that file was stale.
      listenerClaim: {
        pid: num(e.REP_LISTENER_CLAIM_PID),
        agrees: e.REP_LISTENER_CLAIM_AGREES === "" ? null : e.REP_LISTENER_CLAIM_AGREES === "1",
      },
      // The same for the socket service, which reports itself the same way. Both are
      // `self` for a stack this script started, and `probe` only where a service predates
      // the reporting or the file was removed.
      socketPidSource: e.REP_SOCKET_PID_SOURCE || null,
      stateFile: e.REP_STATE_FILE,
      logs: { dev: e.REP_DEV_LOG, socket: e.REP_SOCKET_LOG },
      // Everything a Preview tab needs, so no caller has to rediscover the listener:
      // `register` is the tool call to run verbatim (null when this run cannot
      // honestly hand over a pid, with `note` saying why).
      preview: {
        url: e.REP_PREVIEW_URL,
        pid: num(e.REP_PREVIEW_PID),
        httpCode: e.REP_PREVIEW_HTTP || null,
        ready: e.REP_PREVIEW_READY === "1",
        register:
          e.REP_PREVIEW_READY === "1"
            ? { tool: "register_preview", url: e.REP_PREVIEW_URL, pid: num(e.REP_PREVIEW_PID) }
            : null,
        note: e.REP_PREVIEW_NOTE || null,
      },
      schema: { state: e.REP_SCHEMA_STATE },
      database: {
        host: e.REP_DB_HOST || null,
        port: num(e.REP_DB_PORT),
        name: e.REP_DB_NAME || null,
        user: e.REP_DB_USER || null,
      },
      services: {
        postgres: svc(e.REP_PG_PORT, e.REP_PG_PID, e.REP_PG_SUP, e.REP_PG_STATE, e.REP_PG_OURS),
        socket: svc(e.REP_SOCKET_PORT, e.REP_SOCKET_PID, e.REP_SOCKET_SUP, e.REP_SOCKET_STATE, e.REP_SOCKET_OURS, {
          runner: e.REP_SOCKET_RUNNER || null,
          staleness: staleness(
            e.REP_SOCKET_STALE_CHECKED, e.REP_SOCKET_STALE_STARTED, e.REP_SOCKET_STALE_CHANGED,
            e.REP_SOCKET_STALE_AGE, e.REP_SOCKET_STALE_PATH,
          ),
        }),
        dev: svc(e.REP_APP_PORT, e.REP_DEV_PID, e.REP_DEV_SUP, e.REP_DEV_STATE, e.REP_DEV_OURS, {
          staleness: staleness(
            e.REP_DEV_STALE_CHECKED, e.REP_DEV_STALE_STARTED, e.REP_DEV_STALE_CHANGED,
            e.REP_DEV_STALE_AGE, e.REP_DEV_STALE_PATH,
          ),
        }),
      },
    };
    let prev = null;
    try {
      prev = JSON.parse(fs.readFileSync(e.REP_STATE_FILE, "utf8"));
    } catch (err) {}
    if (prev && prev.root === report.root) {
      for (const [name, service] of Object.entries(report.services)) {
        const before = (prev.services || {})[name];
        if (before && before.startedByDevUp && before.pid && before.pid === service.pid) {
          service.startedByDevUp = true;
          if (!service.supervisor && before.supervisor) service.supervisor = before.supervisor;
        }
      }
    }
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  '
}

# A run that gives up half-way still records what it managed to start: Postgres or
# the socket can be up while the app never answers, and dev-down.sh can only undo
# what it can read.
record_state() { # $1 report JSON (default: build one). Atomic, best effort.
  local report="${1:-}" tmp="$STATE_FILE.tmp"
  [ -n "$report" ] || report="$(build_report 2>/dev/null || true)"
  if [ -n "$report" ] && printf '%s\n' "$report" >"$tmp"; then
    mv -f "$tmp" "$STATE_FILE"
  else
    rm -f "$tmp"
  fi
}

fail() {
  command -v build_report >/dev/null 2>&1 && record_state
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

# ------------------------------------------------------------ 1. database + schema

PG_DIR="$ROOT/local-pg"
PG_BIN="$PG_DIR/pgsql/bin"

if [ -z "$DB_URL" ]; then
  step "PostgreSQL"
  warn "no DATABASE_URL in the environment or .env.local — the app will not start"
  warn "copy .env.local from the main checkout (.freebuff/run.md §1d)"
elif [ "$DB_HOST" != "127.0.0.1" ] && [ "$DB_HOST" != "localhost" ] && [ "$DB_HOST" != "::1" ]; then
  step "PostgreSQL"
  info "DATABASE_URL points at $DB_HOST:$DB_PORT — using it as-is"
  warn "not managing a local cluster, and not running db push against a remote host"
  STATE_PG="external"
else
  step "PostgreSQL $DB_HOST:$DB_PORT"
  if port_taken "$DB_PORT"; then
    PID_PG="$(listener_pid "$DB_PORT")"
    info "already running${PID_PG:+ (pid $PID_PG)}"
    STATE_PG="reused"
  else
    [ -x "$PG_BIN/postgres$EXE" ] \
      || fail "no local cluster at local-pg/ — create one with .freebuff/run.md §1c"
    if [ "$WINDOWS" = 1 ]; then
      elevated="$(powershell -NoProfile -Command \
        '([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)' \
        2>/dev/null | tr -d '\r')"
      if [ "$elevated" = "True" ]; then
        fail "this shell is elevated and PostgreSQL refuses to run with administrative rights.
       Relaunch your terminal/editor unelevated (see .freebuff/run.md §3)."
      fi
    fi
    info "starting (postgres.exe -D data -p $DB_PORT)"
    start_detached "$PG_DIR" "$PG_DIR/pg.log" \
      "./pgsql/bin/postgres$EXE" -D data -p "$DB_PORT" -c listen_addresses=127.0.0.1
    # A supervisor pid is recorded only where the OS can be asked to kill it
    # later. Under Git Bash `$!` is an MSYS pid, not a Win32 one — tasklist does
    # not know it — so on Windows the record leaves it out and dev-down kills the
    # listener's tree instead (the wrapper exits with its child).
    [ "$WINDOWS" = 1 ] || SUP_PG="$STARTED_PID"
    ready=0
    for _ in $(seq 1 30); do
      if "$PG_BIN/pg_isready$EXE" -h "$DB_HOST" -p "$DB_PORT" -q >/dev/null 2>&1; then ready=1; break; fi
      sleep 1
    done
    if [ "$ready" != 1 ]; then
      tail_log "$PG_DIR/pg.log"
      fail "PostgreSQL did not start within 30s (see the log above)"
    fi
    PID_PG="$(listener_pid "$DB_PORT")"
    info "ready (pid $PID_PG)"
    STATE_PG="started"; OURS_PG=1
  fi

  PSQL="$PG_BIN/psql$EXE"
  if [ ! -x "$PSQL" ]; then
    # Something else is serving that port (a system PostgreSQL, a manually
    # started cluster elsewhere): its name/port match ours, but its binaries are
    # not in local-pg, so we can neither inspect nor create databases here.
    warn "no psql client at $PG_BIN — assuming database $DB_NAME exists"
  else
    existing_db="$("$PSQL" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -tAc \
      "select 1 from pg_database where datname = '$DB_NAME'" 2>/dev/null | tr -d '[:space:]')"
    if [ "$existing_db" = "1" ]; then
      info "database $DB_NAME present"
    else
      "$PG_BIN/createdb$EXE" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" \
        || fail "could not create database $DB_NAME on $DB_HOST:$DB_PORT"
      info "database $DB_NAME created"
    fi
  fi

  if [ "$SCHEMA" = 1 ]; then
    step "schema"
    if [ ! -d "$ROOT/src/generated/prisma" ]; then
      info "prisma generate (client missing)"
      npx --no-install prisma generate >/dev/null 2>&1 \
        || fail "prisma generate failed — run it by hand to see why"
    fi
    # --skip-generate matters on Windows: regenerating while the dev server has
    # query_engine-windows.dll.node open fails with EPERM mid-rename and leaves
    # 21MB *.tmp copies behind. The client is only generated when it is absent.
    info "prisma db push --accept-data-loss --skip-generate"
    if DATABASE_URL="$DB_URL" npx --no-install prisma db push --accept-data-loss --skip-generate 2>&1 | indent; then
      STATE_SCHEMA="in-sync"
    else
      STATE_SCHEMA="failed"
      fail "prisma db push failed (see the output above)"
    fi
  else
    STATE_SCHEMA="skipped"
  fi
fi

# ------------------------------------------------------------- 2. socket service

SOCKET_DIR="$ROOT/mini-services/attendance-socket"
SOCKET_PORT="${SOCKET_PORT:-$(sed -n 's/.*const PORT = .*[^0-9]\([0-9]\{2,\}\)[^0-9]*;.*/\1/p' "$SOCKET_DIR/index.ts" 2>/dev/null | head -1)}"
[ -n "$SOCKET_PORT" ] || SOCKET_PORT=3003
SOCKET_JUST_STARTED=0

# bun is the declared runner but is not always installed; plain Node runs this
# service unchanged (verified — it is plain socket.io, no bun-specific APIs).
BUN=""
if command -v bun >/dev/null 2>&1; then
  BUN="$(command -v bun)"
elif [ -x "$ROOT/node_modules/bun/bin/bun$EXE" ]; then
  BUN="$ROOT/node_modules/bun/bin/bun$EXE"
elif [ -x "$ROOT/node_modules/.bin/bun$EXE" ]; then
  BUN="$ROOT/node_modules/.bin/bun$EXE"
fi
node_reads_env_file() {
  node -e 'const [M, m] = process.versions.node.split(".").map(Number); process.exit(M > 20 || (M === 20 && m >= 6) ? 0 : 1)' 2>/dev/null
}

step "live-update socket service :$SOCKET_PORT"
[ -d "$SOCKET_DIR" ] || fail "mini-services/attendance-socket is missing"
if port_taken "$SOCKET_PORT"; then
  # Same resolution as the dev server, minus the live confirmation: this service answers
  # socket.io on its port, not an HTTP identity route, so there is nothing to check its
  # boot-time claim against — it is believed on the file's own checks (this port, this
  # directory, a live pid) and the OS probe covers a service that published nothing (an
  # older build, a hand-started one).
  read -r PID_SOCKET SOCKET_PID_SOURCE <<<"$(service_pid "$SOCKET_PORT" "$SOCKET_PID_FILE" "$SOCKET_DIR")"
  info "already running${PID_SOCKET:+ (pid $PID_SOCKET, $(pid_source_text "$SOCKET_PID_SOURCE" "the socket service"))}"
  STATE_SOCKET="reused"
else
  [ -n "$(env_local SOCKET_RELAY_TOKEN)" ] || warn "SOCKET_RELAY_TOKEN is unset in .env.local — starting LISTEN-ONLY, so no dashboard can update"
  if [ ! -d "$SOCKET_DIR/node_modules/socket.io" ]; then
    info "installing mini-service dependencies"
    if [ -n "$BUN" ]; then
      ( cd "$SOCKET_DIR" && "$BUN" install --frozen-lockfile ) >>"$SOCKET_LOG" 2>&1 \
        || fail "bun install failed in mini-services/attendance-socket (see $SOCKET_LOG)"
    else
      ( cd "$SOCKET_DIR" && npm install --no-package-lock ) >>"$SOCKET_LOG" 2>&1 \
        || fail "npm install failed in mini-services/attendance-socket (see $SOCKET_LOG)"
    fi
  fi
  if [ -n "$BUN" ]; then
    RUNNER="$BUN"; RUNNER_LABEL="bun"
  elif node_reads_env_file; then
    RUNNER="$(command -v node)"; RUNNER_LABEL="node"
  else
    fail "no bun on PATH and node $(node -v 2>/dev/null) is too old for --env-file (need 20.6+)"
  fi
  info "starting with $RUNNER_LABEL"
  # The port is passed explicitly, so the service binds exactly the port this
  # script probes — whether it came from the environment or from the service's
  # own default. (node's --env-file does not override a variable that is already
  # set, so this wins over anything in .env.local.)
  # SOCKET_PID_FILE tells the service where to publish its identity, so what it writes can
  # be checked against what this run expects (and so a relocated log directory carries the
  # file with it, as it does for the dev server).
  start_detached "$SOCKET_DIR" "$SOCKET_LOG" \
    env SOCKET_PORT="$SOCKET_PORT" SOCKET_PID_FILE="$SOCKET_PID_FILE" \
    "$RUNNER" "--env-file=$(native_path "$ROOT/.env.local")" index.ts
  [ "$WINDOWS" = 1 ] || SUP_SOCKET="$STARTED_PID"
  if wait_for_port "$SOCKET_PORT" 30; then
    wait_for_published_claim "$SOCKET_PID_FILE" "$SOCKET_PORT" "$SOCKET_DIR" 5
    read -r PID_SOCKET SOCKET_PID_SOURCE <<<"$(service_pid "$SOCKET_PORT" "$SOCKET_PID_FILE" "$SOCKET_DIR")"
    info "up (pid ${PID_SOCKET:-<none>}${SOCKET_PID_SOURCE:+, $(pid_source_text "$SOCKET_PID_SOURCE" "the socket service")}${SUP_SOCKET:+ (spawned from pid $SUP_SOCKET)}, log $(native_path "$SOCKET_LOG"))"
    STATE_SOCKET="started"; SOCKET_RUNNER="$RUNNER_LABEL"; OURS_SOCKET=1
    SOCKET_JUST_STARTED=1
  else
    tail_log "$SOCKET_LOG"
    fail "socket service did not listen on $SOCKET_PORT within 30s ($(probe_detail "$SOCKET_PORT"))"
  fi
fi

# A service this run started is fresh by construction, but the check is asked either way:
# it is a handful of stats, and it is the only thing that would notice a file changing
# *during* a bring-up — which is when an absent-minded save happens.
check_source_freshness SOCKET "$SOCKET_PID_FILE" "$SOCKET_PORT" "$PID_SOCKET" "$SOCKET_DIR" "${SOCKET_RESTART_INPUTS[@]}"

handshake="$(http_code "http://localhost:$SOCKET_PORT/socket.io/?EIO=4&transport=polling")"
if [ "$handshake" = "200" ]; then
  info "socket.io handshake OK"
else
  warn "no socket.io handshake on :$SOCKET_PORT (HTTP $handshake)"
fi

# --------------------------------------------------------------- 3. dev server

# Ask the app whether it is really serving, at most once per run, and report the answer.
#
# A started app needs that answer *before* the summary, because of what it settles: the app
# publishes its own pid while its runtime boots, which a cold start can do seconds after
# the port is open (measured: ~2 s on a warm boot, ~11 s on one with a cold compiler cache),
# so a fixed few seconds of waiting for that file is a guess a slow start can outlast — and
# a pid line that names the OS probe for a server which reported itself a moment later is a
# line that lies. The app cannot answer a request before its runtime is up, so waiting for
# the answer is waiting for a publication that has certainly happened. Bounded by the same
# readiness budget as ever, and the answer is kept, so a healthy run still probes the app
# exactly once and a broken one does not wait twice.
report_app_readiness() { # $1 "silent" to obtain the answer now and print it later
  local url="http://localhost:$APP_PORT/api/schools/public" code
  if [ -z "${APP_HTTP_CODE:-}" ]; then
    if wait_for_http "$url" "$HTTP_WAIT"; then
      APP_HTTP_CODE="$(http_code "$url")"
    else
      APP_HTTP_CODE="000"
    fi
  fi
  # The started-app caller asks silently, because it wants the answer *before* naming the
  # pid but has nothing to say about it yet; the outer call is the one that speaks, so the
  # line lands where it always has — after the pid, not inside the start block.
  [ "${1:-}" = "silent" ] && return 0
  [ "${APP_READINESS_REPORTED:-0}" = 1 ] && return 0
  APP_READINESS_REPORTED=1
  code="$APP_HTTP_CODE"
  if [ "$code" = "000" ]; then
    warn "the server never answered /api/schools/public — check $DEV_LOG"
  elif [ "${code#5}" != "$code" ]; then
    warn "the server answers $code — it is up but the app is erroring; check $DEV_LOG"
  else
    info "/api/schools/public answered $code"
  fi
}

step "dev server :$APP_PORT"
DEV_ALREADY_UP=0
if port_taken "$APP_PORT"; then
  read -r PID_DEV SERVER_PID_SOURCE <<<"$(service_pid "$APP_PORT" "$SERVER_PID_FILE" "$ROOT" "$SERVER_IDENTITY_PATH")"
  info "already running${PID_DEV:+ (pid $PID_DEV, $(pid_source_text "$SERVER_PID_SOURCE"))}"
  STATE_DEV="reused"
  DEV_ALREADY_UP=1
else
  # Point the app's relay at the socket service this script manages, so an
  # overridden SOCKET_PORT cannot leave the app talking to a different port.
  # Tell the server where to publish, and on which port, so what it writes can be
  # checked against what this run expects (DEV_SERVER_PID_FILE also carries the
  # relocated log directory into the app).
  start_detached "$ROOT" "$DEV_LOG" env \
    SOCKET_SERVER_URL="http://localhost:$SOCKET_PORT" \
    DEV_SERVER_PID_FILE="$SERVER_PID_FILE" \
    DEV_SERVER_PORT="$APP_PORT" \
    npm run dev
  [ "$WINDOWS" = 1 ] || SUP_DEV="$STARTED_PID"
  info "starting (npm run dev${SUP_DEV:+, pid $SUP_DEV}, log $(native_path "$DEV_LOG"))"
  if wait_for_port "$APP_PORT" "$APP_WAIT"; then
    STATE_DEV="started"; OURS_DEV=1
    # The app has not necessarily published yet (see report_app_readiness): wait for the
    # answer first, so the line below names the route that actually settled the question.
    report_app_readiness silent
    read -r PID_DEV SERVER_PID_SOURCE <<<"$(service_pid "$APP_PORT" "$SERVER_PID_FILE" "$ROOT" "$SERVER_IDENTITY_PATH")"
    if [ -n "$PID_DEV" ]; then
      info "listening (pid $PID_DEV, $(pid_source_text "$SERVER_PID_SOURCE"))"
    else
      # Served, but nobody will say by which pid: the server published nothing this
      # script can trust *and* the OS will not name the owner (a container's
      # published port, a runner where the probe tools see nothing). Say so and carry
      # on: the port is served, which is what the callers need, and dev-down treats a
      # service it cannot verify as not ours.
      warn "listening, but neither the server nor the OS names the owner: $(probe_detail "$APP_PORT")"
    fi
  else
    tail_log "$DEV_LOG"
    fail "nothing is listening on $APP_PORT after ${APP_WAIT}s ($(probe_detail "$APP_PORT"))"
  fi
fi

# A no-op when the start above already asked (it reports once per run); this is the call
# that covers the reused case, where nothing here started the app.
report_app_readiness

if [ "$SOCKET_JUST_STARTED" = 1 ] && [ "$DEV_ALREADY_UP" = 1 ]; then
  warn "the dev server predates the socket service it just found, so its relay may"
  warn "have booted without SOCKET_RELAY_TOKEN. If dashboards don't live-update,"
  warn "restart the dev server so the relay picks the token up."
fi

# ------------------------------------------------------------------- 4. summary

read -r PID_DEV SERVER_PID_SOURCE <<<"$(service_pid "$APP_PORT" "$SERVER_PID_FILE" "$ROOT" "$SERVER_IDENTITY_PATH")"
if [ -n "$PID_DEV" ] || port_taken "$APP_PORT"; then
  APP_LISTENING=1
fi

# Whether the app's boot-time claim was confirmed by its live answer — the pid above comes
# from the live answer either way, so this is the record that the confirmation happened and
# of the one thing a file can get wrong, which `service_pid` warns about and `--json`
# carries. Empty `agrees` means there was nothing to compare (no claim, or no answer).
LISTENER_CLAIM_PID=""
LISTENER_CLAIM_AGREES=""
if [ "$APP_LISTENING" = 1 ]; then
  claim_pid="$(published_pid "$SERVER_PID_FILE" "$APP_PORT" "$ROOT")"
  answer_pid="$(answered_pid "$APP_PORT" "$SERVER_IDENTITY_PATH")"
  if [ -n "$claim_pid" ]; then
    LISTENER_CLAIM_PID="$claim_pid"
    if [ -n "$answer_pid" ]; then
      if [ "$claim_pid" = "$answer_pid" ]; then LISTENER_CLAIM_AGREES=1; else LISTENER_CLAIM_AGREES=0; fi
    fi
  fi
fi

# And that settled, whether this server is older than the code it was started from. Asked
# only when the claim is about the server that is answering: a claim the live answer
# disagreed with (the recycled-pid case) carries some other process's `startedAt`, and
# comparing files against it would be a verdict about nothing.
if [ "$APP_LISTENING" = 1 ] && claim_is_about_this_server "$SERVER_PID_FILE" "$APP_PORT"; then
  check_source_freshness DEV "$SERVER_PID_FILE" "$APP_PORT" "$PID_DEV" "$ROOT" "${APP_RESTART_INPUTS[@]}"
fi
# Re-probe instead of trusting what happened earlier: a server that started and
# then died (a Turbopack panic, a missing schema) must not be reported as up.
if [ "$APP_LISTENING" = 0 ] && [ "$STATE_DEV" = "started" ]; then
  STATE_DEV="exited"
fi
mkdir -p "$LOG_DIR"
printf '%s\n' "$PID_DEV" >"$PID_FILE"

# ------------------------------------------------------- the preview handoff

# Resolved once, from the pid re-read above, and used by the human summary and by the
# JSON so the two can never disagree about what to register. It prefers to say "not
# registerable, and here is why" over printing a call that would fail: a stale or
# unverified pid is exactly what put a dead preview in front of someone before.
# What the handoff promises is *this* URL, so this is the URL that gets asked. The readiness
# probe above answered a different question — "is the app up at all?" — with
# `/api/schools/public`, and a summary that repeated its status beside the preview call would be
# claiming the landing page answered when nothing had asked it (on CI, nothing had).
PREVIEW_URL="$(preview_url)"
PREVIEW_PID="$PID_DEV"
if [ "${APP_HTTP_CODE:-000}" = "000" ]; then
  # Nothing answered the readiness probe at all, so there is nothing to wait for here: asking
  # the landing page for PREVIEW_WAIT seconds would only delay the report that the stack is down.
  PREVIEW_HTTP="000"
else
  PREVIEW_HTTP="$(preview_url_code)"
fi
PREVIEW_READY=1
PREVIEW_NOTE=""
if [ -z "$PREVIEW_PID" ]; then
  PREVIEW_READY=0
  PREVIEW_NOTE="no process here names the owner of $APP_PORT — not the server itself ($(native_path "$SERVER_PID_FILE")) and not the OS — so there is no pid to hand over; see \"Naming a port's owner\" in .freebuff/run.md. Who is listening: $(probe_detail "$APP_PORT")"
elif [ -z "$PREVIEW_HTTP" ] || [ "$PREVIEW_HTTP" = "000" ]; then
  PREVIEW_READY=0
  PREVIEW_NOTE="pid $PREVIEW_PID owns $APP_PORT but the app never answered $PREVIEW_URL, so registering it would only show an error page — check $(native_path "$DEV_LOG")"
fi

print_summary() {
  printf '\n%s\n' "──────────────────────────────────────────────────────────────"
  printf '  %-12s %-7s %-8s %s\n' service port pid state
  printf '  %-12s %-7s %-8s %s\n' PostgreSQL "${DB_PORT:--}" "${PID_PG:--}" "$(state_text "$STATE_PG" "$PID_PG")"
  printf '  %-12s %-7s %-8s %s\n' socket.io "$SOCKET_PORT" "${PID_SOCKET:--}" \
    "$(state_text "$STATE_SOCKET" "$PID_SOCKET")${SOCKET_RUNNER:+ ($SOCKET_RUNNER)}${SOCKET_PID_SOURCE:+, $(pid_source_text "$SOCKET_PID_SOURCE" "the socket service")}"
  printf '  %-12s %-7s %-8s %s\n' dev-server "$APP_PORT" "${PID_DEV:--}" "$(state_text "$STATE_DEV" "$PID_DEV")"
  printf '  %-12s %-7s %-8s %s\n' schema - - "$STATE_SCHEMA$([ "$SCHEMA" = 1 ] || printf ' (--no-schema)')"
  printf '%s\n' "──────────────────────────────────────────────────────────────"
  printf '  %s\n' "app:     http://localhost:$APP_PORT"
  printf '  %s\n' "listener pid on $APP_PORT: ${PID_DEV:-<none>}${SERVER_PID_SOURCE:+ ($(pid_source_text "$SERVER_PID_SOURCE"))}   (also written to $(native_path "$PID_FILE"))"
  # The exact call to open this stack in a Preview tab. Printed as the tool call it
  # is, from the same verified pid above, so watching the app takes no rediscovery.
  if [ "$PREVIEW_READY" = 1 ]; then
    printf '  %s\n' "preview: $(register_preview_line "$PREVIEW_PID" | tr -d '\n')   # $PREVIEW_URL answered $PREVIEW_HTTP"
  else
    printf '  %s\n' "preview: not registerable — $PREVIEW_NOTE"
  fi
  # Whether what the preview is about to show is current code — the same two lines the run
  # warned with, kept next to the call so the table is read as a whole. A service that
  # published no boot marker says nothing here rather than the reassuring thing.
  stale_note DEV "the dev server" "$APP_PORT" "$PID_DEV"
  stale_note SOCKET "the socket service" "$SOCKET_PORT" "$PID_SOCKET"
  printf '  %s\n' "logs:    $(native_path "$DEV_LOG")  ·  $(native_path "$SOCKET_LOG")"
}

if [ "$JSON" = 1 ]; then print_summary >&2; else print_summary; fi

# ------------------------------------------------------------------ 5. the record

# The state file (what dev-down.sh acts on) is written on every run; --json prints
# the same object. A run that failed records what it started — the fail() override
# above does that — but prints no JSON, so nothing downstream can read a
# half-finished bring-up as success.
REPORT="$(build_report)"
record_state "$REPORT"

if [ "$APP_LISTENING" = 0 ]; then
  [ "$JSON" = 1 ] || printf '\n'
  fail "no process is listening on $APP_PORT"
fi

if [ "$JSON" = 1 ]; then printf '%s\n' "$REPORT"; fi
