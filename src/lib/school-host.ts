// Hostname -> school resolution, shared by the landing page (client) and the
// middleware (Edge). Everything here is pure — no Node APIs, no DB — so the
// same logic can run on both runtimes.
//
// Two complementary mechanisms give every school its own landing page:
//
//  1. `School.domain` (DB, source of truth) — the landing page resolves the
//     visitor's hostname against the public school directory and, on a match,
//     opens straight into that school's branded login. Works without any
//     extra configuration.
//
//  2. `SCHOOL_DOMAINS` env (middleware routing) — comma-separated
//     `hostname=CODE` entries let the middleware rewrite "/" to "/s/:code" on
//     a school's dedicated subdomain, so even a non-JS client gets the right
//     page and the subdomain stays the canonical URL. Optional: without it the
//     client-side resolution in (1) still lands visitors on the right school.
//
// On localhost (or any host that matches no school) the "/s/:code" path is
// the fallback entry point.

export interface SchoolHostInfo {
  code: string
  domain: string | null
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

/** True for loopback/dev hosts where the path-based /s/:code fallback applies. */
export function isLocalHostname(hostname: string): boolean {
  const h = normalizeHostname(hostname)
  return LOCAL_HOSTNAMES.has(h)
}

/** Normalize a hostname: lowercase, trim, drop a trailing dot. */
export function normalizeHostname(hostname: string): string {
  return (hostname || '').trim().toLowerCase().replace(/\.$/, '')
}

/**
 * Parse the SCHOOL_DOMAINS env value ("hostname=CODE,host2=CODE2") into a
 * normalized hostname -> school-code map. Malformed entries are skipped.
 */
export function parseSchoolDomains(envValue: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const entry of (envValue || '').split(',')) {
    const eq = entry.indexOf('=')
    if (eq <= 0) continue
    const host = normalizeHostname(entry.slice(0, eq))
    const code = entry.slice(eq + 1).trim().toUpperCase()
    if (host && code) map[host] = code
  }
  return map
}

/**
 * Match a hostname against a school's `domain` field. Accepts the bare domain
 * and its "www." prefixed form. Returns the school code or null.
 */
export function resolveSchoolByHostname(
  hostname: string,
  schools: SchoolHostInfo[]
): string | null {
  const host = normalizeHostname(hostname)
  if (!host || isLocalHostname(host)) return null
  const direct = schools.find(s => s.domain && normalizeHostname(s.domain) === host)
  if (direct) return direct.code
  const www = host.startsWith('www.')
  if (www) {
    const bare = host.slice(4)
    const match = schools.find(s => s.domain && normalizeHostname(s.domain) === bare)
    if (match) return match.code
  }
  return null
}
