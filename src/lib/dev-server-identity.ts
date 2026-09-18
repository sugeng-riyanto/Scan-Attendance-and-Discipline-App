/**
 * The dev server's half of the boot-time self-reporting in `@/lib/service-identity`.
 *
 * The mechanism — where the file goes, how it is written, checked and cleaned up — lives in
 * that module, because a second service (the socket mini-service) publishes the same
 * document and the shell reads both with one checker. What is specific to the app is here:
 * the file name, the env var `dev-up` uses to place it, how a dev server knows the port it
 * is serving on, and the HTTP route that answers the same document (`IDENTITY_PATH`).
 *
 * The app calls this first thing from `src/instrumentation.ts`, whose `register()` runs in
 * the Node.js runtime at boot. The file is written then; the route answers the same facts
 * about the process for the life of the process, so `dev-up` can confirm what was published
 * against what is answering (`.zscripts/lib-stack.sh`, `service_pid`) instead of asking the
 * OS which pid owns the port — or trusting a file that may outlive the process that wrote it.
 *
 * One measured fact shapes the route: Next evaluates `instrumentation` and the route during
 * different module instances even inside one process, so the boot document is *not* visible
 * to the handler (and a per-request document would carry a timestamp that moves). Hence the
 * live answer is built by whichever runtime is answering, and carries the pid — `process.pid`,
 * which is the same process either way, and the one fact the confirmation needs.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  identityFilePath,
  publishServiceIdentity,
  type PublishOptions,
  type ServiceIdentity,
} from '@/lib/service-identity'

/** What the app publishes as, so the two services' files are told apart. */
export const SERVICE_NAME = 'dev-server'

/**
 * Where a hand-started `npm run dev` publishes, relative to the checkout it runs in.
 * `dev-up` defaults to the same path, and passes `DEV_SERVER_PID_FILE` when its log
 * directory has been relocated.
 */
export const DEFAULT_PID_FILE = path.join('.zscripts', 'dev-server.json')

/**
 * The env var that overrides the location. Named here rather than inlined so the shell side
 * and this module cannot disagree about it.
 */
export const PID_FILE_ENV = 'DEV_SERVER_PID_FILE'

/**
 * Where this process answers the same document over HTTP.
 *
 * A file is a claim about a moment that has passed and can therefore be stale; a response
 * on the port cannot be, because it comes from whoever owns the port. That is why the
 * bring-up asks this before believing the file (`.zscripts/lib-stack.sh`, `answered_pid`),
 * and why the middleware lets it through unauthenticated — a request that has to log in
 * first is no use to a bring-up probe. The route refuses to answer at all outside a
 * development server (see `GET` in `src/app/api/dev-identity/route.ts`), and only for a
 * loopback host, since what it discloses is this machine's own process: a pid, a port, a
 * working directory.
 */
export const IDENTITY_PATH = '/api/dev-identity'

/** The document the app writes about itself — see `ServiceIdentity`. */
export type DevServerIdentity = ServiceIdentity

/**
 * The file this process should publish to, or null when it should not publish at all.
 * An explicit `DEV_SERVER_PID_FILE` always wins — that is `dev-up` asking, and it may be
 * asking in production.
 */
export function pidFilePath(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  return identityFilePath({ envVar: PID_FILE_ENV, defaultPath: DEFAULT_PID_FILE }, env, cwd)
}

/**
 * The port to publish, or null when nothing here can establish one — in which case nothing
 * is written and `dev-up` falls back to the OS probe, which is the honest outcome: a file
 * naming the wrong port would be worse than no file at all.
 *
 * Order: `DEV_SERVER_PORT` (what `dev-up` tells the server it started), then `PORT` (the
 * conventional override), then the `dev` script's own `-p` flag — read exactly as `dev-up`
 * reads it, so a hand-started server and the script cannot disagree.
 */
export function publishablePort(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): number | null {
  for (const candidate of [env.DEV_SERVER_PORT, env.PORT]) {
    const port = Number(candidate)
    if (candidate && Number.isInteger(port) && port > 0 && port < 65536) return port
  }
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    const match = /-p\s*(\d{2,})/.exec(pkg.scripts?.dev ?? '')
    if (match) {
      const port = Number(match[1])
      if (Number.isInteger(port) && port > 0 && port < 65536) return port
    }
  } catch {
    /* no readable package.json — nothing to read a port out of */
  }
  return null
}

/**
 * Publish the dev server's identity, returning what was written (or null when it did not
 * write anything). Never throws: a bring-up nicety must not be able to stop the server from
 * serving, so every failure here is logged and swallowed by the shared writer.
 */
export function publishDevServerIdentity(
  options: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): DevServerIdentity | null {
  const env = options.env ?? process.env
  const cwd = options.cwd ?? process.cwd()
  const publish: PublishOptions = {
    service: SERVICE_NAME,
    envVar: PID_FILE_ENV,
    defaultPath: DEFAULT_PID_FILE,
    port: publishablePort(env, cwd),
    env,
    cwd,
  }
  return publishServiceIdentity(publish)
}

/**
 * What this process can say about itself when asked, live: who is on which port, from where.
 *
 * Deliberately *not* the boot document. It omits `startedAt`, because the runtime answering
 * here is not necessarily the one that published (measured — Next keeps them as separate
 * module instances), and a timestamp built per request is worse than none: it invites the
 * comparison it cannot support. What it does carry is `pid`, and that is `process.pid` of the
 * process holding the port, which is exactly what the bring-up confirms its file against.
 */
export interface LiveServerIdentity {
  service: string
  pid: number
  port: number
  cwd: string
  node: string
}

export function liveDevServerIdentity(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): LiveServerIdentity | null {
  const port = publishablePort(env, cwd)
  if (port === null) return null
  return { service: SERVICE_NAME, pid: process.pid, port, cwd, node: process.version }
}

/** Whether this process is one that publishes at all — the rule the HTTP route answers by. */
export function publishesIdentity(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): boolean {
  return pidFilePath(env, cwd) !== null
}
