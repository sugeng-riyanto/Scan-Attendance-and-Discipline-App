/**
 * Regression test: tenant isolation of account reads and writes.
 *
 * PUT/DELETE /api/users used to authorize the caller by role alone and then
 * address the row by `id`, so any school's ADMIN could reset another school's
 * password, re-role its users, move them between schools or deactivate them.
 * Both handlers must now resolve the target *through* the caller's school.
 *
 * GET had the mirror-image gap for SUPER_ADMIN preview mode: scoping was keyed
 * off `!isSuperAdmin`, so a super admin previewing a school still saw every
 * tenant's accounts — the one path in this file that ignored the preview cookie.
 *
 * GET /api/auth is covered here too because it serves the *same* list to the app
 * (Settings → Users and the duty-roster teacher picker) and had no scoping at
 * all, which leaked every school's accounts to any staff member.
 *
 * Prisma is mocked so the assertions can inspect the exact `where` clause the
 * route builds — this runs without a database or a dev server, unlike the
 * HTTP-level E2E suites in this folder.
 */
import { describe, expect, it, mock, beforeAll } from 'bun:test'
import { signToken } from '@/lib/auth-utils'

const CALLER_ID = 'u-caller'

interface Row {
  id: string
  username: string
  name: string
  role: string
  schoolId: string | null
  isActive: boolean
  password: string
}

const USERS: Record<string, Row> = {
  // school A — the caller's own tenant
  'own-guru': { id: 'own-guru', username: 'own-guru', name: 'Own Guru', role: 'GURU', schoolId: 'school-A', isActive: true, password: 'hash-own' },
  // school B — must be unreachable from an A-bound caller
  'other-guru': { id: 'other-guru', username: 'other-guru', name: 'Other Guru', role: 'GURU', schoolId: 'school-B', isActive: true, password: 'hash-other' },
  'other-admin': { id: 'other-admin', username: 'other-admin', name: 'Other Admin', role: 'ADMIN', schoolId: 'school-B', isActive: true, password: 'hash-other-admin' },
  // platform account that happens to be attached to school A
  'bound-super': { id: 'bound-super', username: 'bound-super', name: 'Bound Super', role: 'SUPER_ADMIN', schoolId: 'school-A', isActive: true, password: 'hash-bound-super' },
  // school A's only active administrator, plus a retired one — lockout fixtures
  'a-admin': { id: 'a-admin', username: 'a-admin', name: 'A Admin', role: 'ADMIN', schoolId: 'school-A', isActive: true, password: 'hash-a-admin' },
  'a-admin-inactive': { id: 'a-admin-inactive', username: 'a-admin-inactive', name: 'A Admin Retired', role: 'ADMIN', schoolId: 'school-A', isActive: false, password: 'hash-x' },
  // school C has two administrators, so either one is replaceable
  'c-admin': { id: 'c-admin', username: 'c-admin', name: 'C Admin', role: 'ADMIN', schoolId: 'school-C', isActive: true, password: 'hash-c-admin' },
  'c-admin2': { id: 'c-admin2', username: 'c-admin2', name: 'C Admin Two', role: 'ADMIN', schoolId: 'school-C', isActive: true, password: 'hash-c-admin2' },
  // an admin belonging to no school at all
  'unbound-admin': { id: 'unbound-admin', username: 'unbound-admin', name: 'Unbound Admin', role: 'ADMIN', schoolId: null, isActive: true, password: 'hash-unbound' },
  // multi-tenant account: no school of its own
  'platform-super': { id: 'platform-super', username: 'platform-super', name: 'Platform Super', role: 'SUPER_ADMIN', schoolId: null, isActive: true, password: 'hash-super' },
}

/** Who the mocked JWT belongs to; `role` also drives the self-update path. */
let callerRole = 'ADMIN'
let callerSchoolId: string | null = 'school-A'
/** Value the mocked `preview_school_id` cookie returns, or null when absent. */
let previewSchoolId: string | null = null

/** Every `where` the route pushed into Prisma, so we can prove it filtered. */
const findFirstWheres: any[] = []
const findManyWheres: any[] = []
const updates: any[] = []
const creates: any[] = []
const adminCountWheres: any[] = []

