/**
 * dev-up.sh bring-up & idempotency E2E
 *
 * `/api/setup`-style confidence for the script that starts the whole local
 * stack. Everything here is asserted against the **operating system**, not
 * against the script's own report, because the report is exactly what has been
 * wrong before: `.freebuff/preview.pid` once named a wrapper process that was
 * alive while the listener was a grandchild.
 *
 *  1. the run reports a pid that really owns the app port (the OS's list of
 *     listeners on that port contains it), that the port serves the app, and
 *     that the port is the one package.json's `dev` script pins — with both
 *     services having published that pid about *themselves* at boot, so no pid
 *     dev-up manages is inferred from the OS probe;
 *  2. a second run starts nothing — same services, same pids, state `reused`,
 *     no "starting" line anywhere in its output;
 *  3. a service the script started and that was then killed is started again
 *     (and a service it did *not* manage is left strictly alone);
 *  4. `npm run dev:down` stops exactly what dev-up started — from the pids dev-up
 *     recorded — and leaves everything else alone, including a live pid it cannot
 *     prove is its own;
 *  5. a running service that predates the source it was started from is reported as
 *     stale — the file, how long after the start, and the command — while one that does
 *     not is left in peace, checked both ways against services whose boot markers this
 *     suite controls. That is the failure mode a preview is most exposed to: a tab
 *     attached to a process that will never re-read its own config.
 *
 * WHY OPT-IN. It spawns and kills real processes, so it is not part of
 * `bun test`: set DEV_UP_TEST=1. The stack should already be up
 * (`npm run dev:up`) so the run is seconds rather than a cold Turbopack boot.
 *
 *   npm run test:dev-up
 *   DEV_UP_TEST=1 bun test src/lib/dev-up.test.ts
 *
 * The kill/restart case deliberately runs against a **scratch socket port**
 * (SOCKET_PORT + DEV_UP_LOG_DIR) and asserts the live socket service on 3003 is
 * untouched, so a developer's running preview keeps its live-update relay.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { spawn, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(import.meta.dir, '../..')
const WINDOWS = process.platform === 'win32'
const ENABLED = process.env.DEV_UP_TEST === '1'
const SPAWN_TIMEOUT_MS = 240_000
const suite = ENABLED ? describe : describe.skip

/**
 * Report that this suite proved less than it wanted to, and why.
 *
 * Locally this is just a line on stderr. Under GitHub Actions it is also a
 * `::notice::` workflow command, which GitHub turns into a run annotation — because
 * a step that passed while quietly skipping its ownership assertions looks exactly
 * like a step that passed by checking them, and the job log that would tell the two
 * apart needs repository admin rights to read.
 */
function announceSkip(message: string): void {
  console.warn(message)
  if (process.env.CI) {
    // One line: a newline would truncate the annotation at the first break.
    console.log(`::notice title=dev-up suite skipped an assertion::${message.replace(/\s+/g, ' ').trim()}`)
  }
}

if (!ENABLED) {
  console.log(
    '[dev-up.test] skipped — set DEV_UP_TEST=1 (or run `npm run test:dev-up`) with the stack up to exercise .zscripts/dev-up.sh',
  )
  if (process.env.CI) {
    // Disclosure, not an alarm: the full-suite step runs this file without
    // DEV_UP_TEST, and skipping is the intended behaviour there. The step that
    // *must* have it enforced does not rely on this notice — it fails outright.
    console.log(
      '::notice title=opt-in suite not part of this step::src/lib/dev-up.test.ts skipped itself because DEV_UP_TEST is not 1 — expected outside the bring-up step, which sets it and fails if it does not arrive.',
    )
  }
}

type ServiceReport = {
  port: number | null
  pid: number | null
  state: string
  runner?: string | null
  startedByDevUp?: boolean
  supervisor?: number | null
  /**
   * Whether this process predates the source it was started from. Absent on services that
   * run no source of ours (PostgreSQL). `checked: false` means there was no boot marker to
   * compare against — an older build, or a claim removed by hand — which is not the same
   * answer as `stale: false`, and the difference is the point of having both.
   */
  staleness?: {
    checked: boolean
    stale: boolean | null
    startedAt: string | null
    changedAt: string | null
    changedIn: string | null
    path: string | null
    restart: string | null
  }
}
type DevUpReport = {
  root: string
  appPort: number
  socketPort: number
  listenerPid: number | null
  /** Which route named it: `self` (the server's own boot-time report) or `probe`. */
  listenerPidSource: string | null
  /** The same question for the socket service, which reports itself the same way. */
  socketPidSource: string | null
  /**
   * The app's boot-time claim, and whether the answer on the port agreed with it. `pid` null
   * means there was no claim to check; `agrees` null that there was nothing to check it
   * against — the state a disagreement is only meaningful in contrast to.
   */
  listenerClaim: { pid: number | null; agrees: boolean | null }
  appListening: boolean
  pidFile: string
  schema: { state: string }
  services: { postgres: ServiceReport; socket: ServiceReport; dev: ServiceReport }
  /** The Preview-tab handoff: the URL, the verified pid, and the call to run. */
  preview: {
    url: string
    pid: number | null
    httpCode: string | null
    ready: boolean
    register: { tool: string; url: string; pid: number | null } | null
    note: string | null
  }
}

// ------------------------------------------------------------------ processes

function findBash(): string | null {
  const candidates = [
    process.env.DEV_UP_BASH,
    'bash',
    WINDOWS ? 'C:\\Program Files\\Git\\bin\\bash.exe' : null,
    WINDOWS ? 'C:\\Program Files (x86)\\Git\\bin\\bash.exe' : null,
  ].filter((c): c is string => Boolean(c))
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', 'printf ok'], { encoding: 'utf8' })
    if ((probe.stdout ?? '').trim() === 'ok') return candidate
  }
  return null
}

const BASH = ENABLED ? findBash() : null

function run(cmd: string, args: string[], env: Record<string, string> = {}, cwd = REPO) {
  return spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout: SPAWN_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, ...env },
  })
}

function toolAvailable(cmd: string, args: string[]): boolean {
  const r = spawnSync(cmd, args, { encoding: 'utf8' })
  return !(r.error && (r.error as NodeJS.ErrnoException).code === 'ENOENT')
}

/** Script stdout is a single JSON object (progress goes to stderr); parse it. */
function devUp(extraArgs: string[] = [], env: Record<string, string> = {}) {
  if (!BASH) throw new Error('no bash found — set DEV_UP_BASH to its path')
  const r = run(BASH, [path.join('.zscripts', 'dev-up.sh'), '--json', ...extraArgs], env)
  const stdout = r.stdout ?? ''
  const stderr = r.stderr ?? ''
  const start = stdout.indexOf('{')
  if (start === -1) {
    throw new Error(
      `dev-up.sh exited ${r.status} with no JSON on stdout.\n--- stderr ---\n${stderr.slice(-4000)}\n--- stdout ---\n${stdout.slice(-2000)}`,
    )
  }
  return {
    report: JSON.parse(stdout.slice(start)) as DevUpReport,
    stdout,
    stderr,
    status: r.status ?? -1,
  }
}

type DownService = { port: number | null; pid: number | null; action: string; reason: string | null }
type DownReport = {
  root: string
  stateFile: string
  pidFile: string
  pidFileRemoved: boolean
  /** Each service's own boot-time claim, removed only when this run stopped it. */
  serverPidFile: string | null
  serverPidFileRemoved: boolean
  socketPidFile: string | null
  socketPidFileRemoved: boolean
  services: Record<string, DownService>
  stopped: string[]
  stillListening: number[]
}

