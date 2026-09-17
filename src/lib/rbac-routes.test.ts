/**
 * RBAC E2E Test Suite
 * Requires dev server running on http://localhost:3000 with seeded data.
 * Run: bun test src/lib/rbac-routes.test.ts
 *
 * Every expectation here comes from the policy (`src/lib/rbac-policy.ts`) — the
 * same table the route guards call. `canAccessApi` already folds in the rule
 * that a SUPER_ADMIN passes every gate (the platform administrator is the
 * multi-tenant operator; preview mode narrows the data it sees, never its
 * access), so a 403 for SUPER_ADMIN is not expressible as an expectation.
 *
 * Read probes assert "not 401/403 and never 5xx". **Write probes assert a real
 * 2xx**: each one is built from live fixtures (a real class, student, category
 * and academic year) so a permitted role has to actually create the row, and the
 * row is removed again before the next role runs. A probe that only ever reached
 * a validation error would pass while the endpoint was broken — which is exactly
 * how an incomplete body hid the `params.id` bug on /api/duty-schedule/[id].
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { API_ROLES, PUBLIC_API_ROUTES, canAccessApi, isPublicApiRoute, type ApiRoute } from '@/lib/rbac-policy'
import { closeTestDb, testDb } from '@/lib/test-db'

const BASE = 'http://localhost:3000'

// `bun test` does not load .env.local, and the final cleanup needs it: undoing
// the categories probe is a direct DB delete, because `DELETE /api/categories`
// only deactivates a category. Same fallback api-smoke.test.ts uses.
if (!process.env.DATABASE_URL) {
  const envFile = path.resolve(import.meta.dir, '../../.env.local')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  }
}

/**
 * Every row a probe creates carries this marker in its unique field (username,
 * nisn, class name, category code, description), so `afterAll` can find and
 * remove anything a failed undo left behind — the demo counts stay at 42 users /
 * 24 students / 10 classes / 3 schools / 12 categories.
 */
const MARKER = 'rbact'
const slug = (role: string) => role.toLowerCase().replace(/_/g, '-')
const markerUsername = (role: string) => `${MARKER}-${slug(role)}`

const ACCOUNTS: Record<string, { password: string; role: string }> = {
  superadmin: { password: 'superadmin123', role: 'SUPER_ADMIN' },
  admin: { password: 'admin123', role: 'ADMIN' },
  kepsek: { password: 'kepsek123', role: 'KEPALA_SEKOLAH' },
  vpkes: { password: 'vpkes123', role: 'VP_KESISWAAN' },
  wali7a: { password: 'wali123', role: 'WALI_KELAS' },
  guru1: { password: 'guru123', role: 'GURU' },
  jaga1: { password: 'jaga123', role: 'GURU_JAGA' },
  ortu1: { password: 'ortu123', role: 'ORANG_TUA' },
  siswa1: { password: 'siswa123', role: 'SISWA' },
}

interface Session { token: string; userId: string; role: string }

// Cache sessions across tests (lazy login on first use)
const sessions: Record<string, Session | null> = {}

async function getSession(username: string): Promise<Session | null> {
  if (sessions[username] !== undefined) return sessions[username]
  const { password } = ACCOUNTS[username]
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, acceptedTerms: true }),
  })
  if (!res.ok) { sessions[username] = null; return null }

  const body = await res.json().catch(() => null)
  let raw = ''
  if (typeof (res.headers as any).getSetCookie === 'function') {
    raw = (res.headers as any).getSetCookie().join(', ')
  } else {
    raw = res.headers.get('set-cookie') || ''
  }
  const m = raw.match(/token=([^;\s]+)/)
  sessions[username] = m && body?.user?.id
    ? { token: m[1], userId: body.user.id, role: body.user.role }
    : null
  return sessions[username]
}

const getToken = async (username: string) => (await getSession(username))?.token ?? null

// A private Prisma client, deliberately not '@/lib/db' — see src/lib/test-db.ts for
// why the mock registry makes that import unsafe in a full `bun test` run. The same
// trap later broke api-smoke.test.ts on CI, so both now share one client helper.
const dbClient = testDb

/**
 * Remove anything a previous run left behind, by marker. Runs before the probes
 * (so a crashed run cannot break the next one with a duplicate code) and again
 * afterwards (so this run leaves nothing behind). Failures are reported rather
 * than swallowed — a silent failure here is what turns into a 409 next time.
 */