function row(id: string): Row | null {
  if (id === CALLER_ID) {
    return { id: CALLER_ID, username: 'caller', name: 'Caller', role: callerRole, schoolId: callerSchoolId, isActive: true, password: 'hash-caller' }
  }
  return USERS[id] || null
}

const fakeDb = {
  user: {
    // Two shapes: the actor lookup `getSchoolScope` does (select: schoolId) and
    // the target lookup the route does (select: id/role/schoolId).
    findUnique: async ({ where }: any) => row(where.id),
    findFirst: async ({ where }: any) => {
      findFirstWheres.push(where)
      const found = row(where.id)
      if (!found) return null
      if (where.schoolId !== undefined && found.schoolId !== where.schoolId) return null
      return { id: found.id, role: found.role, schoolId: found.schoolId, isActive: found.isActive }
    },
    // The lockout guard counts the admins a school would still have left — the
    // caller's own row included, exactly as the database would count it.
    count: async ({ where }: any) => {
      adminCountWheres.push(where)
      const all = [...Object.values(USERS), row(CALLER_ID)!]
      return all.filter(
        (u) =>
          u.schoolId === where.schoolId &&
          u.role === where.role &&
          u.isActive === where.isActive &&
          u.id !== where.id?.not
      ).length
    },
    update: async ({ where, data }: any) => {
      updates.push({ where, data })
      const found = row(where.id)
      if (!found) throw new Error('record not found')
      return { ...found, ...data }
    },
    create: async ({ data }: any) => {
      creates.push(data)
      return { id: 'new-user', ...data }
    },
    findMany: async ({ where }: any) => {
      findManyWheres.push(where)
      // Prisma rejects null for a required unique field rather than matching
      // nothing, which is exactly how the "deny by default" sentinel went wrong
      // in the GET path: `{ id: null }` returned a 500 instead of no rows.
      for (const [key, value] of Object.entries(where)) {
        if (value === null) throw new Error(`Argument \`${key}\` must not be null.`)
      }
      if (where.id === '__no_match__') return []
      return Object.values(USERS)
        .concat([row(CALLER_ID)!])
        .filter((u) => (where.schoolId === undefined ? true : u.schoolId === where.schoolId))
        .filter((u) => (where.role === undefined ? true : u.role === where.role))
    },
  },
  school: {
    // The real one validates the preview cookie against an existing school.
    findUnique: async ({ where }: any) => (previewSchoolId && where.id === previewSchoolId ? { id: previewSchoolId } : null),
  },
}

mock.module('@/lib/db', () => ({ db: fakeDb }))
// No request context in a unit test — getSchoolScope reads the preview cookie
// through this module, so serve it from a mutable variable instead.
mock.module('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'preview_school_id' && previewSchoolId ? { value: previewSchoolId } : undefined) }),
}))

let GET: (request: any) => Promise<any>
let PUT: (request: any) => Promise<any>
let POST: (request: any) => Promise<any>
let DELETE: (request: any) => Promise<any>
let AUTH_GET: (request: any) => Promise<any>

beforeAll(async () => {
  ;({ GET, PUT, POST, DELETE } = await import('@/app/api/users/route'))
  ;({ GET: AUTH_GET } = await import('@/app/api/auth/route'))
})

function as(role: string, schoolId: string | null, preview: string | null = null) {
  callerRole = role
  callerSchoolId = schoolId
  previewSchoolId = preview
  findFirstWheres.length = 0
  findManyWheres.length = 0
  updates.length = 0
  creates.length = 0
  adminCountWheres.length = 0
  const token = signToken({ userId: CALLER_ID, username: 'caller', role })
  const headers: Record<string, string> = { 'x-auth-token': token }
  // A bare Request has no `cookies` bag the way a NextRequest does, so the
  // token lookup would throw instead of falling through to the 401 path.
  const request = (url: string, init: RequestInit) =>
    Object.assign(new Request(url, init), { cookies: { get: () => undefined } })
  return {
    get: (qs = '') =>
      GET(request(`http://localhost:3000/api/users${qs}`, { method: 'GET', headers })),
    authGet: (qs = '') =>
      AUTH_GET(request(`http://localhost:3000/api/auth${qs}`, { method: 'GET', headers })),
    post: (body: any) =>
      POST(request('http://localhost:3000/api/users', { method: 'POST', headers, body: JSON.stringify(body) })),
    put: (body: any) =>
      PUT(request('http://localhost:3000/api/users', { method: 'PUT', headers, body: JSON.stringify(body) })),
    del: (id: string) => DELETE(request(`http://localhost:3000/api/users?id=${id}`, { method: 'DELETE', headers })),
    request,
  }
}