/** Same contract as devUp(): run the script with --json and parse its report. */
function devDown(env: Record<string, string> = {}) {
  if (!BASH) throw new Error('no bash found — set DEV_UP_BASH to its path')
  const r = run(BASH, [path.join('.zscripts', 'dev-down.sh'), '--json'], env)
  const stdout = r.stdout ?? ''
  const stderr = r.stderr ?? ''
  const start = stdout.indexOf('{')
  if (start === -1) {
    throw new Error(
      `dev-down.sh exited ${r.status} with no JSON on stdout.\n--- stderr ---\n${stderr.slice(-4000)}\n--- stdout ---\n${stdout.slice(-2000)}`,
    )
  }
  return {
    report: JSON.parse(stdout.slice(start)) as DownReport,
    stdout,
    stderr,
    status: r.status ?? -1,
  }
}

// Throwaway processes the crafted-state cases need: one that LISTENs (to be a
// plausible service) and one that merely stays alive (to stand in for a pid the
// record names but that no longer owns its port).
const helperProcs: ReturnType<typeof spawn>[] = []
const helperDirs: string[] = []

function startHelper(code: string): number {
  const child = spawn(process.env.DEV_UP_NODE ?? 'node', ['-e', code], { stdio: 'ignore' })
  helperProcs.push(child)
  return child.pid as number
}

const listenOn = (port: number) => `require("net").createServer(() => {}).listen(${port}, "127.0.0.1")`
const idleForever = 'setInterval(() => {}, 1000)'

/**
 * The pids the OS says are LISTENING on a port — the independent check on what
 * the script reports. Empty means "nothing is serving this port".
 */
function listenerPids(port: number): number[] {
  if (WINDOWS) {
    const r = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    const pids = (r.stdout ?? '')
      .split('\n')
      .map((line) => line.trim().split(/\s+/))
      .filter((f) => f[0] === 'TCP' && f[3] === 'LISTENING' && f[1]?.endsWith(`:${port}`))
      .map((f) => Number(f[4]))
      .filter((n) => Number.isInteger(n) && n > 0)
    return [...new Set(pids)].sort((a, b) => a - b)
  }
  const lsof = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  if (!(lsof.error && (lsof.error as NodeJS.ErrnoException).code === 'ENOENT') && lsof.status === 0) {
    return (lsof.stdout ?? '')
      .split('\n')
      .map((l) => Number(l.trim()))
      .filter((n) => Number.isInteger(n) && n > 0)
  }
  const ss = spawnSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' })
  const pids = [...(ss.stdout ?? '').matchAll(/pid=(\d+)/g)].map((m) => Number(m[1]))
  if (pids.length) return [...new Set(pids)].sort((a, b) => a - b)
  return pidsByProc(port)
}

/** The LISTEN socket's inode for `port`, read from /proc/net/tcp (state 0A). */
function listenInode(port: number): string | null {
  const hex = port.toString(16).toUpperCase().padStart(4, '0')
  for (const file of ['/proc/net/tcp', '/proc/net/tcp6']) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const line of text.split('\n').slice(1)) {
      const f = line.trim().split(/\s+/)
      if (f[3] === '0A' && f[1]?.endsWith(`:${hex}`)) return f[9] ?? null
    }
  }
  return null
}

/**
 * Pids resolved through /proc alone — no lsof, no ss, nothing to install. The
 * kernel's own bookkeeping: /proc/net/tcp names each TCP socket by inode, and its
 * holder has that inode open as `socket:[inode]` under /proc/<pid>/fd. A listener
 * owned by another user stays invisible here too, which is the truth rather than a
 * limitation of the probe: no tool can attribute a socket it may not read.
 */
function pidsByProc(port: number): number[] {
  const inode = listenInode(port)
  if (!inode) return []
  const found: number[] = []
  for (const entry of readdirSync('/proc')) {
    const pid = Number(entry)
    if (!Number.isInteger(pid) || pid <= 0) continue
    let fds: string[]
    try {
      fds = readdirSync(`/proc/${pid}/fd`)
    } catch {
      continue // another user's process, or one that just exited
    }
    for (const fd of fds) {
      try {
        if (readlinkSync(`/proc/${pid}/fd/${fd}`) === `socket:[${inode}]`) {
          found.push(pid)
          break
        }
      } catch {
        // the fd closed between listing and reading it
      }
    }
  }
  return [...new Set(found)].sort((a, b) => a - b)
}

/**
 * What this platform can actually say about a port, for the skip and failure
 * messages: which tools exist, what they printed, and — implicitly — whether
 * anything here can name the process holding it.
 */
function probeToolsReport(port: number): string {
  if (WINDOWS) {
    const r = spawnSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
    const rows = (r.stdout ?? '')
      .split('\n')
      .filter((l) => l.includes(`:${port}`) && l.includes('LISTENING'))
    return rows.length ? rows.map((l) => l.trim()).join(' | ') : 'netstat names no listener'
  }
  const parts: string[] = []
  const lsof = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' })
  parts.push(
    lsof.error
      ? 'lsof: absent'
      : `lsof: exit ${lsof.status}, out ${JSON.stringify((lsof.stdout ?? '').trim())}`,
  )
  const ss = spawnSync('ss', ['-ltnpH', `sport = :${port}`], { encoding: 'utf8' })
  parts.push(
    ss.error
      ? 'ss: absent'
      : `ss: exit ${ss.status}, out ${JSON.stringify((ss.stdout ?? '').trim())}`,
  )
  const inode = listenInode(port)
  parts.push(
    inode
      ? `/proc/net/tcp: LISTEN socket inode ${inode}, named by ${pidsByProc(port).length ? 'a readable holder' : 'no process we may read'}`
      : '/proc/net/tcp: no LISTEN socket for this port',
  )
  return parts.join('; ')
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to someone we may not signal.
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Kill a process this test started. Unlike the script, the test may kill. */
function killTree(pid: number): boolean {
  if (WINDOWS) return run('taskkill', ['/PID', String(pid), '/T', '/F']).status === 0
  try {
    process.kill(pid, 'SIGKILL')
    return true
  } catch {
    return false
  }
}

async function waitFor(predicate: () => boolean, ms: number): Promise<boolean> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return predicate()
}

function freePort(from: number): number {
  for (let port = from; port < from + 60; port += 1) {
    if (listenerPids(port).length === 0) return port
  }
  throw new Error(`no free port in ${from}..${from + 60}`)
}

/** The port package.json's `dev` script pins — read independently of the script. */
function devScriptPort(): number {
  const pkg = JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const match = pkg.scripts.dev.match(/-p\s*(\d+)/)
  if (!match) throw new Error('package.json dev script has no -p <port>')
  return Number(match[1])
}

async function httpStatus(url: string): Promise<number> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    return response.status
  } catch {
    return 0
  }
}

// ------------------------------------------------------------------ the suite

