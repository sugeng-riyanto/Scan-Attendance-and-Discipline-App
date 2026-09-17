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
# preview, where a wrapper pid looks alive while the listener is a grandchild.
#
# Usage:
#   npm run dev:up                    # or: bash .zscripts/dev-up.sh
#   bash .zscripts/dev-up.sh --no-schema   # skip prisma generate / db push
#   bash .zscripts/dev-up.sh --pid         # print the app-port listener pid, start nothing
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
JSON=0
for arg in "$@"; do
  case "$arg" in
    --no-schema) SCHEMA=0 ;;
    --pid) PID_ONLY=1 ;;
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
  curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$1" 2>/dev/null || printf '000'
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

# The port the dev server listens on, taken from the "dev" script so it cannot
# drift from what `npm run dev` actually does.
dev_script_port() {
  sed -n 's/.*"dev"[[:space:]]*:[[:space:]]*".*-p[[:space:]]*\([0-9]\{2,\}\).*/\1/p' package.json | head -1
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

if [ "$PID_ONLY" = 1 ]; then
  pid="$(listener_pid "$APP_PORT")"
  [ -n "$pid" ] || exit 1
  printf '%s\n' "$pid"
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
STATE_DEV="skipped"; PID_DEV=""; SUP_DEV=""; OURS_DEV=0
APP_LISTENING=0
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
  export REP_ROOT REP_STATE_FILE REP_PID_FILE REP_DEV_LOG REP_SOCKET_LOG REP_WRITTEN
  export REP_APP_PORT REP_SOCKET_PORT REP_DB_PORT REP_DB_HOST REP_DB_NAME REP_DB_USER
  export REP_SCHEMA_STATE REP_APP_LISTENING REP_PG_PORT
  export REP_PG_PID REP_PG_SUP REP_PG_STATE REP_PG_OURS
  export REP_SOCKET_PID REP_SOCKET_SUP REP_SOCKET_STATE REP_SOCKET_OURS REP_SOCKET_RUNNER
  export REP_DEV_PID REP_DEV_SUP REP_DEV_STATE REP_DEV_OURS
  node -e '
    const fs = require("fs");
    const e = process.env;
    const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));
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
      stateFile: e.REP_STATE_FILE,
      logs: { dev: e.REP_DEV_LOG, socket: e.REP_SOCKET_LOG },
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
        }),
        dev: svc(e.REP_APP_PORT, e.REP_DEV_PID, e.REP_DEV_SUP, e.REP_DEV_STATE, e.REP_DEV_OURS),
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
  PID_SOCKET="$(listener_pid "$SOCKET_PORT")"
  info "already running${PID_SOCKET:+ (pid $PID_SOCKET)}"
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
  start_detached "$SOCKET_DIR" "$SOCKET_LOG" \
    env SOCKET_PORT="$SOCKET_PORT" "$RUNNER" "--env-file=$(native_path "$ROOT/.env.local")" index.ts
  [ "$WINDOWS" = 1 ] || SUP_SOCKET="$STARTED_PID"
  if wait_for_port "$SOCKET_PORT" 30; then
    PID_SOCKET="$(listener_pid "$SOCKET_PORT")"
    info "up (pid $PID_SOCKET${SUP_SOCKET:+ (spawned from pid $SUP_SOCKET)}, log $(native_path "$SOCKET_LOG"))"
    STATE_SOCKET="started"; SOCKET_RUNNER="$RUNNER_LABEL"; OURS_SOCKET=1
    SOCKET_JUST_STARTED=1
  else
    tail_log "$SOCKET_LOG"
    fail "socket service did not listen on $SOCKET_PORT within 30s"
  fi
fi

handshake="$(http_code "http://localhost:$SOCKET_PORT/socket.io/?EIO=4&transport=polling")"
if [ "$handshake" = "200" ]; then
  info "socket.io handshake OK"
else
  warn "no socket.io handshake on :$SOCKET_PORT (HTTP $handshake)"
fi

# --------------------------------------------------------------- 3. dev server

