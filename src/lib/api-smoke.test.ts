/**
 * API smoke test — "does every endpoint still answer?"
 *
 * Requires the dev server on http://localhost:3000 with seeded data:
 *   bun test src/lib/api-smoke.test.ts
 *
 * Routes are discovered by walking src/app/api, so a new route.ts is covered the
 * moment it exists — no table to keep in sync. Every route is swept with GET as
 * every demo role and asserted to never 5xx (and never 401 with a valid session,
 * which means the cookie/token isn't reaching the handler).
 *
 * Why the read sweep alone isn't enough: a handler can be wired correctly for
 * GET and still blow up on a write. That is exactly how
 * /api/duty-schedule/[id] broke — its PUT/DELETE read `params.id` synchronously
 * while Next 16 passes a Promise, so every save and delete returned 500 while
 * the page rendered fine. The write probes below exist to close that gap.
 *
 * Write methods are NOT auto-swept. Firing POST/PUT/DELETE at every route with
 * fabricated bodies would corrupt the demo database (and POST /api/setup would
 * re-seed it). Instead each probe is explicit, uses a row this test creates, and
 * cleans up after itself even when it fails.
 */
import { describe, expect, it, beforeAll } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:3000'

// `bun test` does not load .env.local, which the direct-DB cleanup fallback at
// the bottom needs. Read it here instead of adding a dotenv dependency.
if (!process.env.DATABASE_URL) {
  const envFile = path.resolve(import.meta.dir, '../../.env.local')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/)
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
    }
  }
}
const APP_DIR = path.resolve(import.meta.dir, '../app')
const API_DIR = path.join(APP_DIR, 'api')

// Demo accounts, one per role (see README).
const ACCOUNTS: Record<string, string> = {
  superadmin: 'superadmin123',
  admin: 'admin123',
  kepsek: 'kepsek123',
  vpkes: 'vpkes123',
  wali7a: 'wali123',
  guru1: 'guru123',
  jaga1: 'jaga123',
  ortu1: 'ortu123',
  siswa1: 'siswa123',
}

interface Route {
  path: string
  methods: string[]
}

function discoverRoutes(): Route[] {
  const found: Route[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(full)
      } else if (entry.name === 'route.ts') {
        const rel = path.relative(APP_DIR, full).split(path.sep).join('/')
        const source = readFileSync(full, 'utf8')
        const methods = [
          ...source.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g),
        ].map((m) => m[1])
        found.push({ path: '/' + rel.replace(/\/route\.ts$/, ''), methods })
      }
    }
  }
  walk(API_DIR)
  return found.sort((a, b) => a.path.localeCompare(b.path))
}

const ROUTES = discoverRoutes()

/** Values substituted for [param] segments. Only one dynamic route exists today. */
const params: Record<string, string> = { code: 'SHB-001' }

function concretePath(routePath: string): string {
  return routePath.replace(/\[(\w+)\]/g, (_, name: string) =>
    // `/api/duty-schedule/[id]` is the only dynamic API route; other resources
    // fall back to a value that simply won't match a row (still asserted to
    // answer, not to succeed).
    params[name] ?? 'smoke-missing-id'
  )
}

const tokens: Record<string, string> = {}

async function login(username: string): Promise<string> {
  if (tokens[username]) return tokens[username]
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      password: ACCOUNTS[username],
      // Required while a T&C version is active and unaccepted; note this marks
      // the demo account as having accepted the current version.
      acceptedTerms: true,
    }),
  })
  const raw =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie().join(', ')
      : res.headers.get('set-cookie') || ''
  const token = raw.match(/token=([^;\s]+)/)?.[1] || ''
  if (!token) throw new Error(`login failed for ${username} (HTTP ${res.status})`)
  tokens[username] = token
  return token
}

