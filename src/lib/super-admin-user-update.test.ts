/**
 * Regression test: the platform panel's user `update` action.
 *
 * It used to write `schoolId: schoolId || null`, so any update that left the field
 * out — which the school-scoped screens do — silently unbound the account, and an
 * unbound account can neither manage nor see anything. `schoolId` must now be
 * written only when the request actually names a school.
 *
 * The lockout guard on the same action is covered here too, since the two
 * interact: an omitted field must not count as a tenant move.
 */
import { describe, expect, it, mock, beforeAll } from 'bun:test'
import { signToken } from '@/lib/auth-utils'

interface Row {
  id: string
  username: string
  name: string
  role: string
  schoolId: string | null
  isActive: boolean
  email?: string | null
  password?: string
}

const USERS: Row[] = [
  { id: 'a-admin', username: 'a-admin', name: 'A Admin', role: 'ADMIN', schoolId: 'school-A', isActive: true },
  { id: 'a-guru', username: 'a-guru', name: 'A Guru', role: 'GURU', schoolId: 'school-A', isActive: true },
  { id: 'c-admin', username: 'c-admin', name: 'C Admin', role: 'ADMIN', schoolId: 'school-C', isActive: true },
  { id: 'c-admin2', username: 'c-admin2', name: 'C Admin Two', role: 'ADMIN', schoolId: 'school-C', isActive: true },
]

const updates: any[] = []
const creates: any[] = []
const countWheres: any[] = []

const fakeDb = {
  user: {
    findUnique: async ({ where }: any) =>
      USERS.find((u) => u.id === where.id || u.username === where.username) || null,
    update: async ({ where, data }: any) => {
      updates.push({ where, data })
      const found = USERS.find((u) => u.id === where.id)!
      return { ...found, ...data }
    },
    create: async ({ data }: any) => {
      creates.push(data)
      return { id: 'new-user', ...data }
    },
    count: async ({ where }: any) => {
      countWheres.push(where)
      return USERS.filter(
        (u) =>
          u.schoolId === where.schoolId &&
          u.role === where.role &&
          u.isActive === where.isActive &&
          u.id !== where.id?.not
      ).length
    },
  },
  auditLog: { create: async () => ({ id: 'audit' }) },
}

mock.module('@/lib/db', () => ({ db: fakeDb }))

let POST: (request: any) => Promise<any>

beforeAll(async () => {
  ;({ POST } = await import('@/app/api/super-admin/route'))
})

function call(body: any) {
  updates.length = 0
  creates.length = 0
  countWheres.length = 0
  const token = signToken({ userId: 'u-super', username: 'superadmin', role: 'SUPER_ADMIN' })
  return POST(
    Object.assign(
      new Request('http://localhost:3000/api/super-admin', {
        method: 'POST',
        headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'users', ...body }),
      }),
      {},
    ),
  )
}

describe('POST /api/super-admin (resource=users) — update semantics', () => {
  it('leaves the school alone when schoolId is absent', async () => {
    const res = await call({ action: 'update', id: 'a-guru', username: 'a-guru', name: 'A Guru', role: 'GURU' })

    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    // The scalar must be missing entirely, not null: `null` unbinds the account.
    expect('schoolId' in updates[0].data).toBe(false)
    expect(updates[0].data).toMatchObject({ username: 'a-guru', name: 'A Guru', role: 'GURU' })
  })

  it('leaves the school alone when schoolId is explicitly null or empty', async () => {
    for (const value of [null, '']) {
      const res = await call({ action: 'update', id: 'a-guru', username: 'a-guru', name: 'A Guru', role: 'GURU', schoolId: value })
      expect(res.status).toBe(200)
      expect('schoolId' in updates[0].data).toBe(false)
    }
  })

  it('still moves the account when a school is named', async () => {
    const res = await call({ action: 'update', id: 'a-guru', username: 'a-guru', name: 'A Guru', role: 'GURU', schoolId: 'school-C' })

    expect(res.status).toBe(200)
    expect(updates[0].data.schoolId).toBe('school-C')
  })

  it('refuses to move a school’s last admin to another school', async () => {
    const res = await call({ action: 'update', id: 'a-admin', username: 'a-admin', name: 'A Admin', role: 'ADMIN', schoolId: 'school-C' })

    expect(res.status).toBe(409)
    expect(updates).toEqual([])
  })

  it('allows the same update when the field is omitted (no tenant move)', async () => {
    const res = await call({ action: 'update', id: 'a-admin', username: 'a-admin', name: 'A Admin Renamed', role: 'ADMIN' })

    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
  })

  it('still refuses to demote a school’s last admin', async () => {
    const res = await call({ action: 'update', id: 'a-admin', username: 'a-admin', name: 'A Admin', role: 'GURU', schoolId: 'school-A' })

    expect(res.status).toBe(409)
    expect(updates).toEqual([])
  })

  it('still refuses to deactivate a school’s last admin', async () => {
    const res = await call({ action: 'toggle', id: 'a-admin', isActive: false })

    expect(res.status).toBe(409)
    expect(updates).toEqual([])
    expect(countWheres[0]).toEqual({ schoolId: 'school-A', role: 'ADMIN', isActive: true, id: { not: 'a-admin' } })
  })

  it('deactivates a replaceable admin or a non-admin', async () => {
    expect((await call({ action: 'toggle', id: 'c-admin2', isActive: false })).status).toBe(200)
    expect(updates[0].data).toEqual({ isActive: false })

    expect((await call({ action: 'toggle', id: 'a-guru', isActive: false })).status).toBe(200)
    expect(countWheres).toEqual([])
  })

  it('requires a school when creating', async () => {
    const res = await call({ action: 'create', username: 'new-guru', name: 'New Guru', role: 'GURU' })

    expect(res.status).toBe(400)
    expect(creates).toEqual([])
  })
})
