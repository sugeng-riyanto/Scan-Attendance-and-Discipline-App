/**
 * `src/app/api/dev-identity/route.ts` — the live answer the bring-up confirms a claim against.
 *
 * The handler is a plain function, so it is called directly here rather than through a server:
 * what these cases pin is the pair of refusals that make it safe to leave unauthenticated (not
 * a development server; not a loopback host), that the answer names *this* process, and the one
 * field it deliberately does not carry. The end-to-end behaviour — a stale claim naming a live
 * but unrelated pid being discarded in favour of this answer — is asserted against the real
 * stack in `dev-up.test.ts`.
 *
 * No database, no server, and `process.env` is never mutated: the environment rules are asked
 * of the functions that read an env argument.
 */
import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/dev-identity/route'
import { SERVICE_NAME, liveDevServerIdentity, publishesIdentity } from '@/lib/dev-server-identity'

/** The port the app's own dev script pins — what this process would be serving on. */
function devScriptPort(): number {
  const pkg = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  const match = pkg.scripts.dev.match(/-p\s*(\d+)/)
  if (!match) throw new Error('package.json dev script has no -p <port>')
  return Number(match[1])
}

const get = (url: string) => GET(new NextRequest(url))

describe('GET /api/dev-identity', () => {
  it('names this process, on the port the dev script pins, for a loopback host', async () => {
    const response = await get('http://localhost:3000/api/dev-identity')
    expect(response.status).toBe(200)

    const body = (await response.json()) as Record<string, unknown>
    expect(body.service).toBe(SERVICE_NAME)
    expect(body.pid).toBe(process.pid)
    expect(body.port).toBe(devScriptPort())
    expect(body.cwd).toBe(process.cwd())
    // Never a cached body: the whole point of this route is that the answer is live.
    expect(response.headers.get('cache-control')).toBe('no-store')
    // And no boot timestamp, deliberately. The runtime answering here is not necessarily the
    // one that published the file (Next keeps them as separate module instances), so the only
    // timestamp available would be built per request — a number that moves on every ask and
    // reads like evidence of staleness when it is not. See `liveDevServerIdentity`.
    expect(Object.keys(body)).not.toContain('startedAt')
  })

  it('answers the other loopback spellings, and refuses a host that is not loopback', async () => {
    expect((await get('http://127.0.0.1:3000/api/dev-identity')).status).toBe(200)
    expect((await get('http://[::1]:3000/api/dev-identity')).status).toBe(200)

    // A dev server can be bound to 0.0.0.0 on a shared network, and what this discloses is
    // this machine's own process — so a request that did not arrive as loopback gets nothing.
    for (const host of ['192.168.1.5:3000', '0.0.0.0:3000', 'dev.example.test', '[2001:db8::1]:3000']) {
      const refused = await get(`http://${host}/api/dev-identity`)
      expect(refused.status).toBe(404)
      expect(await refused.json()).toEqual({ error: 'Not found' })
    }
  })

  it('is refused by the same environment rule the file is written under', () => {
    // The route's first guard is `publishesIdentity()`: a process that would not write a claim
    // does not answer one either. Production answers nothing unless it was opted in — which is
    // what `dev-up` does for the server it starts.
    expect(publishesIdentity({ NODE_ENV: 'production' }, '/checkout')).toBe(false)
    expect(
      publishesIdentity({ NODE_ENV: 'production', DEV_SERVER_PID_FILE: '/tmp/dev-server.json' }, '/checkout'),
    ).toBe(true)
    expect(publishesIdentity({ NODE_ENV: 'development' }, '/checkout')).toBe(true)

    // And the answer needs a port it can name — the same rule that decides whether anything is
    // written. Nothing to name means nothing to answer (the route turns this into a 503).
    expect(liveDevServerIdentity({}, '/not-a-checkout')).toBeNull()
  })
})
