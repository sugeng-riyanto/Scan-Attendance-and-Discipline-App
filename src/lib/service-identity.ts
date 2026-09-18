/**
 * A local service publishing its own identity at boot.
 *
 * Two things in this checkout need to answer the same question about themselves — "which
 * pid is serving me, on which port, from which checkout?" — and neither the operating
 * system nor the bring-up script can answer it reliably. It used to be the OS's job, and
 * the OS answers only for sockets whose owner you are allowed to read: CI manufactures the
 * case where nothing can (Postgres published from a service container is held by root's
 * `docker-proxy`), `ss` exits 0 there with the pid silently dropped, `lsof` says nothing
 * and exits 1, and on Windows the probe reads a `netstat` table while the listener is a
 * grandchild of the `npm`/`next` wrapper we spawned. So each service states it instead: at
 * boot it writes the pid it is running as, the port it serves, the checkout it came from
 * and which service it is, and `dev-up` reads that file rather than inferring the answer.
 *
 * One implementation, two callers, because the file is a contract with the shell:
 * `.zscripts/lib-stack.sh` (`published_pid`) checks the fields below by name, so a second
 * hand-written writer is a second place for that contract to drift. The dev server reaches
 * it through `@/lib/dev-server-identity`, which is the app-facing half of it; the socket
 * mini-service imports this module directly, since it runs from source outside the Next
 * tree.
 *
 * Deliberately narrow:
 *
 *  - **Development only, unless asked.** A production server (or a `next build`) writes
 *    nothing; the service's own env var — `DEV_SERVER_PID_FILE`, `SOCKET_PID_FILE` — opts
 *    one specific process in, which is what `dev-up` does so a scratch stack cannot
 *    overwrite the live one's file.
 *  - **Written atomically** — temp file plus rename — so a reader can never catch half a
 *    document, which is the failure a plain write would produce for a `dev-up` that runs
 *    at exactly the wrong moment.
 *  - **Removed on a clean exit**, and only while the file still names this pid, so a
 *    restart cannot delete its successor's file.
 *  - **Everything in it is checkable**, which is why the port and the working directory are
 *    there: `dev-up` rejects a file that names another port, another checkout, or a pid
 *    that is no longer alive, and falls back to probing the OS when it rejects one.
 *
 * The residual risk is a file left behind by a *killed* service whose pid has since been
 * recycled by another process: the checks above cannot tell that apart from a live service,
 * because the file makes a claim about a moment that has passed.
 *
 * So a service that can be asked live is asked live. Whoever answers on a port *is* the
 * process holding it, which makes an HTTP answer un-staleable in a way no file can be — so
 * the app serves the very document below (`GET /api/dev-identity`) and the bring-up treats
 * the boot-time file as corroboration of that answer rather than as the answer itself. A
 * claim that disagrees with the live one is reported and discarded.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The directory that marks a checkout: the bring-up scripts live in it. It is how a service
 * that runs from a subdirectory — the socket mini-service — finds the same `.zscripts/` the
 * app publishes into from the repository root.
 */
const SCRIPTS_DIR = '.zscripts'

/** How far up from a service's directory to look for the checkout before giving up. */
const MAX_WALK_UP = 12

export interface ServiceIdentity {
  /** Which service this is, so two files side by side say who wrote which. */
  service: string
  /** The process that is serving — the listener, not the wrapper that spawned it. */
  pid: number
  port: number
  /** The directory the service was started from, so two checkouts cannot be confused. */
  cwd: string
  /** When the file was written, which is a boot, not a process start time. */
  startedAt: string
  /** What published it, for a human reading the file. */
  node: string
}

/** The two things that decide *where* a service publishes. */
export interface IdentityTarget {
  /** The env var that overrides the location; `dev-up` sets it for the service it spawns. */
  envVar: string
  /** Default location, relative to the checkout root, when nothing overrides it. */
  defaultPath: string
}

export interface PublishOptions extends IdentityTarget {
  /** Named in the file, e.g. `dev-server`, `attendance-socket`. */
  service: string
  /**
   * The port the service binds, or null when this process cannot establish one — in which
   * case nothing is written, because a file naming the wrong port is worse than no file.
   */
  port: number | null
  env?: NodeJS.ProcessEnv
  cwd?: string
}

