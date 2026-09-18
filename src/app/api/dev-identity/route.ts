/**
 * This server's own identity, answered by the process that owns the port.
 *
 * The bring-up script needs to know which pid is serving, and it has two ways of asking.
 * The file the app writes at boot (`@/lib/service-identity`) can be stale: it describes a
 * moment that has passed, and a service killed hard cannot delete it, so its pid can be
 * recycled by an unrelated process and still pass the file's own checks. This route cannot
 * be stale in that way — whoever answers on a port *is* the process holding it — which is
 * why `dev-up` confirms the file's claim against this answer and discards the claim when
 * the two disagree (`.zscripts/lib-stack.sh`, `answered_pid` / `service_pid`).
 *
 * The answer is the live fact (`liveDevServerIdentity`), not the boot document: the two
 * runtimes are separate module instances, so the document `instrumentation.ts` published is
 * not visible here, and a per-request timestamp would only invite a comparison it cannot
 * support. `pid` is this process's own either way.
 *
 * Two refusals, both deliberate:
 *
 *  - **Not a development server, no answer.** The same rule that governs the file governs
 *    this route (`publishesIdentity`): a production build answers 404, and a process is
 *    opted in only by the env var `dev-up` sets when it starts one.
 *  - **Loopback only.** What it discloses is this machine's own process — pid, port, working
 *    directory — and a dev server can be bound to `0.0.0.0` on a shared network. `localhost`
 *    is what a bring-up probe asks with, so nothing legitimate is lost by refusing a request
 *    that arrived by another name.
 *
 * It is also in the middleware's public paths: a bring-up probe has no session to log in
 * with, and an answer that requires one is no answer at all.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { liveDevServerIdentity, publishesIdentity } from '@/lib/dev-server-identity'

// Never a cached body: the whole point of this route is that the answer is live.
export const dynamic = 'force-dynamic'

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isLoopback(host: string): boolean {
  // `host` carries the port (`localhost:3000`), and IPv6 arrives bracketed.
  const name = host.replace(/:\d+$/, '')
  return LOOPBACK_HOSTS.has(name) || LOOPBACK_HOSTS.has(`[${name}]`)
}

/**
 * Whether this request arrived as loopback, by every name it arrived under.
 *
 * The `Host` header is what the client sent; the URL's hostname is Next's own view of the same
 * request, and the two can differ behind a proxy — those are exactly the requests this must not
 * answer, since a forwarded host is a name from somewhere other than this machine. A request
 * with no `Host` at all (a synthesized one, or a client that omits it) is judged by the URL
 * alone rather than refused for being unusual.
 */
function arrivedAsLoopback(request: NextRequest): boolean {
  const names = [request.headers.get('host'), request.nextUrl.hostname].filter(
    (name): name is string => Boolean(name),
  )
  return names.length > 0 && names.every(isLoopback)
}

export async function GET(request: NextRequest) {
  if (!publishesIdentity()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!arrivedAsLoopback(request)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const identity = liveDevServerIdentity()
  if (!identity) {
    // Serving, but unable to name the port it serves on — the one case where the app cannot
    // answer for itself, and the caller falls back to its own probes.
    return NextResponse.json({ error: 'Identity unavailable' }, { status: 503 })
  }
  return NextResponse.json(identity, { headers: { 'cache-control': 'no-store' } })
}