suite('local stack — dev-up.sh / dev-down.sh', () => {
  let first: ReturnType<typeof devUp> | undefined
  let second: ReturnType<typeof devUp> | undefined
  let appPort = 0
  let realSocketPort = 0
  let scratchDir = ''
  let scratchPort = 0
  /**
   * Whether this platform can name the pid holding a port — measured, not assumed.
   *
   * A GitHub Linux runner could not, for the dev server: dev-up served the app on
   * :3000 and answered 200 while reporting `listenerPid: null`, because neither
   * lsof nor ss named the owner. That is a state the script handles deliberately —
   * `pid: null` in the report, an empty pid file, `--pid` exiting non-zero with no
   * output — so the assertions that are *about* a pid cannot be demanded there.
   * Everything observable without one (the port is served, it answers, a second run
   * starts nothing, a killed service comes back, dev-down stops what it started) is
   * still asserted; only naming is skipped, and each skip says why on stdout.
   */
  let namingAvailable = false
  let namingWhy = ''
  /** Whether the scratch socket service could be identified by pid (see above). */
  let socketPidNameable = false
  /** Whether the scratch bring-up happened at all, so later cases can skip cleanly. */
  let scratchStackStarted = false
  let scratchPid: number | null = null

  beforeAll(() => {
    if (!BASH) throw new Error('no bash on PATH — set DEV_UP_BASH to its absolute path')
    if (!WINDOWS) {
      const canProbe = toolAvailable('lsof', ['-v']) || toolAvailable('ss', ['-V'])
      if (!canProbe) {
        throw new Error('need lsof or ss to verify which pid owns a port (apt-get install lsof iproute2)')
      }
    }
    expect(existsSync(path.join(REPO, '.zscripts', 'dev-up.sh'))).toBe(true)
  })

  afterAll(async () => {
    if (scratchPid && isAlive(scratchPid)) killTree(scratchPid)
    if (scratchDir) rmSync(scratchDir, { recursive: true, force: true })
    for (const helper of helperProcs) if (helper.pid) killTree(helper.pid)
    for (const dir of helperDirs) rmSync(dir, { recursive: true, force: true })
    // Safety net: this suite must never leave the developer with a dead socket
    // service, so if 3003 is empty at the end, put the stack back up.
    if (BASH && realSocketPort && listenerPids(realSocketPort).length === 0) {
      console.log('[dev-up.test] socket service is gone — re-running dev-up.sh to restore it')
      run(BASH, [path.join('.zscripts', 'dev-up.sh')])
    }
  })

  it(
    'brings the stack up and reports the pid the OS says owns the app port',
    async () => {
      first = devUp()
      const report = first.report
      appPort = report.appPort
      realSocketPort = report.socketPort

      // The reported port is the one the dev script actually pins.
      expect(report.appPort).toBe(devScriptPort())
      expect(report.appListening).toBe(true)
      // Can this platform name the pid that owns a port? Ask the OS, and treat the
      // script's answer as wrong in both directions — naming is only "available"
      // when the OS itself lists a listener (see `namingAvailable`).
      const owners = listenerPids(appPort)
      namingAvailable = owners.length > 0
      if (namingAvailable) {
        expect(report.listenerPid).not.toBeNull()
        expect(report.services.dev.pid).toBe(report.listenerPid)

        // The pid the script reported must be in the OS's own list of listeners.
        expect(owners).toContain(report.listenerPid as number)
        expect(isAlive(report.listenerPid as number)).toBe(true)
      } else {
        namingWhy =
          `nothing on this platform names the pid listening on :${appPort}, ` +
          `including /proc, which needs nothing installed — ${probeToolsReport(appPort)}`
        announceSkip(
          `[dev-up.test] SKIPPING the pid-ownership assertions for the app port: ${namingWhy}. ` +
            'This platform cannot say who holds the port, so "is the reported pid really the ' +
            'listener?" has nothing here to check against. That is not the same as having no pid: ' +
            'the app answers /api/dev-identity about itself, so the script reports one — and that it ' +
            'is a live pid, and the one both the file and the live answer agree on, is asserted ' +
            'below rather than skipped. What no test can assert here is that the OS agrees.',
        )
        expect(report.listenerPid).not.toBeNull()
        expect(report.services.dev.pid).toBe(report.listenerPid)
        expect(isAlive(report.listenerPid as number)).toBe(true)
        expect(report.listenerClaim).toEqual({ pid: report.listenerPid, agrees: true })
      }

      // …and whoever owns it must be this app, not a stray process.
      expect(await httpStatus(`http://localhost:${appPort}/api/schools/public`)).toBe(200)

      // The pid file must agree with what the script printed — including when the
      // answer is "no pid", which it spells as an empty file, not the string "null".
      expect(readFileSync(path.join(REPO, '.zscripts', 'dev-up.pid'), 'utf8').trim()).toBe(
        report.listenerPid === null ? '' : String(report.listenerPid),
      )

      // `--pid` is the same answer without starting anything: the pid, or a
      // non-zero exit and no output at all when it cannot name one.
      if (!BASH) throw new Error('no bash')
      const pidOnly = run(BASH, [path.join('.zscripts', 'dev-up.sh'), '--pid'])
        // Keyed off the report, not off naming: with the file in place this answers on
        // platforms that cannot name the holder at all, which is the point of it.
        if (report.listenerPid === null) {
          expect(pidOnly.status).not.toBe(0)
          expect((pidOnly.stdout ?? '').trim()).toBe('')
        } else {
          expect(pidOnly.status).toBe(0)
          expect((pidOnly.stdout ?? '').trim()).toBe(String(report.listenerPid))
        }

        // The server states its own pid at boot, and that is the primary route: it
        // cannot be defeated by a platform where no probe names the holder (which is
        // what CI manufactures for a service container's port). A run against this
        // repo must use it — if this fails, the dev server was started before the
        // app published anything and needs restarting (`npm run dev:down && npm run dev:up`).
        expect(report.listenerPidSource).toBe('self')
        const claimed = JSON.parse(
          readFileSync(path.join(REPO, '.zscripts', 'dev-server.json'), 'utf8'),
        ) as { pid: number; port: number; cwd: string; startedAt: string }
        expect(claimed.port).toBe(appPort)
        expect(claimed.pid).toBe(report.listenerPid as number)
        expect(claimed.cwd).toBe(REPO)
        expect(Number.isNaN(Date.parse(claimed.startedAt))).toBe(false)
        // And the OS agrees with the report, whenever this platform is able to say:
        // the two routes must not be able to disagree about who is serving.
        if (namingAvailable) expect(owners).toContain(claimed.pid)

        // …and this is where that pid actually comes from: the answer on the port. A file is
        // a claim about a moment that has passed; a response comes from whoever holds the
        // port, so it cannot be stale in that way. The file agreeing with it — same pid, same
        // port, same checkout — is what makes the file corroboration rather than the source.
        const answered = (await (
          await fetch(`http://localhost:${appPort}/api/dev-identity`)
        ).json()) as Record<string, unknown>
        expect(answered.service).toBe('dev-server')
        expect(answered.port).toBe(appPort)
        expect(answered.cwd).toBe(REPO)
        expect(answered.pid).toBe(claimed.pid)
        // No boot timestamp in the live answer, and that is deliberate rather than missing:
        // Next evaluates instrumentation and route handlers as different module instances
        // (measured — the published document is not visible to the handler), so the only
        // timestamp available here would be built per request. A number that moves on every
        // ask reads like evidence of staleness when it is not, so it is left to the file,
        // whose whole job is to record one moment. `pid` is this process either way, and that
        // is the fact being confirmed.
        expect(Object.keys(answered)).not.toContain('startedAt')
        expect(report.listenerClaim).toEqual({ pid: claimed.pid, agrees: true })

        // The Preview-tab handoff. It has to be the SAME pid the OS named, in the one
        // form a preview needs: handing over a wrapper pid, or a "null" that looks like
        // a number, is the mistake this suite exists to catch in the first place.
        const previewOnly = run(BASH, [path.join('.zscripts', 'dev-up.sh'), '--preview'])
        const expectedCall = `register_preview({ url: "http://localhost:${appPort}/", pid: ${report.listenerPid} })`
      expect(report.preview.url).toBe(`http://localhost:${appPort}/`)
      if (namingAvailable) {
        // Thrown rather than asserted, with the script's own words: a bare "1 !== 0" says
        // nothing about which of the two refusals fired, and this is exactly the kind of
        // failure that is only reachable on a runner — the first run of it here reported the
        // number and left the reason for whoever could not read the step log.
        if (previewOnly.status !== 0) {
          throw new Error(
            `dev-up.sh --preview exited ${previewOnly.status}, expected 0.\n` +
              `--- stdout ---\n${previewOnly.stdout}\n--- stderr ---\n${previewOnly.stderr}`,
          )
        }
        expect((previewOnly.stdout ?? '').trim()).toBe(expectedCall)
        expect(report.preview.ready).toBe(true)
        expect(report.preview.pid).toBe(report.listenerPid)
        expect(report.preview.register).toEqual({
          tool: 'register_preview',
          url: `http://localhost:${appPort}/`,
          pid: report.listenerPid,
        })
        // The human summary says it in the same words, so nobody has to work it out.
        expect(first.stderr).toContain(`preview: ${expectedCall}`)
      } else {
        // No pid to stand behind: refuse, with the reason, instead of printing a call
        // that would register a dead preview.
        expect(previewOnly.status).not.toBe(0)
        expect((previewOnly.stdout ?? '').trim()).toBe('')
        expect(report.preview.ready).toBe(false)
        expect(report.preview.register).toBeNull()
        expect(report.preview.note).toBeTruthy()
        expect(first.stderr).toContain('preview: not registerable')
      }

      // The socket service reports itself exactly as the app does, so its pid is not
      // inferred either — same strictness, and the same requirement that the stack was
      // brought up by a dev-up that knows about the reporting.
      expect(report.socketPidSource).toBe('self')
      const socketClaim = JSON.parse(
        readFileSync(path.join(REPO, '.zscripts', 'attendance-socket.json'), 'utf8'),
      ) as { service: string; pid: number; port: number; cwd: string; startedAt: string }
      expect(socketClaim.service).toBe('attendance-socket')
      expect(socketClaim.port).toBe(report.socketPort)
      expect(socketClaim.cwd).toBe(path.join(REPO, 'mini-services', 'attendance-socket'))
      expect(socketClaim.pid).toBe(report.services.socket.pid as number)
      expect(Number.isNaN(Date.parse(socketClaim.startedAt))).toBe(false)
      // …and, whenever this platform names the holder at all, the OS agrees with it —
      // the two services must not be able to disagree about who is serving.
      const socketOwners = listenerPids(report.socketPort)
      if (socketOwners.length > 0) expect(socketOwners).toContain(socketClaim.pid)

      // Every service is up after a bring-up run, not just the app.
      expect(listenerPids(report.socketPort).length).toBeGreaterThan(0)
      expect(['reused', 'started']).toContain(report.services.socket.state)
      expect(['reused', 'external']).toContain(report.services.postgres.state)
      expect(report.schema.state).toBe('in-sync')

      // Both services' age was checked against their own boot marker — which is what makes
      // it a check rather than a guess — and its two halves agree whichever way it came out.
      // A stack someone left running with an edited `.env.local` is a legitimate answer here
      // (and the next case asserts the comparison itself); `checked: false` is the state that
      // would mean there was nothing to compare against, which is not true of a stack this
      // suite brought up.
      for (const name of ['socket', 'dev'] as const) {
        const staleness = report.services[name].staleness
        expect(staleness?.checked).toBe(true)
        expect(staleness?.startedAt).toBeTruthy()
        expect(staleness?.stale).toBe(Boolean(staleness?.path))
      }
    },
      300_000,
    )

    it(
      'takes the live answer over the file, discards a stale claim, and refuses an unconfirmable one',
      async () => {
        if (!BASH) throw new Error('no bash')

        // `--pid` answers without starting anything, so it is the cheapest way to ask
        // "which route did that pid come from?". A scratch log directory keeps these cases
        // off the live `.zscripts/dev-server.json`, while ROOT stays the real checkout, so
        // the app under discussion is the real one — which is what makes the answer here
        // independently knowable: it is what the port itself says, fetched in this process.
        const logDir = mkdtempSync(path.join(os.tmpdir(), 'dev-up-published-'))
        helperDirs.push(logDir)
        const file = path.join(logDir, 'dev-server.json')
        const env = { DEV_UP_LOG_DIR: logDir }
        const script = path.join('.zscripts', 'dev-up.sh')
        const live = listenerPids(appPort)[0] ?? null
        const answeredPid = (await (
          await fetch(`http://localhost:${appPort}/api/dev-identity`)
        ).json()) as { pid: number }
        const answer = String(answeredPid.pid)

        const claim = (over: Record<string, unknown>) =>
          writeFileSync(
            file,
            JSON.stringify({
              service: 'dev-server',
              pid: process.pid,
              port: appPort,
              cwd: REPO,
              startedAt: new Date().toISOString(),
              node: process.version,
              ...over,
            }),
          )
        const askPid = () => {
          const res = run(BASH, [script, '--pid'], env)
          return { status: res.status as number, pid: (res.stdout ?? '').trim(), stderr: res.stderr ?? '' }
        }
        // Every case below that keeps the app answering has to come back to the same pid:
        // the one the port itself reported. Whatever the file says is secondary now.
        const expectLiveAnswer = (got: { status: number; pid: string }) => {
          expect(got.status).toBe(0)
          expect(got.pid).toBe(answer)
        }

        // 1. No file at all: the answer on the port is still the answer. This is the path a
        //    server that predates the reporting, or one started outside `npm run dev` on a
        //    platform the probe cannot name, now takes — it used to end in "no pid".
        expect(existsSync(file)).toBe(false)
        expectLiveAnswer(askPid())

        // 2. Claims that fail their own checks are ignored, one at a time.
        claim({ port: appPort + 1 })
        expectLiveAnswer(askPid())
        claim({ cwd: path.join(os.tmpdir(), 'another-checkout') })
        expectLiveAnswer(askPid())
        claim({ pid: 999_999 })
        expectLiveAnswer(askPid())

        // 3. A claim that passes every check the file can be held to — this port, this
        //    checkout, a pid that is alive — and is still not the server. That is the case a
        //    file cannot detect on its own (a service killed hard, its pid later recycled),
        //    and the reason the live route exists: the process holding the port says
        //    otherwise, so the claim is discarded rather than believed.
        claim({ pid: process.pid })
        const stale = askPid()
        expectLiveAnswer(stale)
        expect(stale.pid).not.toBe(String(process.pid))
        expect(stale.stderr).toContain('treating that claim as stale')

        // …and the report says the same thing in machine-readable form, so a caller reading
        // `--json` learns the file was stale rather than having to parse a warning.
        const staleRun = devUp(['--no-schema'], env)
        expect(staleRun.report.listenerPid).toBe(answeredPid.pid)
        expect(staleRun.report.listenerClaim).toEqual({ pid: process.pid, agrees: false })
        expect(staleRun.report.listenerPidSource).toBe('self')
        expect(staleRun.stderr).toContain('treating that claim as stale')

        // 4. A claim that agrees is corroboration, not the source: the same pid either way,
        //    and the report records that the two routes were compared and agreed. The suite's
        //    first case asserts this of the live stack; here it is asserted of a file this
        //    test wrote, which is what makes it a statement about the comparison rather than
        //    about the app's own bookkeeping.
        claim({ pid: Number(answer) })
        const agreedRun = devUp(['--no-schema'], env)
        expect(agreedRun.report.listenerPid).toBe(answeredPid.pid)
        expect(agreedRun.report.listenerClaim).toEqual({ pid: Number(answer), agrees: true })
        expect(agreedRun.stderr).not.toContain('stale')

        // 5. Nothing on the port answers its identity route — an older build, or a different
        //    program entirely — so no claim can be confirmed, and an unconfirmable claim is
        //    not believed even when every check on the file itself passes. The answer has to
        //    come from the probe, or be "no pid": never the file. A scratch checkout is used
        //    here because the point is a port the app does not answer on.
        const dir = mkdtempSync(path.join(os.tmpdir(), 'dev-up-unconfirmed-'))
        const silentLogs = mkdtempSync(path.join(os.tmpdir(), 'dev-up-unconfirmed-logs-'))
        helperDirs.push(dir, silentLogs)
        mkdirSync(path.join(dir, '.zscripts'), { recursive: true })
        for (const name of ['dev-up.sh', 'dev-down.sh', 'lib-stack.sh']) {
          copyFileSync(path.join(REPO, '.zscripts', name), path.join(dir, '.zscripts', name))
        }
        const stubPort = freePort(3360)
        writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify({ scripts: { dev: `next dev -p ${stubPort}` } }),
        )
        // Answers HTTP, but not with an identity document: exactly what a build without the
        // route (or an unrelated server) looks like to the confirmation step.
        const stub = startHelper(
          `require("http").createServer((q, s) => { s.statusCode = 404; s.end("not here") }).listen(${stubPort}, "127.0.0.1")`,
        )
        expect(await waitFor(() => listenerPids(stubPort).length > 0, 15_000)).toBe(true)
        writeFileSync(
          path.join(silentLogs, 'dev-server.json'),
          JSON.stringify({
            service: 'dev-server',
            pid: process.pid, // alive, and not what is serving the port
            port: stubPort, // and a claim about the very port being asked
            cwd: dir,
            startedAt: new Date().toISOString(),
            node: process.version,
          }),
        )
        const unconfirmed = run(
          BASH,
          [path.join('.zscripts', 'dev-up.sh'), '--pid'],
          { DEV_UP_LOG_DIR: silentLogs },
          dir,
        )
        const probed = listenerPids(stubPort)[0] ?? null
        if (probed === null) {
          announceSkip(
            `[dev-up.test] SKIPPING the last half of the unconfirmable-claim case: nothing on ` +
              `this platform names the pid listening on :${stubPort}, so there is no pid for the ` +
              `probe to fall back to — but the claim naming ${process.pid} must still not be it, ` +
              `which is asserted first below. ${probeToolsReport(stubPort)}`,
          )
          expect((unconfirmed.stdout ?? '').trim()).not.toBe(String(process.pid))
        } else {
          expect(unconfirmed.status).toBe(0)
          expect((unconfirmed.stdout ?? '').trim()).toBe(String(probed))
          expect((unconfirmed.stdout ?? '').trim()).not.toBe(String(process.pid))
        }
        expect(isAlive(stub)).toBe(true)
      },
      180_000,
    )

    it(
      'refuses a preview call it cannot stand behind, and names the pid when it can',
    async () => {
      if (!BASH) throw new Error('no bash')

      // A scratch checkout — the same two scripts, a package.json pinning a port of
      // its own, no stack — so the three possible answers are exercised without
      // touching the live 3000/3003: no listener at all, a listener that never
      // speaks HTTP, and one that really serves.
      const dir = mkdtempSync(path.join(os.tmpdir(), 'dev-up-preview-'))
      const logDir = mkdtempSync(path.join(os.tmpdir(), 'dev-up-preview-logs-'))
      helperDirs.push(dir, logDir)
      mkdirSync(path.join(dir, '.zscripts'), { recursive: true })
      for (const file of ['dev-up.sh', 'dev-down.sh', 'lib-stack.sh']) {
        copyFileSync(path.join(REPO, '.zscripts', file), path.join(dir, '.zscripts', file))
      }
      const port = freePort(3451)
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ scripts: { dev: `next dev -p ${port}` } }),
      )
      const env = { DEV_UP_LOG_DIR: logDir }
      const script = path.join('.zscripts', 'dev-up.sh')

      // 1. Nothing is listening: there is no pid, so there is no call to print.
      const nothing = run(BASH, [script, '--preview'], env, dir)
      expect(nothing.status).not.toBe(0)
      expect((nothing.stdout ?? '').trim()).toBe('')
      expect(nothing.stderr).toContain(`nothing here names the process listening on ${port}`)

      // 2. A port that accepts TCP and never answers HTTP: a pid, but registering it
      //    would put an error page in front of someone, so it is refused too.
      startHelper(listenOn(port))
      await waitFor(() => listenerPids(port).length > 0, 15_000)
      const silent = run(BASH, [script, '--preview'], env, dir)
      expect(silent.status).not.toBe(0)
      expect((silent.stdout ?? '').trim()).toBe('')
      expect(silent.stderr).toContain('never answered')

      // 3. Now it really serves. The printed call must name this port and the pid the
      //    OS itself lists for it — not the helper's parent, not a bare "null".
      const silentPid = listenerPids(port)[0]
      if (silentPid) killTree(silentPid)
      await waitFor(() => listenerPids(port).length === 0, 15_000)
      const servingPid = startHelper(
        `require("http").createServer((q, s) => s.end("ok")).listen(${port}, "127.0.0.1")`,
      )
      await waitFor(() => listenerPids(port).length > 0, 15_000)
      expect(listenerPids(port)).toContain(servingPid)

      const ready = run(BASH, [script, '--preview'], env, dir)
      expect(ready.status).toBe(0)
      expect((ready.stdout ?? '').trim()).toBe(
        `register_preview({ url: "http://localhost:${port}/", pid: ${servingPid} })`,
      )
    },
    120_000,
  )

  it(
    'starts nothing on the second run',
    () => {
      if (!first) throw new Error('the first run never happened')
      const before = listenerPids(appPort)
      const beforeSocket = listenerPids(first.report.socketPort)

      second = devUp()
      const report = second.report

      // Nothing is reported as freshly started…
      expect(['reused', 'external']).toContain(report.services.postgres.state)
      expect(report.services.socket.state).toBe('reused')
      expect(report.services.dev.state).toBe('reused')
      expect(report.schema.state).toBe('in-sync')

      // …the same pids come back…
      expect(report.services.dev.pid).toBe(first.report.services.dev.pid)
      expect(report.services.socket.pid).toBe(first.report.services.socket.pid)
      if (first.report.services.postgres.pid) {
        expect(report.services.postgres.pid).toBe(first.report.services.postgres.pid)
      }
      expect(report.listenerPid).toBe(first.report.listenerPid)

      // …no duplicate landed on the ports…
      expect(listenerPids(appPort)).toEqual(before)
      expect(listenerPids(first.report.socketPort)).toEqual(beforeSocket)

      // …and the human output never claims to have started anything.
      expect(second.stdout).not.toMatch(/starting \(/)
      expect(second.stderr).not.toMatch(/starting \(/)
    },
    180_000,
  )

  it(
    'starts a service again after it is killed, and leaves the live one alone',
    async () => {
      if (!first || !second) throw new Error('the first two runs never happened')
      scratchPort = freePort(3210)
      scratchDir = mkdtempSync(path.join(os.tmpdir(), 'dev-up-test-'))
      const env = { SOCKET_PORT: String(scratchPort), DEV_UP_LOG_DIR: scratchDir }
      const liveSocketBefore = listenerPids(realSocketPort)
      const appBefore = listenerPids(appPort)

      // A first run on the scratch port: the script starts a socket service of
      // its own, which is ours to kill.
      const started = devUp(['--no-schema'], env)
      scratchStackStarted = true
      expect(started.report.socketPort).toBe(scratchPort)
      expect(started.report.services.socket.port).toBe(scratchPort)
      expect(started.report.schema.state).toBe('skipped')
      expect(started.report.services.socket.state).toBe('started')
      expect(['bun', 'node']).toContain(started.report.services.socket.runner ?? '')

      // The scratch service reports itself into the scratch log directory, not the live
      // one: the override carries the claim with it, so neither stack can read the other's.
      expect(started.report.socketPidSource).toBe('self')
      const scratchClaim = JSON.parse(
        readFileSync(path.join(scratchDir, 'attendance-socket.json'), 'utf8'),
      ) as { pid: number; port: number; cwd: string }
      expect(scratchClaim.port).toBe(scratchPort)
      expect(scratchClaim.cwd).toBe(path.join(REPO, 'mini-services', 'attendance-socket'))
      expect(scratchClaim.pid).toBe(started.report.services.socket.pid as number)

      const firstPid = started.report.services.socket.pid
      socketPidNameable = firstPid !== null

      // The handle to kill with: the listener when it is nameable, otherwise the
      // supervisor pid dev-up recorded. Either way the behavioural proof is the
      // same — the port must go quiet, and a later run must bring it back.
      const killablePid = firstPid ?? started.report.services.socket.supervisor ?? null

      if (killablePid === null) {
        // Nothing on this platform can name the process, so there is no handle to
        // kill and the restart path cannot be exercised. Say so and move on rather
        // than asserting something the platform cannot support.
        announceSkip(
          `[dev-up.test] SKIPPING the kill/restart case for the scratch socket on :${scratchPort}: ` +
            `neither a listener pid nor a supervisor pid is available (${probeToolsReport(scratchPort)}).`,
        )
        expect(await httpStatus(`http://localhost:${scratchPort}/socket.io/?EIO=4&transport=polling`)).toBe(200)
        scratchPid = null
        return
      }

      if (socketPidNameable) {
        expect(listenerPids(scratchPort)).toContain(firstPid as number)
      } else {
        announceSkip(
          `[dev-up.test] SKIPPING the pid-name assertions for the scratch socket on :${scratchPort}: ` +
            `${probeToolsReport(scratchPort)}. Its process is still killed below, by the supervisor pid ` +
            'dev-up recorded, and the port going quiet is what proves that pid really owned it.',
        )
      }
      expect(await httpStatus(`http://localhost:${scratchPort}/socket.io/?EIO=4&transport=polling`)).toBe(200)

      // The scratch run used the overridden log dir, not the live one. "No pid" is
      // spelled as an empty file, not the string "null".
      expect(existsSync(path.join(scratchDir, 'dev-up-socket.log'))).toBe(true)
      expect(readFileSync(path.join(scratchDir, 'dev-up.pid'), 'utf8').trim()).toBe(
        started.report.listenerPid === null ? '' : String(started.report.listenerPid),
      )

      // Kill it. The port going quiet is what proves the pid really owned it,
      // rather than merely being alive.
      expect(killTree(killablePid as number)).toBe(true)
      expect(await waitFor(() => listenerPids(scratchPort).length === 0, 15_000)).toBe(true)

      // The next run must put it back — serving again, and under a new pid.
      const restarted = devUp(['--no-schema'], env)
      expect(restarted.report.services.socket.state).toBe('started')
      const secondPid = restarted.report.services.socket.pid
      if (secondPid === null) {
        expect(restarted.report.services.socket.supervisor).not.toBeNull()
      } else {
        expect(secondPid).not.toBe(firstPid)
        expect(listenerPids(scratchPort)).toContain(secondPid)
      }
      expect(await httpStatus(`http://localhost:${scratchPort}/socket.io/?EIO=4&transport=polling`)).toBe(200)

      // The services nobody killed are exactly where they were.
      expect(listenerPids(realSocketPort)).toEqual(liveSocketBefore)
      expect(listenerPids(appPort)).toEqual(appBefore)
      expect(restarted.report.listenerPid).toBe(second.report.listenerPid)

      // Deliberately left running: the next case has dev-down stop it, which is
      // the path a developer uses to get their machine back.
      scratchPid = secondPid ?? restarted.report.services.socket.supervisor ?? null
    },
    300_000,
  )

  it(
    'dev-down stops exactly what dev-up started and leaves the live stack alone',
    async () => {
      if (!first || !scratchStackStarted) {
        announceSkip(
          '[dev-up.test] SKIPPING: the scratch stack was never started (see the kill/restart case), ' +
            'so there is nothing for dev-down to stop.',
        )
        return
      }
      const statePath = path.join(scratchDir, 'dev-up.state.json')
      expect(existsSync(statePath)).toBe(true)

      // The record is what dev-down acts on: dev-up started the socket on the
      // scratch port, and merely found PostgreSQL and the dev server.
      const recorded = JSON.parse(readFileSync(statePath, 'utf8')) as {
        services: Record<string, ServiceReport>
      }
      expect(recorded.services.socket.startedByDevUp).toBe(true)
      expect(recorded.services.postgres.startedByDevUp).toBe(false)
      expect(recorded.services.dev.startedByDevUp).toBe(false)

      const stoppedPid = scratchPid as number
      const liveSocket = listenerPids(realSocketPort)
      const liveApp = listenerPids(appPort)
      if (socketPidNameable) {
        expect(recorded.services.socket.pid).toBe(stoppedPid)
        expect(listenerPids(scratchPort)).toEqual([stoppedPid])
      } else {
        // The record cannot name the listener on this platform, so what matters is
        // that it does not claim one it cannot verify — dev-down still has to stop
        // the service, which the assertions below check by port.
        expect(recorded.services.socket.pid).toBeNull()
        expect(listenerPids(scratchPort).length).toBeGreaterThan(0)
      }

      const down = devDown({ SOCKET_PORT: String(scratchPort), DEV_UP_LOG_DIR: scratchDir })
      expect(down.status).toBe(0)
      expect(down.report.stopped).toEqual(['socket'])
      expect(down.report.services.socket.action).toBe('stopped')
      expect(down.report.services.socket.pid).toBe(stoppedPid)
      // The claim goes with the service it describes. A killed service cannot clean up
      // after itself, and a stale claim naming a since-recycled pid is the one way the
      // file route can be wrong — so removing it is part of stopping it.
      expect(down.report.socketPidFileRemoved).toBe(true)
      expect(existsSync(path.join(scratchDir, 'attendance-socket.json'))).toBe(false)
      expect(down.report.services.postgres.action).toBe('left-alone')
      expect(down.report.services.dev.action).toBe('left-alone')

      // The scratch service is gone…
      expect(await waitFor(() => listenerPids(scratchPort).length === 0, 15_000)).toBe(true)

      // …and everything the developer was using is exactly where it was.
      expect(listenerPids(realSocketPort)).toEqual(liveSocket)
      expect(listenerPids(appPort)).toEqual(liveApp)
      expect(await httpStatus(`http://localhost:${realSocketPort}/socket.io/?EIO=4&transport=polling`)).toBe(200)

      scratchPid = null
    },
    180_000,
  )

  it(
    'dev-down is safe to re-run: what is already gone is reported, nothing is killed twice',
    () => {
      if (!scratchStackStarted) {
        announceSkip('[dev-up.test] SKIPPING: no scratch stack to re-run dev-down against.')
        return
      }

      // Snapshot first: what the re-run may legitimately do depends entirely on
      // whether anything is still serving the scratch port when it starts.
      const servedBefore = listenerPids(scratchPort).length > 0
      const down = devDown({ SOCKET_PORT: String(scratchPort), DEV_UP_LOG_DIR: scratchDir })
      expect(down.status).toBe(0)
      expect(down.report.services.socket.action).not.toBe('failed')

      if (!servedBefore) {
        // The ordinary case: the previous case stopped it, so this run has nothing
        // to do and must say so rather than signalling anything a second time.
        expect(down.report.services.socket.action).toBe('already-down')
        expect(down.report.stopped).toEqual([])
      } else {
        // Something is serving the scratch port again. Stopping it is correct — but
        // that is not the state this case exists to check, so it is said out loud
        // instead of being accepted silently.
        console.warn(
          `[dev-up.test] :${scratchPort} was served again before the re-run (${probeToolsReport(scratchPort)}), ` +
            `so this run reported "${down.report.services.socket.action}" rather than "already-down"`,
        )
        expect(down.report.services.socket.action).toBe('stopped')
        expect(down.report.stopped).toEqual(['socket'])
      }

      // Either way, the stack the developer is using is untouched.
      expect(listenerPids(appPort).length).toBeGreaterThan(0)
    },
    120_000,
  )

  it(
    'dev-down stops only what the record calls its own and never an unverified pid',
    async () => {
      if (!first) throw new Error('the first run never happened')
      const dir = mkdtempSync(path.join(os.tmpdir(), 'dev-down-rec-'))
      helperDirs.push(dir)
      const oursPort = freePort(3400)
      const theirsPort = freePort(3450)
      const idlePort = freePort(3500)

      const fakeApp = startHelper(listenOn(oursPort))
      const foreign = startHelper(listenOn(theirsPort))
      const idle = startHelper(idleForever)
      expect(await waitFor(() => listenerPids(oursPort).length > 0, 10_000)).toBe(true)
      expect(await waitFor(() => listenerPids(theirsPort).length > 0, 10_000)).toBe(true)
      expect(listenerPids(idlePort).length).toBe(0)

      writeFileSync(path.join(dir, 'dev-up.pid'), `${fakeApp}\n`)
      writeFileSync(
        path.join(dir, 'dev-up.state.json'),
        JSON.stringify(
          {
            root: first.report.root,
            written: new Date().toISOString(),
            appPort: oursPort,
            socketPort: theirsPort,
            dbPort: null,
            pidFile: path.join(dir, 'dev-up.pid'),
            stateFile: path.join(dir, 'dev-up.state.json'),
            services: {
              // ours, and the pid still owns its port -> stopped, pid file removed
              dev: { port: oursPort, pid: fakeApp, supervisor: null, state: 'started', startedByDevUp: true },
              // someone else's live service -> untouched
              socket: { port: theirsPort, pid: foreign, supervisor: null, state: 'reused', startedByDevUp: false },
              // 'ours' by the record, but that pid no longer owns the port -> untouched
              postgres: { port: idlePort, pid: idle, supervisor: null, state: 'started', startedByDevUp: true },
            },
          },
          null,
          2,
        ),
      )

      const down = devDown({ DEV_UP_LOG_DIR: dir })
      expect(down.status).toBe(0)
      expect(down.report.services.dev.action).toBe('stopped')
      expect(down.report.services.socket.action).toBe('left-alone')
      expect(down.report.services.socket.reason).toBe('not started by dev-up')
      expect(down.report.services.postgres.action).toBe('already-down')
      expect(down.report.pidFileRemoved).toBe(true)
      expect(existsSync(path.join(dir, 'dev-up.pid'))).toBe(false)
      expect(down.report.stopped).toEqual(['dev'])

      expect(await waitFor(() => listenerPids(oursPort).length === 0, 15_000)).toBe(true)
      // The bystanders are untouched: three separate reasons to leave a pid alone,
      // and not one of them ended in a kill.
      expect(listenerPids(theirsPort)).toEqual([foreign])
      expect(isAlive(foreign)).toBe(true)
      expect(isAlive(idle)).toBe(true)
    },
    180_000,
  )

  it(
    'dev-down refuses a recorded pid that no longer owns the port',
    async () => {
      if (!first) throw new Error('the first run never happened')
      const dir = mkdtempSync(path.join(os.tmpdir(), 'dev-down-mismatch-'))
      helperDirs.push(dir)
      const livePort = freePort(3550)
      const owner = startHelper(listenOn(livePort))
      const stale = startHelper(idleForever)
      expect(await waitFor(() => listenerPids(livePort).length > 0, 10_000)).toBe(true)

      writeFileSync(
        path.join(dir, 'dev-up.state.json'),
        JSON.stringify({
          root: first.report.root,
          written: new Date().toISOString(),
          services: {
            socket: { port: livePort, pid: stale, supervisor: null, state: 'started', startedByDevUp: true },
          },
        }),
      )

      const down = devDown({ DEV_UP_LOG_DIR: dir })
      expect(down.status).toBe(0)
      expect(down.report.services.socket.action).toBe('left-alone')
      expect(down.report.services.socket.reason).toBe('recorded pid does not own the port')
      expect(down.report.stopped).toEqual([])
      // Neither the pid the record names nor the service actually on the port.
      expect(isAlive(stale)).toBe(true)
      expect(listenerPids(livePort)).toEqual([owner])
    },
    120_000,
  )

  it('dev-down does nothing at all when there is no record', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'dev-down-empty-'))
    helperDirs.push(dir)
    const down = devDown({ DEV_UP_LOG_DIR: dir })
    expect(down.status).toBe(0)
    expect(down.report.services).toEqual({})
    expect(down.report.stopped).toEqual([])
    expect(listenerPids(appPort).length).toBeGreaterThan(0)
  })

  it(
    'says when a running service predates the source it was started from',
    async () => {
      if (!BASH) throw new Error('no bash')

      // A scratch checkout whose two services are helpers this test controls — including one
      // that answers the app's identity route about itself — so the only variable left is
      // time: the boot marker each claim carries, against the mtimes of the files that
      // service was started from. Touching the live stack's source or its claims is not an
      // option: a real developer is watching those.
      const dir = mkdtempSync(path.join(os.tmpdir(), 'dev-up-stale-'))
      const logDir = mkdtempSync(path.join(os.tmpdir(), 'dev-up-stale-logs-'))
      helperDirs.push(dir, logDir)
      mkdirSync(path.join(dir, '.zscripts'), { recursive: true })
      // dev-up requires the socket package directory to exist; the port it probes belongs to a
      // helper, so nothing is ever started from it.
      const socketDir = path.join(dir, 'mini-services', 'attendance-socket')
      mkdirSync(socketDir, { recursive: true })
      for (const file of ['dev-up.sh', 'dev-down.sh', 'lib-stack.sh']) {
        copyFileSync(path.join(REPO, '.zscripts', file), path.join(dir, '.zscripts', file))
      }
      const port = freePort(3480)
      const socketPort = freePort(3490)
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ scripts: { dev: `next dev -p ${port}` } }),
      )
      // This checkout was not created an hour ago, so the two restart-required files it starts
      // with are dated back to before the boot markers below. What this case varies is time, and
      // a `package.json` written moments ago is newer than any marker meant to precede it.
      const twoHoursAgo = new Date(Date.now() - 7_200_000)
      utimesSync(path.join(dir, 'package.json'), twoHoursAgo, twoHoursAgo)
      // The socket package gets a real file rather than staying an empty directory: this
      // fixture lives in the OS temp directory, and one local run had that empty directory
      // vanish mid-case. Nothing here or in `.zscripts` removes a directory (the only deletions
      // are the claim files a service takes with it on a clean exit), so a directory with
      // content in it is the fixture that cannot be mistaken for scratch. Rewritten in the last
      // part, where a newer copy of it is the case under test.
      const socketSource = path.join(socketDir, 'index.ts')
      writeFileSync(socketSource, '// the source this running copy was started from\n')
      utimesSync(socketSource, twoHoursAgo, twoHoursAgo)

      // Whoever answers a port is the process holding it, so a helper that answers the
      // identity route truthfully takes the app's place here: the pid dev-up reports is this
      // helper's own, and the claim below is confirmed against that live answer exactly as a
      // real server's claim is.
      const appHelper = startHelper(
        [
          'const http = require("http");',
          'http.createServer((q, s) => {',
          '  if (q.url.startsWith("/api/dev-identity")) {',
          '    s.setHeader("content-type", "application/json");',
          '    s.end(JSON.stringify({ service: "dev-server", pid: process.pid, port: ' +
            `${port}, cwd: ${JSON.stringify(dir)}, node: process.version }));`,
          '  } else { s.end("ok") }',
          `}).listen(${port}, "127.0.0.1");`,
          'setInterval(() => {}, 1000);',
        ].join('\n'),
      )
      // The socket port answers too, so dev-up's handshake probe is a fast 200 rather than a
      // curl timeout; the service there is never the subject of these assertions.
      const socketHelper = startHelper(
        `require("http").createServer((q, s) => s.end("ok")).listen(${socketPort}, "127.0.0.1"); ` +
          'setInterval(() => {}, 1000)',
      )
      expect(await waitFor(() => listenerPids(port).length > 0, 15_000)).toBe(true)
      expect(await waitFor(() => listenerPids(socketPort).length > 0, 15_000)).toBe(true)
      expect(listenerPids(port)).toContain(appHelper)
      expect(listenerPids(socketPort)).toContain(socketHelper)

      const env = { DEV_UP_LOG_DIR: logDir, SOCKET_PORT: String(socketPort) }
      const script = path.join('.zscripts', 'dev-up.sh')
      const devUpIn = (args: string[] = []) => {
        const res = run(BASH, [script, '--json', ...args], env, dir)
        const stdout = res.stdout ?? ''
        const start = stdout.indexOf('{')
        if (start === -1) {
          throw new Error(
            `the scratch dev-up exited ${res.status} with no JSON:\n${(res.stderr ?? '').slice(-2000)}`,
          )
        }
        return {
          report: JSON.parse(stdout.slice(start)) as DevUpReport,
          stdout,
          stderr: res.stderr ?? '',
          status: res.status ?? -1,
        }
      }

      // Both claims: about these helpers, in this checkout, written an hour ago.
      const bootedAnHourAgo = new Date(Date.now() - 3_600_000).toISOString()
      const devClaim = (over: Record<string, unknown> = {}) =>
        writeFileSync(
          path.join(logDir, 'dev-server.json'),
          JSON.stringify({
            service: 'dev-server',
            pid: appHelper,
            port,
            cwd: dir,
            startedAt: bootedAnHourAgo,
            node: process.version,
            ...over,
          }),
        )
      const socketClaim = (over: Record<string, unknown> = {}) =>
        writeFileSync(
          path.join(logDir, 'attendance-socket.json'),
          JSON.stringify({
            service: 'attendance-socket',
            pid: socketHelper,
            port: socketPort,
            cwd: socketDir,
            startedAt: bootedAnHourAgo,
            node: process.version,
            ...over,
          }),
        )

      // 1. Nothing has changed since either service booted: the comparison ran, and found
      //    nothing. This is the answer that must not be confused with "could not tell".
      devClaim()
      socketClaim()
      const current = devUpIn(['--no-schema'])
      expect(current.status).toBe(0)
      expect(current.report.services.dev.staleness).toEqual({
        checked: true,
        stale: false,
        startedAt: bootedAnHourAgo,
        changedAt: null,
        changedIn: null,
        path: null,
        restart: null,
      })
      expect(current.report.services.socket.staleness?.checked).toBe(true)
      expect(current.stderr).not.toContain('still runs the code from before')

      // 2. A restart-required input of the app, written now. `.env.local` is the canonical
      //    case — the process captured what it read at import, so a running server cannot
      //    pick the new value up — and it is asserted by name, because *which* files count
      //    is the policy this case exists to pin.
      writeFileSync(path.join(dir, '.env.local'), 'SOCKET_RELAY_TOKEN=stale-test\n')
      const stale = devUpIn(['--no-schema'])
      expect(stale.report.services.dev.staleness).toMatchObject({
        checked: true,
        stale: true,
        path: '.env.local',
        startedAt: bootedAnHourAgo,
        restart: 'npm run dev:down && npm run dev:up',
      })
      expect(stale.report.services.dev.staleness?.changedAt).toBeTruthy()
      expect(stale.report.services.dev.staleness?.changedIn).toMatch(/^[0-9]+[dhms]/)
      // Said on stderr, with the file, the reason and the command — not just a flag…
      expect(stale.stderr).toContain('.env.local')
      expect(stale.stderr).toContain('still runs the code from before')
      expect(stale.stderr).toContain('npm run dev:down && npm run dev:up')
      // …and in the summary, beside the preview call it is a caveat on.
      expect(stale.stderr).toMatch(/stale:\s+the dev server on :\d+/)
      // The socket service is stale for the same reason and from the same file: dev-up starts
      // it with `--env-file=.env.local`, so its environment came from there too.
      expect(stale.report.services.socket.staleness).toMatchObject({
        checked: true,
        stale: true,
        path: '.env.local',
      })

      // 3. `--preview` still prints the call — the pid and the URL are current, and watching
      //    the app as it stands is usually what someone wants — and says the same thing.
      const preview = run(BASH, [script, '--preview'], env, dir)
      expect(preview.status).toBe(0)
      expect((preview.stdout ?? '').trim()).toBe(
        `register_preview({ url: "http://localhost:${port}/", pid: ${appHelper} })`,
      )
      expect(preview.stderr).toContain('.env.local')

      // 4. The same server, booted after the change: nothing to report. Time is the only
      //    difference, which is what makes this a statement about the comparison rather than
      //    about the files.
      devClaim({ startedAt: new Date().toISOString() })
      const fresh = devUpIn(['--no-schema'])
      expect(fresh.report.services.dev.staleness).toMatchObject({
        checked: true,
        stale: false,
        path: null,
      })
      expect(fresh.stderr).not.toMatch(/stale:\s+the dev server on/)
      // …and only the app: the socket service is still behind `.env.local`, which is the same
      // file for a different reason. One verdict per service, not one for the stack.
      expect(fresh.stderr).toMatch(/stale:\s+the socket service on/)

      // 5. No boot marker is not the same answer as "current": there is nothing to compare
      //    against, and the report says so instead of reassuring anyone.
      devClaim({ startedAt: undefined })
      const unknown = devUpIn(['--no-schema'])
      expect(unknown.report.services.dev.staleness).toEqual({
        checked: false,
        stale: null,
        startedAt: null,
        changedAt: null,
        changedIn: null,
        path: null,
        restart: null,
      })
      expect(unknown.stderr).not.toMatch(/stale:\s+the dev server on/)

      // 6. The other service, and the other reason. No config file is involved here: the
      //    socket mini-service is executed from source with no watcher at all, so a file
      //    inside its own directory leaves a running copy behind its own code.
      writeFileSync(socketSource, '// the source this running copy was started from\n')
      const staleSocket = devUpIn(['--no-schema'])
      expect(staleSocket.report.services.socket.staleness).toMatchObject({
        checked: true,
        stale: true,
        path: 'mini-services/attendance-socket/index.ts',
      })
      expect(staleSocket.stderr).toMatch(/stale:\s+the socket service on :\d+/)
      expect(staleSocket.stderr).toContain('no watcher')
    },
    300_000,
  )
})
