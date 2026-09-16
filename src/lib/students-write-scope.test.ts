/**
 * Regression test: per-school isolation of student creation.
 *
 * POST /api/students binds the new student *and* the auto-created `student_*`
 * login to the actor's school, and the target class must belong to that school —
 * otherwise an admin of school B could file a student into school A's class and
 * inherit its roster. An actor with no school binding must not create anything.
 *
 * Prisma is mocked so the assertions can inspect the exact `data`/`where` the
 * route builds; this runs without a database or a dev server.
 */
import { describe, expect, it, mock, beforeAll } from 'bun:test'
import { signToken } from '@/lib/auth-utils'

const CALLER_ID = 'u-caller'
const SCHOOL_A = 'school-A'
const SCHOOL_B = 'school-B'

/** Classes that exist, keyed by id. */
const CLASSES: Record<string, { id: string; schoolId: string }> = {
  'class-a': { id: 'class-a', schoolId: SCHOOL_A },
  'class-b': { id: 'class-b', schoolId: SCHOOL_B },
}

let callerRole = 'ADMIN'
let callerSchoolId: string | null = SCHOOL_A
let previewSchoolId: string | null = null

const classWheres: any[] = []
const userCreates: any[] = []
const studentCreates: any[] = []

const fakeDb = {
  user: {
    findUnique: async ({ where }: any) =>
      where.id === CALLER_ID
        ? { id: CALLER_ID, role: callerRole, schoolId: callerSchoolId }
        : null,
    create: async ({ data }: any) => {
      userCreates.push(data)
      return { id: 'new-login', ...data }
    },
  },
  student: {
    create: async ({ data }: any) => {
      studentCreates.push(data)
      return { id: 'new-student', ...data }
    },
  },
  class: {
    // The route reads the class back by (id, schoolId) so a class in another
    // school is indistinguishable from one that does not exist.
    findFirst: async ({ where }: any) => {
      classWheres.push(where)
      const found = CLASSES[where.id]
      if (!found) return null
      if (where.schoolId !== undefined && found.schoolId !== where.schoolId) return null
      return { id: found.id }
    },
  },
  school: {
    findUnique: async ({ where }: any) =>
      previewSchoolId && where.id === previewSchoolId ? { id: previewSchoolId } : null,
  },
}

mock.module('@/lib/db', () => ({ db: fakeDb }))
mock.module('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === 'preview_school_id' && previewSchoolId ? { value: previewSchoolId } : undefined,
  }),
}))

let POST: (request: any) => Promise<any>

beforeAll(async () => {
  ;({ POST } = await import('@/app/api/students/route'))
})

function as(role: string, schoolId: string | null, preview: string | null = null) {
  callerRole = role
  callerSchoolId = schoolId
  previewSchoolId = preview
  classWheres.length = 0
  userCreates.length = 0
  studentCreates.length = 0
  const token = signToken({ userId: CALLER_ID, username: 'caller', role })
  return {
    post: (body: any) =>
      POST(
        Object.assign(
          new Request('http://localhost:3000/api/students', {
            method: 'POST',
            headers: { 'x-auth-token': token, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
          { cookies: { get: () => undefined } },
        ),
      ),
  }
}

const student = (classId: string, nisn = '0099000001') => ({
  nisn,
  name: 'ZZ Test Student',
  classId,
  academicYearId: 'year-1',
  phone: '081200000001',
})

describe('POST /api/students — school isolation', () => {
  it('binds the student and its login to the actor’s school', async () => {
    const { post } = as('ADMIN', SCHOOL_A)
    const res = await post(student('class-a'))

    expect(res.status).toBe(201)
    expect(classWheres).toEqual([{ id: 'class-a', schoolId: SCHOOL_A }])
    expect(studentCreates[0]).toMatchObject({ schoolId: SCHOOL_A, classId: 'class-a' })
    expect(userCreates[0]).toMatchObject({ role: 'SISWA', schoolId: SCHOOL_A })
  })

  it('refuses a class that belongs to another school', async () => {
    const { post } = as('ADMIN', SCHOOL_A)
    const res = await post(student('class-b'))

    expect(res.status).toBe(404)
    // Nothing is written: no login, no student.
    expect(userCreates).toEqual([])
    expect(studentCreates).toEqual([])
  })

  it('refuses an unknown class id', async () => {
    const { post } = as('ADMIN', SCHOOL_A)
    expect((await post(student('no-such-class'))).status).toBe(404)
    expect(studentCreates).toEqual([])
  })

  it('refuses an actor with no school binding', async () => {
    const { post } = as('ADMIN', null)
    expect((await post(student('class-a'))).status).toBe(403)
    expect(studentCreates).toEqual([])
    expect(classWheres).toEqual([])
  })

  it('confines a super admin previewing a school to that school', async () => {
    const inside = as('SUPER_ADMIN', null, SCHOOL_A)
    expect((await inside.post(student('class-a', '0099000002'))).status).toBe(201)
    expect(studentCreates[0].schoolId).toBe(SCHOOL_A)

    const outside = as('SUPER_ADMIN', null, SCHOOL_A)
    expect((await outside.post(student('class-b', '0099000003'))).status).toBe(404)
    expect(studentCreates).toEqual([])
  })

  it('leaves a platform super admin unscoped', async () => {
    const { post } = as('SUPER_ADMIN', null)
    expect((await post(student('class-b'))).status).toBe(201)
    // No tenant check at all for the platform account — it may place a student
    // in any school's class; only the school-bound paths are filtered.
    expect(classWheres).toEqual([])
  })

  it('stays 403 for a role that may not create students', async () => {
    const { post } = as('GURU', SCHOOL_A)
    expect((await post(student('class-a'))).status).toBe(403)
    expect(studentCreates).toEqual([])
  })
})