async function namesFor(get: (qs?: string) => Promise<any>, qs = ''): Promise<string[]> {
  const res = await get(qs)
  expect(res.status).toBe(200)
  const body = await res.json()
  return body.users.map((u: any) => u.username).sort()
}

describe('lockout guard — deactivation and demotion', () => {
  it('refuses to let an admin deactivate their own account (DELETE)', async () => {
    const { del } = as('ADMIN', 'school-A')
    const res = await del(CALLER_ID)

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
    // Refused before the admin count is even asked for.
    expect(adminCountWheres).toEqual([])
  })

  it('refuses to let an admin deactivate themselves through PUT', async () => {
    const { put } = as('ADMIN', 'school-A')
    const res = await put({ id: CALLER_ID, isActive: false })

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('refuses to deactivate a school’s last active admin', async () => {
    // An unscoped super admin may reach the account; the lockout guard is what
    // must still stop it, because the school would be left with no admin.
    const only = as('SUPER_ADMIN', null)
    const res = await only.del('a-admin')

    expect(res.status).toBe(409)
    expect(updates).toEqual([])
    expect(adminCountWheres).toEqual([
      { schoolId: 'school-A', role: 'ADMIN', isActive: true, id: { not: 'a-admin' } },
    ])
  })

  it('allows it once the school has another active admin', async () => {
    const { del } = as('SUPER_ADMIN', null)
    const res = await del('c-admin2')

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ where: { id: 'c-admin2' }, data: { isActive: false } }])
  })

  it('counts only active admins of the target’s own school', async () => {
    // The second admin lives in school C, so school A still loses its only one.
    const { del, put } = as('SUPER_ADMIN', null)
    expect((await del('a-admin')).status).toBe(409)
    expect(adminCountWheres[0]).toEqual({
      schoolId: 'school-A', role: 'ADMIN', isActive: true, id: { not: 'a-admin' },
    })

    expect((await put({ id: 'a-admin', name: 'x' })).status).toBe(200)
  })

  it('refuses to demote a school’s last active admin', async () => {
    const { put } = as('SUPER_ADMIN', null)
    expect((await put({ id: 'a-admin', role: 'GURU' })).status).toBe(409)
    expect(updates).toEqual([])

    // With a second admin in place the demotion is a normal role change.
    const second = as('SUPER_ADMIN', null)
    expect((await second.put({ id: 'c-admin2', role: 'GURU' })).status).toBe(200)
  })

  it('does not block unrelated changes to an admin account', async () => {
    const { put } = as('SUPER_ADMIN', null)
    expect((await put({ id: 'a-admin', name: 'Renamed Admin' })).status).toBe(200)
    expect(adminCountWheres).toEqual([])
  })

  it('does not protect an admin who is already inactive', async () => {
    const { del } = as('SUPER_ADMIN', null)
    expect((await del('a-admin-inactive')).status).toBe(200)
  })

  it('leaves an admin with no school alone (nothing to lock out)', async () => {
    const { del } = as('SUPER_ADMIN', null)
    expect((await del('unbound-admin')).status).toBe(200)
    expect(adminCountWheres).toEqual([])
  })

  it('still refuses a non-admin from deactivating anyone else', async () => {
    const { put, del } = as('GURU', 'school-A')
    expect((await put({ id: 'a-admin', isActive: false })).status).toBe(403)
    const res = await del('a-admin')
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })
})