/** Files whose clean-exit cleanup has already been registered. */
const hooked = new Set<string>()

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory()
  } catch {
    return false
  }
}

/**
 * The checkout a service is running in: the nearest ancestor holding `.zscripts/`, falling
 * back to the directory itself when there is none.
 *
 * This exists because the two services start from different places — the app from the
 * repository root (`npm run dev`), the socket mini-service from its own package directory —
 * and both have to land on the same `.zscripts/`, which is the directory the bring-up
 * scripts read and write. Walking up rather than joining `..` keeps that true wherever a
 * service happens to be started from, and a checkout without `.zscripts/` (a fixture, a
 * copied directory) degrades to "beside me" rather than to somewhere outside it.
 */
export function checkoutRoot(cwd: string = process.cwd()): string {
  const start = path.resolve(cwd)
  let dir = start
  for (let depth = 0; depth < MAX_WALK_UP; depth += 1) {
    if (isDirectory(path.join(dir, SCRIPTS_DIR))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return start
}

/**
 * The file this process should publish to, or null when it should not publish at all. An
 * explicit env var always wins — that is `dev-up` asking, and it may be asking in
 * production.
 */
export function identityFilePath(
  target: IdentityTarget,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  const asked = env[target.envVar]?.trim()
  if (asked) return path.resolve(asked)
  if (env.NODE_ENV === 'production') return null
  return path.join(checkoutRoot(cwd), target.defaultPath)
}

/** A port this file is allowed to claim: a real TCP port, not a placeholder. */
function publishablePort(port: number | null): port is number {
  return Number.isInteger(port) && (port as number) > 0 && (port as number) < 65536
}

/**
 * The document itself, for this process, without writing anything: the same shape the file
 * holds. Split out so a service can also *serve* it — the app answers it over HTTP
 * (`GET /api/dev-identity`), and that answer is what the bring-up confirms a boot-time
 * claim against, since whoever answers on a port is the process that owns it.
 *
 * `startedAt` is the moment this is built, so a caller that wants it to mean "boot" must
 * build it once and keep it rather than recomputing per request.
 */
export function serviceIdentityDocument(options: {
  service: string
  port: number | null
  cwd?: string
}): ServiceIdentity | null {
  if (!publishablePort(options.port)) return null
  return {
    service: options.service,
    pid: process.pid,
    port: options.port,
    cwd: options.cwd ?? process.cwd(),
    startedAt: new Date().toISOString(),
    node: process.version,
  }
}

/**
 * Publish this process's identity, returning what was written (or null when it did not
 * write anything). Never throws: a bring-up nicety must not be able to stop a service from
 * serving, so every failure here is logged and swallowed.
 */
export function publishServiceIdentity(options: PublishOptions): ServiceIdentity | null {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const file = identityFilePath(options, env, cwd)
  if (!file) return null
  const identity = serviceIdentityDocument({ service: options.service, port: options.port, cwd })
  if (!identity) return null

  try {
    mkdirSync(path.dirname(file), { recursive: true })
    const temp = `${file}.${process.pid}.tmp`
    writeFileSync(temp, `${JSON.stringify(identity, null, 2)}\n`)
    renameSync(temp, file)
    removeOnExit(file)
    if (env.NODE_ENV !== 'production') {
      console.log(
        `[${options.service}] published pid ${identity.pid} on port ${identity.port} to ${file}`,
      )
    }
    return identity
  } catch (error) {
    console.error(`[${options.service}] could not publish its own pid:`, error)
    return null
  }
}

/** Unlink on a clean exit, but only if the file still describes this process. */
function removeOnExit(file: string): void {
  if (hooked.has(file)) return
  hooked.add(file)
  process.on('exit', () => {
    try {
      const claim = JSON.parse(readFileSync(file, 'utf8')) as Partial<ServiceIdentity>
      if (claim.pid === process.pid) rmSync(file, { force: true })
    } catch {
      /* already gone, unreadable, or someone else's — leave it alone */
    }
  })
}