async function removeLeftovers() {
  const db = await dbClient()
  const report = (what: string) => (e: Error) => console.error(`${MARKER}: leftover ${what} not removed:`, e?.message)

  await db.violation.deleteMany({ where: { description: { startsWith: MARKER } } }).catch(report('violations'))
  await db.goodDeed.deleteMany({ where: { description: { startsWith: MARKER } } }).catch(report('good deeds'))

  const leftoverStudents = await db.student
    .findMany({ where: { nisn: { startsWith: MARKER } }, select: { id: true, userId: true } })
    .catch(() => [])
  if (leftoverStudents.length) {
    // The create also made a login for each student; remove it with the row.
    await db.user.deleteMany({ where: { id: { in: leftoverStudents.map((s) => s.userId) } } }).catch(report('student logins'))
    await db.student.deleteMany({ where: { id: { in: leftoverStudents.map((s) => s.id) } } }).catch(report('students'))
  }

  await db.class.deleteMany({ where: { name: { startsWith: MARKER } } }).catch(report('classes'))
  await db.violationCategory.deleteMany({ where: { code: { startsWith: MARKER.toUpperCase() } } }).catch(report('violation categories'))
  await db.goodDeedCategory.deleteMany({ where: { code: { startsWith: MARKER.toUpperCase() } } }).catch(report('merit categories'))
  await db.user.deleteMany({ where: { username: { startsWith: MARKER } } }).catch(report('users'))
}