async function call(
  method: string,
  urlPath: string,
  token: string | null,
  body?: unknown
): Promise<{ status: number; text: string; json: any }> {
  const headers: Record<string, string> = {}
  if (token) headers.Cookie = `token=${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON (xlsx/pdf) responses are fine */
  }
  return { status: res.status, text, json }
}

describe('API smoke — route discovery', () => {
  it('finds the API routes to sweep', () => {
    expect(ROUTES.length).toBeGreaterThan(30)
    // Sanity: discovery must see the dynamic route that regressed.
    expect(ROUTES.map((r) => r.path)).toContain('/api/duty-schedule/[id]')
  })
})

describe('API smoke — every route answers GET', () => {
  it('does not 5xx for an unauthenticated visitor', async () => {
    const failures: string[] = []
    for (const route of ROUTES) {
      if (!route.methods.includes('GET')) continue
      const { status } = await call('GET', concretePath(route.path), null)
      if (status >= 500) failures.push(`GET ${route.path} -> ${status}`)
    }
    expect(failures).toEqual([])
  })

  // ~9 roles x every route, including the xlsx/pdf exports — well past bun's
  // 5s default.
  it('does not 5xx or reject a valid session, for every role', async () => {
    const failures: string[] = []
    for (const username of Object.keys(ACCOUNTS)) {
      const token = await login(username)
      for (const route of ROUTES) {
        if (!route.methods.includes('GET')) continue
        const { status, text } = await call('GET', concretePath(route.path), token)
        if (status >= 500) {
          failures.push(`GET ${route.path} as ${username} -> ${status} ${text.slice(0, 120)}`)
        } else if (status === 401) {
          // A valid cookie was sent, so 401 means the handler never saw it.
          failures.push(`GET ${route.path} as ${username} -> 401 (session not reaching handler)`)
        }
      }
    }
    expect(failures).toEqual([])
  }, 180_000)
})

describe('API smoke — write probes (rows created and cleaned up here)', () => {
  let throwawayId = ''

  beforeAll(async () => {
    // A real teacher id is required; duty schedules already reference valid ones.
    const token = await login('vpkes')
    const list = await call('GET', '/api/duty-schedule', token)
    const teacherId = list.json?.schedules?.[0]?.teacherId
    if (!teacherId) throw new Error('no duty schedule found to source a teacherId from')

    const created = await call('POST', '/api/duty-schedule', token, {
      dayOfWeek: 7,
      startTime: '23:00',
      endTime: '23:30',
      teacherId,
      location: 'ZZ Smoke Test',
      tasks: [],
    })
    throwawayId = created.json?.schedule?.id || ''
    if (created.status !== 201 || !throwawayId) {
      throw new Error(`could not create throwaway row: HTTP ${created.status} ${created.text.slice(0, 200)}`)
    }
  })

  it('PUT /api/duty-schedule/[id] updates the row instead of 5xx-ing', async () => {
    const token = await login('vpkes')
    const res = await call('PUT', `/api/duty-schedule/${throwawayId}`, token, {
      location: 'ZZ Smoke Updated',
    })
    expect(res.status).toBe(200)
    expect(res.json?.schedule?.location).toBe('ZZ Smoke Updated')

    // The update must actually reach the database, not just return 200. The list
    // endpoint filters on isActive, so this probe deliberately leaves it true.
    const list = await call('GET', '/api/duty-schedule', token)
    const row = (list.json?.schedules || []).find((s: any) => s.id === throwawayId)
    expect(row?.location).toBe('ZZ Smoke Updated')
  }, 30_000)

  it('PUT /api/duty-schedule/[id] tolerates a no-op body', async () => {
    const token = await login('vpkes')
    const res = await call('PUT', `/api/duty-schedule/${throwawayId}`, token, {})
    expect(res.status).toBe(200)
    expect(res.json?.schedule?.id).toBe(throwawayId)
  })

  it('DELETE /api/duty-schedule/[id] removes the row', async () => {
    const token = await login('vpkes')
    const res = await call('DELETE', `/api/duty-schedule/${throwawayId}`, token)
    expect(res.status).toBe(200)

    const list = await call('GET', '/api/duty-schedule', token)
    expect((list.json?.schedules || []).some((s: any) => s.id === throwawayId)).toBe(false)
    throwawayId = ''
  })

  // Hygiene, not behaviour: the DELETE probe above is what asserts the endpoint
  // works. If the write path is broken (exactly the case this suite guards) its
  // own cleanup can't run, so fall back to a direct delete here rather than
  // leaving a 'ZZ Smoke Test' row in the roster.
  it('leaves no throwaway row behind', async () => {
    if (!throwawayId) return
    const token = await login('vpkes')
    await call('DELETE', `/api/duty-schedule/${throwawayId}`, token)

    // Fallback for a broken write path: if the endpoint could not delete it, do
    // it directly so the suite never leaves a 'ZZ Smoke Test' row in the roster.
    try {
      const { db } = await import('@/lib/db')
      await db.dutySchedule.deleteMany({ where: { id: throwawayId } })
    } catch {
      /* the assertion below reports the leak either way */
    }

    const list = await call('GET', '/api/duty-schedule', token)
    expect((list.json?.schedules || []).some((s: any) => s.id === throwawayId)).toBe(false)
    throwawayId = ''
  })
})

// ─── Direct-DB helpers ─────────────────────────────────────────────────────
//
// API responses are asserted for behaviour; these verify the *effect* landed in
// the database (not just that a handler returned 200) and guarantee cleanup when
// the endpoint under test is the broken thing and can't delete its own row.

async function directFind(model: string, where: Record<string, unknown>): Promise<any> {
  const { db } = await import('@/lib/db')
  return (db as any)[model].findFirst({ where })
}

async function directDelete(model: string, where: Record<string, unknown>): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    await (db as any)[model].deleteMany({ where })
  } catch {
    /* best effort — the probe's own assertions report the real failure */
  }
}

async function directUpdate(
  model: string,
  where: Record<string, unknown>,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const { db } = await import('@/lib/db')
    await (db as any)[model].updateMany({ where, data })
  } catch {
    /* best effort */
  }
}

// ─── Write probes for the other mutating resources ─────────────────────────

describe('API smoke — write probes: students, users, violations, merits, permissions, terms', () => {
  let token = ''
  let adminId = ''
  let classId = ''
  let academicYearId = ''
  let studentId = ''
  let violationCategoryId = ''
  let goodDeedCategoryId = ''
  let pointsBefore = { violations: 0, goodDeeds: 0 }
  let activeTermsVersion = 0

  beforeAll(async () => {
    token = await login('admin')

    const users = await call('GET', '/api/users', token)
    adminId = (users.json?.users || []).find((u: any) => u.username === 'admin')?.id || ''

    const classes = await call('GET', '/api/classes', token)
    classId = classes.json?.classes?.[0]?.id || ''
    academicYearId = classes.json?.classes?.[0]?.academicYearId || ''

    const categories = await call('GET', '/api/categories?type=all', token)
    violationCategoryId = categories.json?.violationCategories?.[0]?.id || ''
    goodDeedCategoryId = categories.json?.goodDeedCategories?.[0]?.id || ''

    // Lowest-points student: a 1-point violation then cannot cross a behaviour
    // threshold and spawn an alert that deleting the violation wouldn't undo.
    const students = await call('GET', '/api/students', token)
    const lowest = [...(students.json?.students || [])].sort(
      (a: any, b: any) => (a.totalViolationPoints || 0) - (b.totalViolationPoints || 0)
    )[0]
    studentId = lowest?.id || ''
    pointsBefore = {
      violations: lowest?.totalViolationPoints || 0,
      goodDeeds: lowest?.totalGoodPoints || 0,
    }

    const terms = await call('GET', '/api/terms-content', null)
    activeTermsVersion = terms.json?.terms?.version || 0

    const missing = Object.entries({
      adminId,
      classId,
      academicYearId,
      violationCategoryId,
      goodDeedCategoryId,
      studentId,
    })
      .filter(([, value]) => !value)
      .map(([key]) => key)
    expect(missing).toEqual([])
  })

  it('students: POST → PUT → DELETE (base64 photo mapping + required No HP)', async () => {
    const nisn = `zzsmoke${Date.now()}`
    // Clients send the photo as base64 while Student stores it in photoUrl.
    // Sending it is what used to make both POST and PUT 500.
    const photoA = 'data:image/png;base64,zz-smoke-photo-a'
    const photoB = 'data:image/png;base64,zz-smoke-photo-b'
    let id = ''
    try {
      // No HP is required for a new student (the settings form shows a red *).
      const noPhone = await call('POST', '/api/students', token, {
        nisn,
        name: 'ZZ Smoke Student',
        classId,
        academicYearId,
      })
      expect(noPhone.status).toBe(400)
      expect(noPhone.json?.error).toMatch(/No HP/)
      // The rejected create must not have left a student or a login behind.
      expect(await directFind('student', { nisn })).toBe(null)
      expect(await directFind('user', { username: `student_${nisn}` })).toBe(null)

      const created = await call('POST', '/api/students', token, {
        nisn,
        name: 'ZZ Smoke Student',
        classId,
        academicYearId,
        phone: '081200000123',
        photoBase64: photoA,
      })
      expect(created.status).toBe(201)
      id = created.json?.student?.id
      expect(typeof id).toBe('string')
      expect(created.json?.student?.photoUrl).toBe(photoA)
      expect(created.json?.student?.phone).toBe('081200000123')

      const updated = await call('PUT', '/api/students', token, {
        id,
        name: 'ZZ Smoke Student Updated',
        photoBase64: photoB,
      })
      expect(updated.status).toBe(200)
      expect(updated.json?.student?.name).toBe('ZZ Smoke Student Updated')
      expect(updated.json?.student?.photoUrl).toBe(photoB)
      expect((await directFind('student', { id }))?.photoUrl).toBe(photoB)

      // Required data must not be blanked out afterwards.
      const blanked = await call('PUT', '/api/students', token, { id, phone: '' })
      expect(blanked.status).toBe(400)
      expect(blanked.json?.error).toMatch(/No HP/)
      expect((await directFind('student', { id }))?.phone).toBe('081200000123')

      // ...while an update that doesn't touch No HP still works (partial edit).
      const partial = await call('PUT', '/api/students', token, { id, status: 'TIDAK_AKTIF' })
      expect(partial.status).toBe(200)
      expect((await directFind('student', { id }))?.status).toBe('TIDAK_AKTIF')

      const removed = await call('DELETE', `/api/students?id=${id}`, token)
      expect(removed.status).toBe(200)
      expect(await directFind('student', { id })).toBe(null)
      // The handler also removes the student's generated account; a leftover
      // SISWA login would keep showing up in the user list.
      expect(await directFind('user', { username: `student_${nisn}` })).toBe(null)
    } finally {
      await directDelete('student', { id: id || '__none__' })
      await directDelete('user', { username: `student_${nisn}` })
    }
  }, 30_000)

  it('students: a record with no No HP is still editable (no retro-fill required)', async () => {
    // Rows that predate the requirement (seeder, bulk import) must stay
    // editable — only POST enforces No HP, PUT just refuses to erase one.
    const legacy = await directFind('student', { id: studentId })
    expect(legacy).toBeTruthy()

    const updated = await call('PUT', '/api/students', token, { id: studentId, status: legacy!.status })
    expect(updated.status).toBe(200)
    const after = await directFind('student', { id: studentId })
    // '' and null both mean "no phone" — either is fine, just unchanged.
    expect(after?.phone || null).toBe(legacy!.phone || null)

    // The settings form always submits No HP, empty included, so the PUT has to
    // behave per record: keep an empty phone on a legacy row (stored as null,
    // not ''), refuse to blank one that exists.
    const blanked = await call('PUT', '/api/students', token, { id: studentId, phone: '' })
    if (legacy!.phone) {
      expect(blanked.status).toBe(400)
    } else {
      expect(blanked.status).toBe(200)
      expect((await directFind('student', { id: studentId }))?.phone ?? null).toBe(null)
    }
  }, 30_000)

  it('users: POST → PUT → DELETE, which deactivates rather than deletes', async () => {
    const username = `zzsmoke${Date.now()}`
    let id = ''
    try {
      const created = await call('POST', '/api/users', token, {
        username,
        password: 'zz-smoke-pass-123',
        name: 'ZZ Smoke User',
        role: 'GURU',
      })
      expect(created.status).toBe(201)
      id = created.json?.user?.id
      expect(typeof id).toBe('string')

      const updated = await call('PUT', '/api/users', token, { id, name: 'ZZ Smoke User Updated' })
      expect(updated.status).toBe(200)
      expect(updated.json?.user?.name).toBe('ZZ Smoke User Updated')

      const removed = await call('DELETE', `/api/users?id=${id}`, token)
      expect(removed.status).toBe(200)
      // User deletion is a soft delete by design — assert that contract, then
      // hard-remove the row so repeated runs don't accumulate smoke accounts.
      expect(removed.json?.user?.isActive).toBe(false)
      expect((await directFind('user', { id }))?.isActive).toBe(false)
    } finally {
      await directDelete('user', { username })
    }
  }, 30_000)

  it('violations: POST → DELETE, with the student total moving and coming back', async () => {
    let id = ''
    try {
      const created = await call('POST', '/api/violations', token, {
        studentId,
        categoryId: violationCategoryId,
        points: 1,
        description: 'ZZ smoke violation',
        date: new Date().toISOString(),
        recordedBy: adminId,
      })
      expect(created.status).toBe(201)
      id = created.json?.violation?.id
      expect(typeof id).toBe('string')
      expect((await directFind('student', { id: studentId }))?.totalViolationPoints).toBe(
        pointsBefore.violations + 1
      )

      const removed = await call('DELETE', `/api/violations?id=${id}`, token)
      expect(removed.status).toBe(200)
      expect(await directFind('violation', { id })).toBe(null)
      expect((await directFind('student', { id: studentId }))?.totalViolationPoints).toBe(
        pointsBefore.violations
      )
    } finally {
      await directDelete('violation', { id: id || '__none__' })
      await directUpdate(
        'student',
        { id: studentId },
        { totalViolationPoints: pointsBefore.violations, totalGoodPoints: pointsBefore.goodDeeds }
      )
    }
  }, 30_000)

  it('merits: POST → DELETE, with the student total moving and coming back', async () => {
    let id = ''
    try {
      const created = await call('POST', '/api/good-deeds', token, {
        studentId,
        categoryId: goodDeedCategoryId,
        points: 1,
        description: 'ZZ smoke merit',
        date: new Date().toISOString(),
        recordedBy: adminId,
      })
      expect(created.status).toBe(201)
      id = created.json?.goodDeed?.id
      expect(typeof id).toBe('string')
      expect((await directFind('student', { id: studentId }))?.totalGoodPoints).toBe(
        pointsBefore.goodDeeds + 1
      )

      const removed = await call('DELETE', `/api/good-deeds?id=${id}`, token)
      expect(removed.status).toBe(200)
      expect(await directFind('goodDeed', { id })).toBe(null)
      expect((await directFind('student', { id: studentId }))?.totalGoodPoints).toBe(
        pointsBefore.goodDeeds
      )
    } finally {
      await directDelete('goodDeed', { id: id || '__none__' })
      await directUpdate(
        'student',
        { id: studentId },
        { totalViolationPoints: pointsBefore.violations, totalGoodPoints: pointsBefore.goodDeeds }
      )
    }
  }, 30_000)

  it('permissions: POST → PUT (approve) → DELETE', async () => {
    let id = ''
    try {
      const created = await call('POST', '/api/permissions', token, {
        studentId,
        type: 'SICK',
        reason: 'ZZ smoke leave request',
        requestedBy: adminId,
        date: new Date().toISOString(),
      })
      expect(created.status).toBe(201)
      id = created.json?.permission?.id
      expect(typeof id).toBe('string')

      const approved = await call('PUT', '/api/permissions', token, {
        id,
        status: 'APPROVED',
        approvedBy: adminId,
      })
      expect(approved.status).toBe(200)
      expect(approved.json?.permission?.status).toBe('APPROVED')

      const removed = await call('DELETE', `/api/permissions?id=${id}`, token)
      expect(removed.status).toBe(200)
      expect(await directFind('permission', { id })).toBe(null)
    } finally {
      await directDelete('permission', { id: id || '__none__' })
    }
  }, 30_000)

  // Approving an ABSENCE is the one write path that creates a *second* record (an
  // IZIN attendance row for that date), so it gets its own probe. The date is far
  // in the future so it can't clash with seeded attendance.
  it('permissions: approving an absence records attendance, deleting unlinks it', async () => {
    const future = '2099-06-15'
    let id = ''
    try {
      const created = await call('POST', '/api/permissions', token, {
        studentId,
        type: 'ABSENCE',
        reason: 'ZZ smoke absence',
        requestedBy: adminId,
        date: future,
      })
      expect(created.status).toBe(201)
      id = created.json?.permission?.id

      const approved = await call('PUT', '/api/permissions', token, {
        id,
        status: 'APPROVED',
        approvedBy: adminId,
      })
      expect(approved.status).toBe(200)

      const attendance = await directFind('attendance', { studentId, permissionId: id })
      expect(attendance?.status).toBe('IZIN')

      const removed = await call('DELETE', `/api/permissions?id=${id}`, token)
      expect(removed.status).toBe(200)
      // The delete unlinks the attendance row rather than leaving a dangling ref.
      expect(await directFind('attendance', { studentId, permissionId: id })).toBe(null)
    } finally {
      await directDelete('permission', { id: id || '__none__' })
      // The unlink nulls permissionId, so sweep by date instead — nothing
      // legitimate lives in 2099.
      await directDelete('attendance', {
        studentId,
        date: { gte: new Date('2099-01-01T00:00:00.000Z') },
      })
    }
  }, 30_000)

  it('terms: POST a draft version → PUT → DELETE, leaving the active version alone', async () => {
    let id = ''
    try {
      // activate:false keeps this from deactivating the live T&C, which would
      // force every user to re-accept.
      const created = await call('POST', '/api/terms-content', token, {
        title: 'ZZ Smoke Terms',
        body: 'ZZ smoke test terms body, long enough to pass validation.',
        activate: false,
      })
      expect(created.status).toBe(200)
      id = created.json?.terms?.id
      expect(typeof id).toBe('string')
      expect(created.json?.terms?.isActive).toBe(false)

      const updated = await call('PUT', '/api/terms-content', token, {
        id,
        title: 'ZZ Smoke Terms Updated',
      })
      expect(updated.status).toBe(200)
      expect(updated.json?.terms?.title).toBe('ZZ Smoke Terms Updated')

      const removed = await call('DELETE', `/api/terms-content?id=${id}`, token)
      expect(removed.status).toBe(200)
      expect(await directFind('termsContent', { id })).toBe(null)

      const active = await call('GET', '/api/terms-content', null)
      expect(active.json?.terms?.version).toBe(activeTermsVersion)
    } finally {
      await directDelete('termsContent', { id: id || '__none__' })
    }
  }, 30_000)
})