describe('POST /api/users — school isolation', () => {
  const body = { username: 'new-guru', password: 'pw', name: 'New Guru', role: 'GURU' }

  it('pins a school-bound admin’s create to their own school', async () => {
    const { post } = as('ADMIN', 'school-A')
    expect((await post(body)).status).toBe(201)
    expect(creates).toEqual([{ ...body, password: expect.any(String), schoolId: 'school-A' }])
  })

  it('refuses to create an account in another school, even when asked', async () => {
    const { post } = as('ADMIN', 'school-A')
    const res = await post({ ...body, schoolId: 'school-B' })
    expect(res.status).toBe(403)
    expect(creates).toEqual([])
  })

  it('refuses an actor with no school binding — no more unbound accounts', async () => {
    const { post } = as('ADMIN', null)
    expect((await post(body)).status).toBe(403)
    expect(creates).toEqual([])
  })

  it('confines a super admin previewing a school to that school', async () => {
    const outside = as('SUPER_ADMIN', null, 'school-A')
    expect((await outside.post({ ...body, schoolId: 'school-B' })).status).toBe(403)
    expect(creates).toEqual([])

    const inside = as('SUPER_ADMIN', null, 'school-A')
    expect((await inside.post(body)).status).toBe(201)
    expect(creates[0].schoolId).toBe('school-A')
  })

  it('never mints a platform account from inside a school', async () => {
    const previewing = as('SUPER_ADMIN', null, 'school-A')
    expect((await previewing.post({ ...body, role: 'SUPER_ADMIN' })).status).toBe(403)

    const admin = as('ADMIN', 'school-A')
    expect((await admin.post({ ...body, role: 'SUPER_ADMIN' })).status).toBe(403)
    expect(creates).toEqual([])
  })

  it('leaves a platform super admin able to choose the school', async () => {
    const { post } = as('SUPER_ADMIN', null)
    expect((await post({ ...body, schoolId: 'school-B' })).status).toBe(201)
    expect(creates[0].schoolId).toBe('school-B')
  })

  it('makes a platform super admin name a school instead of minting an unbound account', async () => {
    const { post } = as('SUPER_ADMIN', null)
    const res = await post(body)

    expect(res.status).toBe(400)
    expect(creates).toEqual([])
    // Same contract as the platform panel's own create, and the twin of the
    // `schoolId || null` update bug: an omitted tenant must not become a real
    // value (here `null`), because an unbound account can neither see nor
    // manage anything.
    expect((await post({ ...body, schoolId: undefined })).status).toBe(400)
    expect(creates).toEqual([])
  })
})

describe('GET /api/auth — the list the Settings → Users screen renders', () => {
  it('confines a school-bound staff member to their own school', async () => {
    // Used to return every tenant's accounts, to GURU included.
    for (const role of ['ADMIN', 'GURU', 'WALI_KELAS']) {
      const { authGet } = as(role, 'school-A')
      expect(await namesFor(authGet)).toEqual(['a-admin', 'a-admin-inactive', 'bound-super', 'caller', 'own-guru'])
      expect(findManyWheres).toEqual([{ schoolId: 'school-A' }])
    }
  })

  it('follows SUPER_ADMIN preview mode', async () => {
    const { authGet } = as('SUPER_ADMIN', null, 'school-A')
    expect(await namesFor(authGet)).toEqual(['a-admin', 'a-admin-inactive', 'bound-super', 'own-guru'])
    expect(findManyWheres).toEqual([{ schoolId: 'school-A' }])
  })

  it('leaves a super admin outside preview mode unscoped', async () => {
    const { authGet } = as('SUPER_ADMIN', null)
    expect(await namesFor(authGet)).toEqual([
      'a-admin', 'a-admin-inactive', 'bound-super', 'c-admin', 'c-admin2', 'caller',
      'other-admin', 'other-guru', 'own-guru', 'platform-super', 'unbound-admin',
    ])
    expect(findManyWheres).toEqual([{}])
  })

  it('returns an empty list — not a 500 — for an actor with no school binding', async () => {
    const { authGet } = as('GURU', null)
    expect(await namesFor(authGet)).toEqual([])
    expect(findManyWheres).toEqual([{ id: '__no_match__' }])
  })

  it('still composes with the role filter', async () => {
    const { authGet } = as('SUPER_ADMIN', null, 'school-A')
    expect(await namesFor(authGet, '?role=GURU')).toEqual(['own-guru'])
    expect(findManyWheres).toEqual([{ schoolId: 'school-A', role: 'GURU' }])
  })

  it('stays 403 for a role that may not list accounts', async () => {
    const { authGet } = as('SISWA', 'school-A')
    expect((await authGet()).status).toBe(403)
    expect(findManyWheres).toEqual([])
  })
})

