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
 *     that the port is the one package.json's `dev` script pins;
 *  2. a second run starts nothing — same services, same pids, state `reused`,
 *     no "starting" line anywhere in its output;
 *  3. a service the script started and that was then killed is started again
 *     (and a service it did *not* manage is left strictly alone);
 *  4. `npm run dev:down` stops exactly what dev-up started — from the pids dev-up
 *     recorded — and leaves everything else alone, including a live pid it cannot
 *     prove is its own.
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
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = path.resolve(import.meta.dir, '../..')
const WINDOWS = process.platform === 'win32'
const ENABLED = process.env.DEV_UP_TEST === '1'
const SPAWN_TIMEOUT_MS = 240_000
const suite = ENABLED ? describe : describe.skip

if (!ENABLED) {
  console.log(
    '[dev-up.test] skipped — set DEV_UP_TEST=1 (or run `npm run test:dev-up`) with the stack up to exercise .zscripts/dev-up.sh',
  )
}

type ServiceReport = {
  port: number | null
  pid: number | null
  state: string
  runner?: string | null
  startedByDevUp?: boolean
  supervisor?: number | null
}
type DevUpReport = {
  root: string
  appPort: number
  socketPort: number
  listenerPid: number | null
  appListening: boolean
  pidFile: string
  schema: { state: string }
  services: { postgres: ServiceReport; socket: ServiceReport; dev: ServiceReport }
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
  return [...new Set(pids)].sort((a, b) => a - b)
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
        namingWhy = `the OS names no pid listening on :${appPort} — ${probeToolsReport(appPort)}`
        console.warn(
          `[dev-up.test] SKIPPING every pid-ownership assertion for the app port: ${namingWhy}. ` +
            `The script reports listenerPid=${report.listenerPid} while the port is served and answers; ` +
            'saying "no pid" rather than claiming one it cannot verify is the correct answer here, and ' +
            'the assertions that need a pid mean nothing without one. Everything observable without a ' +
            'pid is still asserted below and in the cases that follow.',
        )
        expect(report.listenerPid).toBeNull()
        expect(report.services.dev.pid).toBeNull()
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
      if (namingAvailable) {
        expect(pidOnly.status).toBe(0)
        expect((pidOnly.stdout ?? '').trim()).toBe(String(report.listenerPid))
      } else {
        expect(pidOnly.status).not.toBe(0)
        expect((pidOnly.stdout ?? '').trim()).toBe('')
      }

      // Every service is up after a bring-up run, not just the app.
      expect(listenerPids(report.socketPort).length).toBeGreaterThan(0)
      expect(['reused', 'started']).toContain(report.services.socket.state)
      expect(['reused', 'external']).toContain(report.services.postgres.state)
      expect(report.schema.state).toBe('in-sync')
    },
    300_000,
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
        console.warn(
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
        console.warn(
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
        console.warn(
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
        console.warn('[dev-up.test] SKIPPING: no scratch stack to re-run dev-down against.')
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
})
