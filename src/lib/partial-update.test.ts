/**
 * Regression test: an omitted field must mean "leave it alone".
 *
 * Four update handlers coerced "not sent" into a *destructive* value — a
 * fallback that turns an absent field into something real rather than a no-op:
 *
 *  1. `POST /api/super-admin` (subscriptions, `action: 'upsert'`) applied its
 *     create-time defaults to the update branch as well: `status || 'ACTIVE'`
 *     re-opened a suspended school (its users are blocked from logging in) and
 *     `notes || null` erased the operator's note, whenever a request changed
 *     only, say, the price.
 *  2. `PUT /api/data-rights` wrote `adminNotes: adminNotes?.slice() || null`, so
 *     processing a request twice (APPROVED → COMPLETED) wiped what the admin had
 *     written on the first pass.
 *  3. `PUT /api/users` did `if (data.password) { hash }` and then wrote the whole
 *     body, so `password: ''` was stored verbatim — no input hashes to `''`, which
 *     bricked the account — and `null` failed the update on a non-nullable column.
 *  4. `POST /api/account` (`action: 'reminder'`) defaulted `reminderType` and
 *     `reminderLevel`, so flipping the switch alone silently reset a stored
 *     CHECK_OUT/SHS preference back to CHECK_IN/JHS.
 *
 * Prisma is mocked so the assertions can read the exact `data` object each route
 * builds. Reinstating any of the four fallbacks fails a case here.
 */
import { describe, expect, it, mock, beforeAll } from 'bun:test'
import { signToken, verifyPassword } from '@/lib/auth-utils'

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
  'a-admin': { id: 'a-admin', username: 'a-admin', name: 'A Admin', role: 'ADMIN', schoolId: 'school-A', isActive: true, password: 'hash-a-admin' },
  'a-admin2': { id: 'a-admin2', username: 'a-admin2', name: 'A Admin Two', role: 'ADMIN', schoolId: 'school-A', isActive: true, password: 'hash-a-admin2' },
  'a-guru': { id: 'a-guru', username: 'a-guru', name: 'A Guru', role: 'GURU', schoolId: 'school-A', isActive: true, password: 'hash-a-guru' },
}

/** The row under test for the account route: the caller's own account. */
const CALLER: Row = { id: CALLER_ID, username: 'caller', name: 'Caller', role: 'ADMIN', schoolId: 'school-A', isActive: true, password: 'hash-caller' }

/** Mutable fixtures for the rows the other routes load by `id`. */
let dataRightsRow: any = null
let subscriptionRow: any = null

const userUpdates: any[] = []
const dataRightsUpdates: any[] = []
const upserts: any[] = []
const auditRows: any[] = []

function userRow(id: string): Row | null {
  return id === CALLER_ID ? CALLER : USERS[id] || null
}

const fakeDb = {
  user: {
    findUnique: async ({ where }: any) => userRow(where.id),
    findFirst: async ({ where }: any) => {
      const found = userRow(where.id)
      if (!found) return null
      if (where.schoolId !== undefined && found.schoolId !== where.schoolId) return null
      return { id: found.id, role: found.role, schoolId: found.schoolId, isActive: found.isActive }
    },
    count: async ({ where }: any) =>
      [CALLER, ...Object.values(USERS)].filter(
        (u) => u.schoolId === where.schoolId && u.role === where.role && u.isActive === where.isActive && u.id !== where.id?.not
      ).length,
    update: async ({ where, data }: any) => {
      userUpdates.push({ where, data })
      const found = userRow(where.id)
      if (!found) throw new Error('record not found')
      Object.assign(found, data)
      return { ...found }
    },
  },
  dataRightsRequest: {
    findUnique: async ({ where }: any) => (dataRightsRow && dataRightsRow.id === where.id ? dataRightsRow : null),
    update: async ({ where, data }: any) => {
      dataRightsUpdates.push({ where, data })
      Object.assign(dataRightsRow, data)
      return { ...dataRightsRow }
    },
  },
  subscription: {
    findUnique: async ({ where }: any) => (subscriptionRow && subscriptionRow.schoolId === where.schoolId ? subscriptionRow : null),
    // Mirrors Prisma's upsert: update the existing row, otherwise insert.
    upsert: async ({ where, update, create }: any) => {
      upserts.push({ where, update, create })
      if (subscriptionRow && subscriptionRow.schoolId === where.schoolId) {
        Object.assign(subscriptionRow, update)
        return { ...subscriptionRow }
      }
      subscriptionRow = { id: 'sub-new', ...create }
      return { ...subscriptionRow }
    },
  },
  school: { findUnique: async () => null },
  auditLog: { create: async ({ data }: any) => { auditRows.push(data); return data } },
}