describe('GET /api/users — school isolation and preview mode', () => {
  it('confines a super admin previewing a school to that school alone', async () => {
    const { get } = as('SUPER_ADMIN', null, 'school-A')
    // The caller themselves is a multi-tenant account (no school of its own),
    // so it correctly drops out of the previewed list too.
    expect(await namesFor(get)).toEqual(['a-admin', 'a-admin-inactive', 'bound-super', 'own-guru'])
    // The filter goes into the query, so other tenants are never fetched.
    expect(findManyWheres).toEqual([{ schoolId: 'school-A' }])
  })

  it('follows the previewed school when it changes', async () => {
    const { get } = as('SUPER_ADMIN', null, 'school-B')
    expect(await namesFor(get)).toEqual(['other-admin', 'other-guru'])
    expect(findManyWheres).toEqual([{ schoolId: 'school-B' }])
  })

  it('leaves a super admin outside preview mode unscoped', async () => {
    const { get } = as('SUPER_ADMIN', null)
    expect(await namesFor(get)).toEqual([
      'a-admin', 'a-admin-inactive', 'bound-super', 'c-admin', 'c-admin2', 'caller',
      'other-admin', 'other-guru', 'own-guru', 'platform-super', 'unbound-admin',
    ])
    expect(findManyWheres).toEqual([{}])
  })

  it('still confines a school-bound admin to its own school', async () => {
    const { get } = as('ADMIN', 'school-A')
    expect(await namesFor(get)).toEqual(['a-admin', 'a-admin-inactive', 'bound-super', 'caller', 'own-guru'])
  })

  it('ignores the preview cookie for a non-super-admin', async () => {
    // Preview is a SUPER_ADMIN affordance: an admin must not be able to read
    // another tenant by writing the cookie itself.
    const { get } = as('ADMIN', 'school-A', 'school-B')
    expect(await namesFor(get)).toEqual(['a-admin', 'a-admin-inactive', 'bound-super', 'caller', 'own-guru'])
  })

  it('returns an empty list — not a 500 — for an actor with no school binding', async () => {
    const { get } = as('ADMIN', null)
    expect(await namesFor(get)).toEqual([])
    // `id: null` would make Prisma throw "Argument `id` must not be null"; the
    // mocked findMany emulates that, so reintroducing the school-scope helper's
    // deny marker here fails this test.
    expect(findManyWheres).toEqual([{ id: '__no_match__' }])
  })

  it('composes the scope with the role and isActive filters', async () => {
    const { get } = as('SUPER_ADMIN', null, 'school-A')
    expect(await namesFor(get, '?role=GURU')).toEqual(['own-guru'])
    expect(findManyWheres).toEqual([{ schoolId: 'school-A', role: 'GURU' }])
    await get('?isActive=false')
    expect(findManyWheres[1]).toEqual({ schoolId: 'school-A', isActive: false })
  })

  it('stays 401 without a token', async () => {
    const { request } = as('ADMIN', 'school-A')
    const res = await GET(request('http://localhost:3000/api/users', { method: 'GET' }))
    expect(res.status).toBe(401)
    expect(findManyWheres).toEqual([])
  })
})