async function call(method: string, path: string, token: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Cookie: `token=${token}` }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  return fetch(`${BASE}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function req(method: string, path: string, token: string, body?: unknown): Promise<number> {
  return (await call(method, path, token, body)).status
}

const methodOf = (key: string) => key.split(' ')[0]

/** Only send a body where one is allowed — `fetch` rejects a body on GET. */
const bodyFor = (method: string, body: unknown) => (method === 'GET' ? undefined : body)

// ─── Fixtures the write probes are built from ───
/**
 * A permitted role must be able to satisfy the request, so the bodies below use
 * rows that really exist: the seeded school, one of its classes, one of its
 * students (preferring a zero-point student, so a +1 probe cannot cross an
 * escalation threshold and create a behavior alert) and real categories.
 */
interface Fixtures {
  schoolId: string
  academicYearId: string
  classId: string
  studentId: string
  studentBefore: { violation: number; good: number }
  violationCategoryId: string
  goodDeedCategoryId: string
}

let fx: Fixtures

/** A write probe: how to make it succeed, and how to undo it. */
interface Probe {
  /** Body built from the fixtures, unique per role so a re-run can't collide. */
  body: (session: Session) => unknown
  /** Remove what the create made. Runs with the superadmin session. */
  undo: (created: any) => Promise<void>
}

interface EndpointTest {
  key: SweepKey
  path?: string
  /** Present = a permitted role must get a 2xx, and the effect is undone. */
  probe?: Probe
}

/** DELETE as the superadmin, which bypasses the per-school ownership check. */
async function apiDelete(path: string) {
  const token = await getToken('superadmin')
  if (!token) return
  await call('DELETE', path, token).catch(() => null)
}

const PROBES: Partial<Record<SweepKey, Probe>> = {
  'POST /api/classes': {
    body: (s) => ({ name: `${MARKER}-class-${slug(s.role)}`, level: 'JHS', academicYearId: fx.academicYearId }),
    undo: async (created) => { await apiDelete(`/api/classes?id=${created.cls.id}`) },
  },
  'POST /api/students': {
    body: (s) => ({
      nisn: `${MARKER}-${slug(s.role)}`,
      name: `${MARKER} probe ${s.role}`,
      classId: fx.classId,
      academicYearId: fx.academicYearId,
      phone: '081200000000', // No HP is required for a new student
      gender: 'L',
    }),
    // The DELETE also removes the login the create made for the student.
    undo: async (created) => { await apiDelete(`/api/students?id=${created.student.id}`) },
  },
  'POST /api/users': {
    // A platform actor must name a school; a school-bound actor may only name
    // their own, and this is it.
    body: (s) => ({
      username: markerUsername(s.role),
      password: 'sweep-pass-1',
      name: `${MARKER} probe ${s.role}`,
      role: 'GURU',
      schoolId: fx.schoolId,
    }),
    // DELETE /api/users only deactivates, so the platform action removes the row.
    undo: async (created) => {
      const token = await getToken('superadmin')
      if (!token) return
      await call('POST', '/api/super-admin', token, { resource: 'users', action: 'delete', id: created.user.id }).catch(() => null)
    },
  },
  'POST /api/violations': {
    body: (s) => ({
      studentId: fx.studentId,
      categoryId: fx.violationCategoryId,
      points: 1,
      description: `${MARKER} probe ${s.role}`,
      date: new Date().toISOString(),
      recordedBy: s.userId,
    }),
    undo: async (created) => { await apiDelete(`/api/violations?id=${created.violation.id}`) },
  },
  'POST /api/good-deeds': {
    body: (s) => ({
      studentId: fx.studentId,
      categoryId: fx.goodDeedCategoryId,
      points: 1,
      description: `${MARKER} probe ${s.role}`,
      date: new Date().toISOString(),
      recordedBy: s.userId,
    }),
    undo: async (created) => { await apiDelete(`/api/good-deeds?id=${created.goodDeed.id}`) },
  },
  'POST /api/categories': {
    body: (s) => ({
      type: 'violation',
      name: `${MARKER} probe ${s.role}`,
      code: `${MARKER}${slug(s.role)}`.toUpperCase(),
      level: 'RINGAN',
      defaultPoints: 1,
    }),
    // The endpoint only deactivates a category, so this one is a direct delete.
    undo: async (created) => {
      const db = await dbClient()
      await db.violationCategory.delete({ where: { id: created.category.id } })
        .catch((e: Error) => console.error(`${MARKER}: could not undo category ${created?.category?.code}:`, e?.message))
    },
  },
}

type SweepKey = ApiRoute | (typeof PUBLIC_API_ROUTES)[number]

const EP: EndpointTest[] = [
  { key: 'GET /api/students' },
  { key: 'POST /api/students', probe: PROBES['POST /api/students'] },
  { key: 'GET /api/classes' },
  { key: 'POST /api/classes', probe: PROBES['POST /api/classes'] },
  { key: 'GET /api/users' },
  { key: 'POST /api/users', probe: PROBES['POST /api/users'] },
  { key: 'GET /api/attendance' },
  { key: 'GET /api/violations' },
  { key: 'POST /api/violations', probe: PROBES['POST /api/violations'] },
  { key: 'GET /api/good-deeds' },
  { key: 'POST /api/good-deeds', probe: PROBES['POST /api/good-deeds'] },
  { key: 'GET /api/permissions' },
  { key: 'GET /api/categories' },
  { key: 'POST /api/categories', probe: PROBES['POST /api/categories'] },
  { key: 'GET /api/statistics' },
  { key: 'GET /api/alerts' },
  { key: 'GET /api/audit-logs' },
  { key: 'GET /api/export' },
  { key: 'GET /api/export-pdf' },
  { key: 'GET /api/super-admin', path: '/api/super-admin?resource=schools' },
  { key: 'GET /api/scan-session' },
  { key: 'GET /api/duty-schedule' },
  { key: 'GET /api/school-documents' },
  { key: 'GET /api/face-references' },
]

const pathOf = (ep: EndpointTest) => ep.path ?? ep.key.split(' ')[1]

beforeAll(async () => {
  // Self-healing: a previous run that died mid-probe must not leave a duplicate
  // category code that turns this run's 201 into a 409.
  await removeLeftovers()

  const token = await getToken('superadmin')
  if (!token) throw new Error('cannot log in as superadmin — is the dev server running with seeded data?')

  const json = async (p: string) => {
    const res = await call('GET', p, token)
    if (!res.ok) throw new Error(`fixture GET ${p} → ${res.status}`)
    return res.json()
  }

  const schools = (await json('/api/schools/public')).schools ?? []
  // The demo accounts all belong to SHB-001, so its rows are the ones every
  // permitted role can act on.
  const schoolId = schools.find((s: any) => s.code === 'SHB-001')?.id ?? schools[0]?.id
  const academicYearId = (await json('/api/academic-years')).academicYears?.[0]?.id
  const classes = (await json('/api/classes')).classes ?? []
  const classId = classes.find((c: any) => c.schoolId === schoolId)?.id ?? classes[0]?.id
  const students = (await json('/api/students?limit=500')).students ?? []
  const inClass = students.filter((s: any) => s.classId === classId)
  const target: any =
    inClass.find((s: any) => s.totalViolationPoints === 0 && s.totalGoodPoints === 0) ?? inClass[0] ?? students[0]
  const vcats = (await json('/api/categories?type=violation')).violationCategories ?? []
  const gcats = (await json('/api/categories?type=good-deed')).goodDeedCategories ?? []

  if (!schoolId || !academicYearId || !classId || !target?.id) {
    throw new Error('seed data is missing (school / academic year / class / student) — run POST /api/setup?force=true')
  }
  fx = {
    schoolId, academicYearId, classId,
    studentId: target.id,
    studentBefore: { violation: target.totalViolationPoints ?? 0, good: target.totalGoodPoints ?? 0 },
    violationCategoryId: (vcats.find((c: any) => c.isActive) ?? vcats[0])?.id,
    goodDeedCategoryId: (gcats.find((c: any) => c.isActive) ?? gcats[0])?.id,
  }
  if (!fx.violationCategoryId || !fx.goodDeedCategoryId) throw new Error('seed data has no categories')
})

// ─── Public endpoints (no auth) ───
describe('RBAC — Public (no auth)', () => {
  for (const p of ['/api/schools/public', '/api/school-config', '/api/scan-session']) {
    it(`${p} → 200`, async () => {
      expect((await fetch(`${BASE}${p}`)).status).toBe(200)
    })
  }
})

// ─── Unauthenticated access ───
describe('RBAC — Unauthenticated', () => {
  for (const ep of EP.filter(e => !isPublicApiRoute(e.key))) {
    it(`${ep.key} → 401`, async () => {
      // The guards run before the body is parsed, so an empty body is enough to
      // prove an anonymous caller is refused.
      const method = methodOf(ep.key)
      const s = await req(method, pathOf(ep), '', bodyFor(method, {}))
      expect(s).toBe(401)
    })
  }
})

// ─── Per-role tests ───
for (const [username, account] of Object.entries(ACCOUNTS)) {
  describe(`RBAC — ${account.role} (${username})`, () => {
    it('login succeeds', async () => {
      const session = await getSession(username)
      expect(session).not.toBeNull()
      expect(session!.token.length).toBeGreaterThan(50)
    })

    for (const ep of EP) {
      // Public endpoints are open to everyone; everything else is the policy's
      // call, which includes the Super Admin's universal bypass.
      const shouldAllow = isPublicApiRoute(ep.key) || canAccessApi(account.role, ep.key)

      if (ep.probe) {
        const probe = ep.probe
        it(`${ep.key} → ${shouldAllow ? 'created (2xx) then cleaned up' : '403'}`, async () => {
          const session = await getSession(username)
          if (!session) return // skip if login failed (previous test would fail)

          const method = methodOf(ep.key)
          if (!shouldAllow) {
            expect(await req(method, pathOf(ep), session.token, bodyFor(method, {}))).toBe(403)
            return
          }

          const res = await call(method, pathOf(ep), session.token, probe.body(session))
          const created = await res.json().catch(() => null)
          // A permitted role has to really create the row: a 400 would mean the
          // probe is incomplete, not that the endpoint works.
          if (res.status < 200 || res.status >= 300) {
            throw new Error(`${method} ${pathOf(ep)} as ${account.role} → ${res.status}: ${JSON.stringify(created)}`)
          }

          await probe.undo(created)
        })
        continue
      }

      it(`${ep.key} → ${shouldAllow ? 'allowed' : '403'}`, async () => {
        const session = await getSession(username)
        if (!session) return // skip if login failed (previous test would fail)

        const method = methodOf(ep.key)
        const s = await req(method, pathOf(ep), session.token, bodyFor(method, {}))
        if (shouldAllow) {
          expect(s).not.toBe(401)
          expect(s).not.toBe(403)
          // A 5xx never is an acceptable answer: it means the handler threw.
          expect(s).toBeLessThan(500)
        } else {
          expect(s).toBe(403)
        }
      })
    }
  })
}

// ─── The sweep covers the policy, not a copy of it ───
describe('RBAC — policy coverage', () => {
  it('every probe names an endpoint the policy knows', () => {
    for (const ep of EP) {
      expect(isPublicApiRoute(ep.key) || ep.key in API_ROLES).toBe(true)
    }
  })

  it('no probe is a duplicate', () => {
    expect(new Set(EP.map(e => e.key)).size).toBe(EP.length)
  })

  it('every write probe has an undo, and every undo is reachable', () => {
    for (const ep of EP.filter(e => e.probe)) {
      expect(typeof ep.probe!.body).toBe('function')
      expect(typeof ep.probe!.undo).toBe('function')
    }
  })
})

// ─── Cleanup ───
// The write probes are undone one by one above, so this is the safety net for a
// run that failed halfway: everything a probe creates is marked with `MARKER`,
// and this removes whatever is left. It also restores the point totals of the
// student the violation / good-deed probes touch, because a violation deleted
// straight from the database does not decrement them.
afterAll(async () => {
  // Probe users are removed through the platform action first (DELETE /api/users
  // only *deactivates*), then removeLeftovers() clears the rest by marker.
  const token = await getToken('superadmin')
  if (token) {
    const list = await call('GET', '/api/super-admin?resource=users', token).catch(() => null)
    const users = list?.ok ? (await list.json().catch(() => ({})))?.users ?? [] : []
    for (const u of users.filter((x: any) => String(x.username ?? '').startsWith(MARKER))) {
      await call('POST', '/api/super-admin', token, { resource: 'users', action: 'delete', id: u.id }).catch(() => null)
    }
  }
  await removeLeftovers()

  // A violation or merit deleted straight from the database does not adjust the
  // student's running totals, so put them back to what the fixtures captured.
  if (fx?.studentId) {
    const db = await dbClient()
    await db.student.update({
      where: { id: fx.studentId },
      data: { totalViolationPoints: fx.studentBefore.violation, totalGoodPoints: fx.studentBefore.good },
    }).catch((e: Error) => console.error(`${MARKER}: could not restore student totals:`, e?.message))
  }

  // The suite that opened the shared client closes it; a later suite asking
  // testDb() again gets a fresh one.
  await closeTestDb()
})