step "dev server :$APP_PORT"
DEV_ALREADY_UP=0
if port_taken "$APP_PORT"; then
  PID_DEV="$(listener_pid "$APP_PORT")"
  info "already running${PID_DEV:+ (pid $PID_DEV)}"
  STATE_DEV="reused"
  DEV_ALREADY_UP=1
else
  # Point the app's relay at the socket service this script manages, so an
  # overridden SOCKET_PORT cannot leave the app talking to a different port.
  start_detached "$ROOT" "$DEV_LOG" env SOCKET_SERVER_URL="http://localhost:$SOCKET_PORT" npm run dev
  [ "$WINDOWS" = 1 ] || SUP_DEV="$STARTED_PID"
  info "starting (npm run dev${SUP_DEV:+, pid $SUP_DEV}, log $(native_path "$DEV_LOG"))"
  if wait_for_port "$APP_PORT" "$APP_WAIT"; then
    PID_DEV="$(listener_pid "$APP_PORT")"
    info "listening (pid $PID_DEV)"
    STATE_DEV="started"; OURS_DEV=1
  else
    tail_log "$DEV_LOG"
    fail "nothing is listening on $APP_PORT after ${APP_WAIT}s"
  fi
fi

if wait_for_http "http://localhost:$APP_PORT/api/schools/public" "$HTTP_WAIT"; then
  code="$(http_code "http://localhost:$APP_PORT/api/schools/public")"
  if [ "${code#5}" != "$code" ]; then
    warn "the server answers $code — it is up but the app is erroring; check $DEV_LOG"
  else
    info "/api/schools/public answered $code"
  fi
else
  warn "the server never answered /api/schools/public — check $DEV_LOG"
fi

if [ "$SOCKET_JUST_STARTED" = 1 ] && [ "$DEV_ALREADY_UP" = 1 ]; then
  warn "the dev server predates the socket service it just found, so its relay may"
  warn "have booted without SOCKET_RELAY_TOKEN. If dashboards don't live-update,"
  warn "restart the dev server so the relay picks the token up."
fi

# ------------------------------------------------------------------- 4. summary

PID_DEV="$(listener_pid "$APP_PORT")"
if [ -n "$PID_DEV" ] || port_taken "$APP_PORT"; then
  APP_LISTENING=1
fi
# Re-probe instead of trusting what happened earlier: a server that started and
# then died (a Turbopack panic, a missing schema) must not be reported as up.
if [ "$APP_LISTENING" = 0 ] && [ "$STATE_DEV" = "started" ]; then
  STATE_DEV="exited"
fi
mkdir -p "$LOG_DIR"
printf '%s\n' "$PID_DEV" >"$PID_FILE"

print_summary() {
  printf '\n%s\n' "──────────────────────────────────────────────────────────────"
  printf '  %-12s %-7s %-8s %s\n' service port pid state
  printf '  %-12s %-7s %-8s %s\n' PostgreSQL "${DB_PORT:--}" "${PID_PG:--}" "$(state_text "$STATE_PG" "$PID_PG")"
  printf '  %-12s %-7s %-8s %s\n' socket.io "$SOCKET_PORT" "${PID_SOCKET:--}" \
    "$(state_text "$STATE_SOCKET" "$PID_SOCKET")${SOCKET_RUNNER:+ ($SOCKET_RUNNER)}"
  printf '  %-12s %-7s %-8s %s\n' dev-server "$APP_PORT" "${PID_DEV:--}" "$(state_text "$STATE_DEV" "$PID_DEV")"
  printf '  %-12s %-7s %-8s %s\n' schema - - "$STATE_SCHEMA$([ "$SCHEMA" = 1 ] || printf ' (--no-schema)')"
  printf '%s\n' "──────────────────────────────────────────────────────────────"
  printf '  %s\n' "app:     http://localhost:$APP_PORT"
  printf '  %s\n' "listener pid on $APP_PORT: ${PID_DEV:-<none>}   (also written to $(native_path "$PID_FILE"))"
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