describe('PUT /api/users — school isolation', () => {
  it('refuses to reset another school’s password, and never touches the row', async () => {
    const { put } = as('ADMIN', 'school-A')
    const res = await put({ id: 'other-admin', password: 'audit-pwned-1' })

    expect(res.status).toBe(404)
    // The filter was pushed into the query, not applied after a fetch.
    expect(findFirstWheres).toEqual([{ id: 'other-admin', schoolId: 'school-A' }])
    expect(updates).toEqual([])
  })

  it('refuses to re-role, move, rename or deactivate another school’s user', async () => {
    for (const body of [
      { id: 'other-guru', role: 'ADMIN' },
      { id: 'other-guru', schoolId: 'school-A' },
      { id: 'other-guru', name: 'Pwned' },
      { id: 'other-guru', isActive: false },
    ]) {
      const { put } = as('ADMIN', 'school-A')
      const res = await put(body)
      expect(res.status).toBe(404)
      expect(updates).toEqual([])
    }
  })

  it('still updates a user in the caller’s own school', async () => {
    const { put } = as('ADMIN', 'school-A')
    const res = await put({ id: 'own-guru', name: 'Renamed' })

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ where: { id: 'own-guru' }, data: { name: 'Renamed' } }])
  })

  it('refuses to hand a user to another school', async () => {
    const { put } = as('ADMIN', 'school-A')
    const res = await put({ id: 'own-guru', schoolId: 'school-B' })

    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('never manages a platform account from inside a school', async () => {
    // The bound super admin passes the school check — the escalation guard is
    // what must stop it, since school scoping alone cannot see the difference.
    const { put } = as('ADMIN', 'school-A')
    expect((await put({ id: 'bound-super', password: 'hijacked' })).status).toBe(403)
    expect((await put({ id: 'platform-super', password: 'hijacked' })).status).toBe(404)
    expect(updates).toEqual([])
  })

  it('denies an admin with no school binding', async () => {
    const { put } = as('ADMIN', null)
    expect((await put({ id: 'own-guru', name: 'Nope' })).status).toBe(404)
    expect(updates).toEqual([])
  })

  it('leaves a super admin unscoped so they can manage every school', async () => {
    const { put } = as('SUPER_ADMIN', null)
    expect((await put({ id: 'other-guru', name: 'Managed' })).status).toBe(200)
    expect((await put({ id: 'bound-super', name: 'Managed' })).status).toBe(200)
    expect(updates.length).toBe(2)
  })

  it('confines a super admin previewing a school to that school', async () => {
    const outside = as('SUPER_ADMIN', null, 'school-A')
    expect((await outside.put({ id: 'other-guru', name: 'Nope' })).status).toBe(404)
    expect(updates).toEqual([])

    const inside = as('SUPER_ADMIN', null, 'school-A')
    expect((await inside.put({ id: 'own-guru', name: 'Previewed' })).status).toBe(200)
  })

  it('keeps self-service profile edits working, and still blocks self-promotion', async () => {
    const { put } = as('GURU', 'school-B')
    expect((await put({ id: CALLER_ID, name: 'New Name' })).status).toBe(200)
    expect((await put({ id: CALLER_ID, role: 'ADMIN' })).status).toBe(403)
    expect((await put({ id: CALLER_ID, schoolId: 'school-A' })).status).toBe(403)
    // Self-edit must not be a hole through which the schoolId can be rewritten.
    expect(updates).toEqual([{ where: { id: CALLER_ID }, data: { name: 'New Name' } }])
  })

  it('404s an unknown id instead of failing the update', async () => {
    const { put } = as('ADMIN', 'school-A')
    expect((await put({ id: 'no-such-user', name: 'x' })).status).toBe(404)
    expect(updates).toEqual([])
  })

  it('stays 401 without a token and 403 for a non-admin targeting someone else', async () => {
    const { put, request } = as('ADMIN', 'school-A')
    expect((await PUT(request('http://localhost:3000/api/users', { method: 'PUT', body: JSON.stringify({ id: 'own-guru' }) }))).status).toBe(401)
    expect(updates).toEqual([])

    const kepsek = as('KEPALA_SEKOLAH', 'school-A').put
    expect((await kepsek({ id: 'own-guru', name: 'x' })).status).toBe(403)
    expect(updates).toEqual([])
    expect(findFirstWheres).toEqual([])
  })
})

describe('DELETE /api/users — school isolation', () => {
  it('refuses to deactivate another school’s accounts', async () => {
    for (const id of ['other-guru', 'other-admin', 'platform-super']) {
      const { del } = as('ADMIN', 'school-A')
      const res = await del(id)
      expect(res.status).toBe(404)
      expect(updates).toEqual([])
    }
  })

  it('never deactivates a platform account bound to the caller’s school', async () => {
    const { del } = as('ADMIN', 'school-A')
    expect((await del('bound-super')).status).toBe(403)
    expect(updates).toEqual([])
  })

  it('still deactivates a user in the caller’s own school (soft delete)', async () => {
    const { del } = as('ADMIN', 'school-A')
    const res = await del('own-guru')

    expect(res.status).toBe(200)
    expect(updates).toEqual([{ where: { id: 'own-guru' }, data: { isActive: false } }])
  })

  it('confines a super admin previewing a school to that school', async () => {
    const { del } = as('SUPER_ADMIN', null, 'school-B')
    expect((await del('own-guru')).status).toBe(404)
    expect((await del('other-guru')).status).toBe(200)
  })
})
