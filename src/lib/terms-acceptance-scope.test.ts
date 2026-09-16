/**
 * Regression test: tenant isolation of T&C acceptance tracking.
 *
 * GET /api/terms-content?acceptance=true must only return users from the
 * caller's own school. It used to read `schoolId` off the JWT, which never
 * carries one, so the row-level filter was skipped and every non-super-admin
 * saw acceptance data for users in every school.
 *
 * Prisma is mocked so the assertions can inspect the exact `where` clause the
 * route builds — this runs without a database or a dev server, unlike the
 * HTTP-level E2E suites in this folder.
 */
import { describe, expect, it, mock, beforeAll } from 'bun:test'
import { signToken } from '@/lib/auth-utils'

const SCHOOL_A_USERS = [
  { id: 'a1', name: 'Ayu', username: 'ayu', role: 'GURU', schoolId: 'school-A', termsAcceptedAt: null, termsAcceptedVersion: null },
  { id: 'a2', name: 'Budi', username: 'budi', role: 'SISWA', schoolId: 'school-A', termsAcceptedAt: null, termsAcceptedVersion: 3 },
]
const SCHOOL_B_USERS = [
  { id: 'b1', name: 'Citra', username: 'citra', role: 'ADMIN', schoolId: 'school-B', termsAcceptedAt: null, termsAcceptedVersion: null },
]

/** Every `where` clause the route handed to Prisma, in call order. */
const seenWheres: any[] = []
/** Which school the mocked session's user account belongs to. */
let callerSchoolId: string | null = null

const fakeDb = {
  termsContent: {
    findFirst: async () => ({ version: 3, updatedAt: new Date('2026-08-01T00:00:00Z') }),
  },
  user: {
    findUnique: async ({ where }: any) => ({ id: where.id, schoolId: callerSchoolId }),
    findMany: async (args: any) => {
      seenWheres.push(args.where)
      const where = args.where || {}
      // `{ id: null }` is the deny-by-default scope for a user with no school.
      if (where.id === null) return []
      const all = [...SCHOOL_A_USERS, ...SCHOOL_B_USERS]
      return where.schoolId ? all.filter(u => u.schoolId === where.schoolId) : all
    },
  },
  school: { findUnique: async () => null },
}

mock.module('@/lib/db', () => ({ db: fakeDb }))
// No request context in a unit test — getSchoolScope reads the preview cookie
// through this module, so return an empty store.
mock.module('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

let GET: (request: any) => Promise<any>

beforeAll(async () => {
  ;({ GET } = await import('@/app/api/terms-content/route'))
})

function acceptanceRequest(role: string, schoolId: string | null) {
  callerSchoolId = schoolId
  seenWheres.length = 0
  const token = signToken({ userId: 'u-caller', username: 'caller', role })
  return new Request('http://localhost:3000/api/terms-content?acceptance=true', {
    headers: { 'x-auth-token': token },
  })
}

describe('T&C acceptance tracking — school isolation', () => {
  it('scopes an admin to their own school', async () => {
    const res = await GET(acceptanceRequest('ADMIN', 'school-A'))
    expect(res.status).toBe(200)

    expect(seenWheres).toEqual([{ isActive: true, schoolId: 'school-A' }])

    const body = await res.json()
    expect(body.total).toBe(SCHOOL_A_USERS.length)
    expect(body.users.map((u: any) => u.id).sort()).toEqual(['a1', 'a2'])
    // No user from the other school leaked into the payload.
    expect(body.users.some((u: any) => u.id === 'b1')).toBe(false)
  })

  it('scopes a kepala sekolah to their own school too', async () => {
    const res = await GET(acceptanceRequest('KEPALA_SEKOLAH', 'school-B'))
    expect(res.status).toBe(200)

    expect(seenWheres).toEqual([{ isActive: true, schoolId: 'school-B' }])

    const body = await res.json()
    expect(body.users.map((u: any) => u.id)).toEqual(['b1'])
  })

  it('denies by default when a non-super-admin has no school binding', async () => {
    const res = await GET(acceptanceRequest('ADMIN', null))
    expect(res.status).toBe(200)

    // Never an unscoped `{ isActive: true }` — that was the leak.
    expect(seenWheres).toEqual([{ isActive: true, id: null }])

    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.users).toEqual([])
  })

  it('leaves a super admin unscoped so they can manage every school', async () => {
    const res = await GET(acceptanceRequest('SUPER_ADMIN', null))
    expect(res.status).toBe(200)

    expect(seenWheres).toEqual([{ isActive: true }])

    const body = await res.json()
    expect(body.total).toBe(SCHOOL_A_USERS.length + SCHOOL_B_USERS.length)
  })

  it('still rejects non-admins with 403 and never queries users', async () => {
    for (const role of ['GURU', 'SISWA', 'ORANG_TUA', 'GURU_JAGA']) {
      const res = await GET(acceptanceRequest(role, 'school-A'))
      expect(res.status).toBe(403)
    }
    expect(seenWheres).toEqual([])
  })
})