mock.module('@/lib/db', () => ({ db: fakeDb }))
// No request context in a unit test — getSchoolScope reads the preview cookie
// through this module.
mock.module('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }))

let USERS_PUT: (request: any) => Promise<any>
let DATA_RIGHTS_PUT: (request: any) => Promise<any>
let SUPER_ADMIN_POST: (request: any) => Promise<any>
let ACCOUNT_POST: (request: any) => Promise<any>

beforeAll(async () => {
  ;({ PUT: USERS_PUT } = await import('@/app/api/users/route'))
  ;({ PUT: DATA_RIGHTS_PUT } = await import('@/app/api/data-rights/route'))
  ;({ POST: SUPER_ADMIN_POST } = await import('@/app/api/super-admin/route'))
  ;({ POST: ACCOUNT_POST } = await import('@/app/api/account/route'))
})

function call(handler: (request: any) => Promise<any>, url: string, role: string, body: any) {
  userUpdates.length = 0
  dataRightsUpdates.length = 0
  upserts.length = 0
  const token = signToken({ userId: CALLER_ID, username: 'caller', role })
  const request = Object.assign(
    new Request(url, { method: 'POST', headers: { 'x-auth-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    // A bare Request has no `cookies` bag the way a NextRequest does.
    { cookies: { get: () => undefined } }
  )
  return handler(request)
}

describe('PUT /api/data-rights — admin notes survive a second pass', () => {
  it('does not touch adminNotes when the request omits them', async () => {
    dataRightsRow = { id: 'dr1', schoolId: 'school-A', type: 'ACCESS', userId: 'u1', status: 'APPROVED', adminNotes: 'verified by phone' }
    const res = await call(DATA_RIGHTS_PUT, 'http://localhost:3000/api/data-rights', 'ADMIN', { id: 'dr1', status: 'COMPLETED' })

    expect(res.status).toBe(200)
    expect(dataRightsUpdates).toHaveLength(1)
    expect('adminNotes' in dataRightsUpdates[0].data).toBe(false)
    // The status still moves on, so the guard does not block real work.
    expect(dataRightsUpdates[0].data.status).toBe('COMPLETED')
    expect(dataRightsRow.adminNotes).toBe('verified by phone')
  })

  it('still writes notes that are sent, and clears them on an explicit empty string', async () => {
    dataRightsRow = { id: 'dr1', schoolId: 'school-A', type: 'ACCESS', userId: 'u1', status: 'APPROVED', adminNotes: 'verified by phone' }
    await call(DATA_RIGHTS_PUT, 'http://localhost:3000/api/data-rights', 'ADMIN', { id: 'dr1', status: 'REJECTED', adminNotes: 'no proof of identity' })
    expect(dataRightsUpdates[0].data.adminNotes).toBe('no proof of identity')

    dataRightsRow = { id: 'dr1', schoolId: 'school-A', type: 'ACCESS', userId: 'u1', status: 'APPROVED', adminNotes: 'verified by phone' }
    await call(DATA_RIGHTS_PUT, 'http://localhost:3000/api/data-rights', 'ADMIN', { id: 'dr1', status: 'COMPLETED', adminNotes: '' })
    expect(dataRightsUpdates[0].data.adminNotes).toBe(null)

    dataRightsRow = { id: 'dr1', schoolId: 'school-A', type: 'ACCESS', userId: 'u1', status: 'APPROVED', adminNotes: null }
    await call(DATA_RIGHTS_PUT, 'http://localhost:3000/api/data-rights', 'ADMIN', { id: 'dr1', status: 'COMPLETED', adminNotes: 'x'.repeat(2500) })
    expect((dataRightsUpdates[0].data.adminNotes as string).length).toBe(2000)
  })
})

describe('POST /api/super-admin (subscriptions, upsert) — a partial edit is not a state change', () => {
  it('leaves status and notes alone when the request names neither', async () => {
    subscriptionRow = { id: 'sub1', schoolId: 'school-A', plan: 'YEARLY', status: 'INACTIVE', price: 3000000, notes: 'belum bayar', periodEnd: new Date('2026-01-01') }
    const res = await call(SUPER_ADMIN_POST, 'http://localhost:3000/api/super-admin', 'SUPER_ADMIN', {
      resource: 'subscriptions', action: 'upsert', schoolId: 'school-A', price: '3500000', periodEnd: '2027-01-01',
    })

    expect(res.status).toBe(200)
    const { update } = upserts[0]
    expect('status' in update).toBe(false)
    expect('notes' in update).toBe(false)
    expect(update.price).toBe(3500000)
    // The suspension survives: the school's logins stay blocked.
    expect(subscriptionRow.status).toBe('INACTIVE')
    expect(subscriptionRow.notes).toBe('belum bayar')
  })

  it('writes status and notes when the request does name them', async () => {
    subscriptionRow = { id: 'sub1', schoolId: 'school-A', plan: 'YEARLY', status: 'INACTIVE', price: null, notes: 'belum bayar', periodEnd: null }
    await call(SUPER_ADMIN_POST, 'http://localhost:3000/api/super-admin', 'SUPER_ADMIN', {
      resource: 'subscriptions', action: 'upsert', schoolId: 'school-A', status: 'ACTIVE', notes: 'lunas 16 Sep',
    })

    expect(upserts[0].update.status).toBe('ACTIVE')
    expect(upserts[0].update.notes).toBe('lunas 16 Sep')
    // '' still clears a note deliberately, as the panel's edit dialog does.
    await call(SUPER_ADMIN_POST, 'http://localhost:3000/api/super-admin', 'SUPER_ADMIN', {
      resource: 'subscriptions', action: 'upsert', schoolId: 'school-A', notes: '',
    })
    expect(upserts[0].update.notes).toBe(null)
  })

  it('treats an empty price as "not named" instead of zero, and keeps the create defaults', async () => {
    subscriptionRow = { id: 'sub1', schoolId: 'school-A', plan: 'YEARLY', status: 'ACTIVE', price: 3000000, notes: null, periodEnd: null }
    await call(SUPER_ADMIN_POST, 'http://localhost:3000/api/super-admin', 'SUPER_ADMIN', {
      resource: 'subscriptions', action: 'upsert', schoolId: 'school-A', price: '',
    })
    expect('price' in upserts[0].update).toBe(false)
    expect(subscriptionRow.price).toBe(3000000)

    subscriptionRow = null
    await call(SUPER_ADMIN_POST, 'http://localhost:3000/api/super-admin', 'SUPER_ADMIN', {
      resource: 'subscriptions', action: 'upsert', schoolId: 'school-B',
    })
    expect(upserts[0].create).toMatchObject({ schoolId: 'school-B', plan: 'YEARLY', status: 'ACTIVE', notes: null })
  })
})

describe('PUT /api/users — a blank password means "unchanged"', () => {
  it('never writes an empty or null password', async () => {
    for (const password of ['', '   ', null, undefined]) {
      const res = await call(USERS_PUT, 'http://localhost:3000/api/users', 'ADMIN', { id: 'a-guru', name: 'A Guru', password })
      expect(res.status).toBe(200)
      expect('password' in userUpdates[0].data).toBe(false)
      expect(userRow('a-guru')!.password).toBe('hash-a-guru')
    }
  })

  it('hashes a real password exactly as sent', async () => {
    const res = await call(USERS_PUT, 'http://localhost:3000/api/users', 'ADMIN', { id: 'a-guru', password: '  spaced pass  ' })

    expect(res.status).toBe(200)
    const written = userUpdates[0].data.password as string
    expect(written).not.toBe('  spaced pass  ')
    expect(written.startsWith('$2')).toBe(true)
    // Surrounding spaces are part of the password, not trimmed away.
    expect(verifyPassword('  spaced pass  ', written)).toBe(true)
    expect(verifyPassword('spaced pass', written)).toBe(false)
  })
})

describe('POST /api/account (reminder) — flipping the switch keeps the preference', () => {
  it('writes only the fields the request names', async () => {
    const res = await call(ACCOUNT_POST, 'http://localhost:3000/api/account', 'ADMIN', { action: 'reminder', reminderEnabled: true })
    expect(res.status).toBe(200)
    expect(userUpdates[0].data).toEqual({ reminderEnabled: true })
    expect('reminderType' in userUpdates[0].data).toBe(false)
    expect('reminderLevel' in userUpdates[0].data).toBe(false)
  })

  it('writes type and level when they are sent', async () => {
    await call(ACCOUNT_POST, 'http://localhost:3000/api/account', 'ADMIN', {
      action: 'reminder', reminderEnabled: true, reminderType: 'CHECK_OUT', reminderLevel: 'SHS',
    })
    expect(userUpdates[0].data).toEqual({ reminderEnabled: true, reminderType: 'CHECK_OUT', reminderLevel: 'SHS' })
  })
})
