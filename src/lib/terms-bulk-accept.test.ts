/**
 * POST /api/terms-accept-bulk — recording T&C acceptance on behalf of others.
 *
 * Requires the dev server on http://localhost:3000 with seeded data:
 *   bun test src/lib/terms-bulk-accept.test.ts
 *
 * Proves the three things that make this endpoint safe to hand an administrator,
 * in the order they would hurt if wrong:
 *
 *   1. Only the roles the policy allows may call it. A teacher is refused, and
 *      the refusal changes nothing (the probe user is still pending afterwards).
 *   2. It covers exactly the users the caller can see. A user in the caller's
 *      school is accepted; a user outside it — created here for the purpose — is
 *      not. That boundary is the same `getSchoolScope` the acceptance list uses.
 *   3. It leaves a record saying who did it, when, and that it was one bulk act,
 *      and calling it again changes nothing.
 *
 * The rest of the file is the per-user half of that record
 * (`src/lib/terms-provenance.ts`): every acceptance now names who recorded it and
 * whether it was the account holder or an administrator, so the consent record
 * answers that per person rather than only per bulk operation. All three writers
 * are covered — the admin bulk action, `POST /api/terms-accept`, and the login
 * checkbox — plus the negative properties that matter: an administrator's own
 * account is never labelled "on behalf", a bulk run cannot relabel an acceptance
 * the user made themselves, and rows that predate provenance report *unknown*
 * rather than being backfilled as self-accepted.
 *
 * It is non-destructive whatever state the database is in: every user's prior
 * acceptance is snapshotted first and restored afterwards, and the two throwaway
 * users it needs are deleted, so no account the rest of the suite logs in as is
 * disturbed.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { closeTestDb, loadDevEnv, testDb } from '@/lib/test-db'

// The test's own client (see test-db.ts): it binds nothing the unit suites' module
// mocks can reach, which is why the direct reads below do not go through @/lib/db.
let db: any

const BASE = 'http://localhost:3000'
// The demo logins the suite drives an acceptance through. Every writer of an
// acceptance is exercised as a real session, so the passwords are the seeded ones
// (`README.md`); none of them is a secret.
const ACCOUNTS: Record<string, string> = {
  admin: 'admin123',
  guru1: 'guru123',
  siswa1: 'siswa123',
}

// `bun test` does not load .env.local, which the direct database access below needs.
loadDevEnv()

const tokens: Record<string, string> = {}

async function login(username: string): Promise<string> {
  if (tokens[username]) return tokens[username]
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: ACCOUNTS[username], acceptedTerms: true }),
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

async function callBulk(username: string | null, urlPath = '/api/terms-accept-bulk') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (username) headers.Cookie = `token=${await login(username)}`
  const res = await fetch(`${BASE}${urlPath}`, { method: 'POST', headers })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const stamp = `${Date.now()}`
const inSchoolName = `tcbulk_in_${stamp}`
const outsideName = `tcbulk_out_${stamp}`

let adminSchoolId: string | null = null
let version = 0
let inSchoolId = ''
let outsideId = ''
let adminId = ''
let adminUsername = 'admin'
let guruId = ''
let siswaId = ''
// Every column an acceptance writes, so the restore in `afterAll` can put a row
// back byte-for-byte — provenance included.
let snapshot: {
  id: string
  termsAcceptedAt: Date | null
  termsAcceptedVersion: number | null
  termsAcceptedBy: string | null
  termsAcceptedByUserId: string | null
  termsAcceptedOnBehalf: boolean
}[] = []
let auditIds: string[] = []
let startedAt = new Date()

/** The provenance columns of one user, which is what "who recorded it" means. */
async function acceptanceOf(id: string) {
  return db.user.findUnique({
    where: { id },
    select: {
      termsAcceptedAt: true,
      termsAcceptedVersion: true,
      termsAcceptedBy: true,
      termsAcceptedByUserId: true,
      termsAcceptedOnBehalf: true,
    },
  })
}

/** Put a user back to "has never accepted", so a writer has something to write. */
async function makePending(id: string) {
  await db.user.update({
    where: { id },
    data: {
      termsAcceptedVersion: null,
      termsAcceptedAt: null,
      termsAcceptedBy: null,
      termsAcceptedByUserId: null,
      termsAcceptedOnBehalf: false,
    },
  })
}

describe('T&C bulk acceptance', () => {
  beforeAll(async () => {
    db = await testDb()
    const admin = await db.user.findUnique({
      where: { username: 'admin' },
      select: { id: true, schoolId: true },
    })
    adminSchoolId = admin?.schoolId ?? null
    adminId = admin?.id ?? ''
    guruId = (await db.user.findUnique({ where: { username: 'guru1' }, select: { id: true } }))?.id ?? ''
    siswaId = (await db.user.findUnique({ where: { username: 'siswa1' }, select: { id: true } }))?.id ?? ''

    const active = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    version = active?.version ?? 0

    // One user inside the caller's school and one outside it. Both are created
    // with no acceptance recorded, which is what a brand-new account is.
    const inSchool = await db.user.create({
      data: {
        username: inSchoolName,
        name: 'T&C bulk probe (in school)',
        role: 'SISWA',
        password: 'not-a-login',
        schoolId: adminSchoolId,
      },
      select: { id: true },
    })
    inSchoolId = inSchool.id

    const outsideSchool = await db.school.findFirst({
      where: { id: { not: adminSchoolId ?? '' } },
      select: { id: true },
    })
    const outside = await db.user.create({
      data: {
        username: outsideName,
        name: 'T&C bulk probe (other school)',
        role: 'SISWA',
        password: 'not-a-login',
        schoolId: outsideSchool?.id ?? null,
      },
      select: { id: true },
    })
    outsideId = outside.id

    // Everything the endpoint may touch, so the test leaves the database as it
    // found it however the seed left it.
    // The accounts the later cases log in as are restored whatever school they
    // turn out to live in, not just the caller's — a seed change must not turn a
    // restore into a silent half-restore.
    snapshot = await db.user.findMany({
      where: {
        OR: [
          { schoolId: adminSchoolId },
          { username: { in: ['admin', 'guru1', 'siswa1'] } },
        ],
      },
      select: {
        id: true,
        termsAcceptedAt: true,
        termsAcceptedVersion: true,
        termsAcceptedBy: true,
        termsAcceptedByUserId: true,
        termsAcceptedOnBehalf: true,
      },
    })

    startedAt = new Date()
  })

  afterAll(async () => {
    for (const row of snapshot) {
      await db.user.update({
        where: { id: row.id },
        data: {
          termsAcceptedAt: row.termsAcceptedAt,
          termsAcceptedVersion: row.termsAcceptedVersion,
          termsAcceptedBy: row.termsAcceptedBy,
          termsAcceptedByUserId: row.termsAcceptedByUserId,
          termsAcceptedOnBehalf: row.termsAcceptedOnBehalf,
        },
      })
    }
    await db.user.deleteMany({ where: { id: { in: [inSchoolId, outsideId] } } })
    // Only the trail this test wrote: a real audit entry stays, an artifact of a
    // probe should not be left looking like one.
    if (auditIds.length) await db.auditLog.deleteMany({ where: { id: { in: auditIds } } })
    await closeTestDb()
  })

  it('refuses an anonymous caller', async () => {
    const res = await callBulk(null)
    // 401 rather than the handler's 403: src/middleware.ts answers an API call
    // carrying no token before it reaches any route.
    expect(res.status).toBe(401)
  })

  it('refuses a teacher, and the refusal writes nothing', async () => {
    const res = await callBulk('guru1')
    expect(res.status).toBe(403)

    const probe = await db.user.findUnique({
      where: { id: inSchoolId },
      select: { termsAcceptedVersion: true },
    })
    expect(probe?.termsAcceptedVersion).toBeNull()
  })

  it('accepts for the users the admin can see, and nobody else', async () => {
    const res = await callBulk('admin')
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(version)
    expect(res.body.updated).toBeGreaterThanOrEqual(1)
    expect(res.body.remaining).toBe(0)

    // Who did it and when, in the response itself.
    expect(res.body.acceptedBy.username).toBe('admin')
    expect(Date.parse(res.body.acceptedAt)).toBeGreaterThan(startedAt.getTime() - 1000)

    // Inside the school: accepted on the active version, and the row says an
    // administrator recorded it for this account rather than the user accepting.
    const inside = await acceptanceOf(inSchoolId)
    expect(inside?.termsAcceptedVersion).toBe(version)
    expect(inside?.termsAcceptedAt).toBeInstanceOf(Date)
    expect(inside?.termsAcceptedBy).toBe(adminUsername)
    expect(inside?.termsAcceptedByUserId).toBe(adminId)
    expect(inside?.termsAcceptedOnBehalf).toBe(true)

    // The response separates the two kinds rather than reporting one number: a
    // real bulk act here (the caller's own row is not pending at this point).
    expect(res.body.onBehalfCount).toBe(res.body.updated)
    expect(res.body.selfCount).toBe(0)

    // Outside it: untouched. This is the tenant boundary, not a role gate.
    const outside = await db.user.findUnique({
      where: { id: outsideId },
      select: { termsAcceptedVersion: true },
    })
    expect(outside?.termsAcceptedVersion).toBeNull()
  })

  it('records the act as one bulk entry naming the administrator', async () => {
    const rows = await db.auditLog.findMany({
      where: { action: 'TERMS_ACCEPTED_BULK', createdAt: { gte: startedAt } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, username: true, role: true, details: true, schoolId: true },
    })
    auditIds = rows.map((r) => r.id)

    expect(rows.length).toBe(1)
    const entry = rows[0]
    expect(entry.username).toBe('admin')
    expect(entry.role).toBe('ADMIN')
    expect(entry.schoolId).toBe(adminSchoolId)
    // The trail has to say it was recorded for others, not clicked by them.
    expect(entry.details).toContain(`v${version}`)
    expect(entry.details).toContain('not clicked by each user')
  })

  it('exposes each row\'s provenance through the acceptance report', async () => {
    const res = await fetch(`${BASE}/api/terms-content?acceptance=true`, {
      headers: { Cookie: `token=${await login('admin')}` },
    })
    expect(res.status).toBe(200)
    const report: any = await res.json()

    const row = report.users.find((u: any) => u.id === inSchoolId)
    expect(row.acceptedBy).toBe(adminUsername)
    expect(row.acceptedByUserId).toBe(adminId)
    expect(row.acceptedOnBehalf).toBe(true)

    // And the school-level split the panel shows beside its accepted count.
    expect(report.acceptedOnBehalf).toBeGreaterThanOrEqual(1)
    expect(
      report.acceptedSelf + report.acceptedOnBehalf + report.acceptedUnknown,
    ).toBe(report.accepted)
  })

  it('is idempotent: a second call changes nothing and says so', async () => {
    const res = await callBulk('admin')
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(0)
    expect(res.body.remaining).toBe(0)
    expect(res.body.message).toContain('had already accepted')

    const extra = await db.auditLog.count({
      where: { action: 'TERMS_ACCEPTED_BULK', createdAt: { gte: startedAt } },
    })
    // A no-op is not an event: only the call that changed something is recorded.
    expect(extra).toBe(1)
  })

  // ---- per-user provenance ---------------------------------------------------

  it("records the administrator's own account as a self-acceptance, not on behalf", async () => {
    await makePending(adminId)
    const res = await callBulk('admin')
    expect(res.status).toBe(200)

    // The only account left pending in scope is the caller's own — every earlier
    // case ended with `remaining: 0`. Recording that one "on behalf" would claim a
    // mandate an administrator cannot hold from themselves.
    expect(res.body.updated).toBe(1)
    expect(res.body.selfCount).toBe(1)
    expect(res.body.onBehalfCount).toBe(0)

    const admin = await acceptanceOf(adminId)
    expect(admin.termsAcceptedVersion).toBe(version)
    expect(admin.termsAcceptedBy).toBe('admin')
    expect(admin.termsAcceptedByUserId).toBe(adminId)
    expect(admin.termsAcceptedOnBehalf).toBe(false)
  })

  it('records the account holder as the accepting party when they accept themselves', async () => {
    await makePending(guruId)

    const res = await fetch(`${BASE}/api/terms-accept`, {
      method: 'POST',
      headers: { Cookie: `token=${await login('guru1')}` },
    })
    expect(res.status).toBe(200)
    const body: any = await res.json()
    expect(body.termsAcceptedOnBehalf).toBe(false)
    expect(body.termsAcceptedBy).toBe('guru1')

    const guru = await acceptanceOf(guruId)
    expect(guru.termsAcceptedVersion).toBe(version)
    expect(guru.termsAcceptedAt).toBeInstanceOf(Date)
    expect(guru.termsAcceptedBy).toBe('guru1')
    expect(guru.termsAcceptedByUserId).toBe(guruId)
    expect(guru.termsAcceptedOnBehalf).toBe(false)
  })

  it('cannot relabel an acceptance the user made themselves', async () => {
    const before = await acceptanceOf(guruId)
    expect(before.termsAcceptedOnBehalf).toBe(false)

    // A fresh pending account gives the bulk call something to write, so this is
    // an assertion about a run that acted — not about a run that did nothing.
    await makePending(inSchoolId)
    const res = await callBulk('admin')
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(1)
    expect(res.body.onBehalfCount).toBe(1)

    // guru1 already accepted the active version themselves, so the bulk run must
    // leave their row exactly as it was: same moment, same actor, still self.
    const after = await acceptanceOf(guruId)
    expect(new Date(after.termsAcceptedAt).getTime()).toBe(new Date(before.termsAcceptedAt).getTime())
    expect(after.termsAcceptedBy).toBe('guru1')
    expect(after.termsAcceptedByUserId).toBe(guruId)
    expect(after.termsAcceptedOnBehalf).toBe(false)

    // …while the account it did act on is labelled as recorded for them.
    const probe = await acceptanceOf(inSchoolId)
    expect(probe.termsAcceptedOnBehalf).toBe(true)
    expect(probe.termsAcceptedBy).toBe('admin')
  })

  it('records the same provenance from the login checkbox as from the T&C page', async () => {
    await makePending(siswaId)
    // The helper logs in with `acceptedTerms: true`, which is the checkbox the
    // login screen sends — the third writer of an acceptance.
    await login('siswa1')

    const siswa = await acceptanceOf(siswaId)
    expect(siswa.termsAcceptedVersion).toBe(version)
    expect(siswa.termsAcceptedAt).toBeInstanceOf(Date)
    expect(siswa.termsAcceptedBy).toBe('siswa1')
    expect(siswa.termsAcceptedByUserId).toBe(siswaId)
    expect(siswa.termsAcceptedOnBehalf).toBe(false)
  })

  it('reports an acceptance that predates provenance as unknown, not as self', async () => {
    // What a row written before these columns existed looks like: a version and a
    // moment, no actor at all. Reading it as the user's own act would be inventing
    // consent, so the report must say "not recorded" instead.
    await db.user.update({
      where: { id: inSchoolId },
      data: {
        termsAcceptedVersion: version,
        termsAcceptedAt: new Date(),
        termsAcceptedBy: null,
        termsAcceptedByUserId: null,
        termsAcceptedOnBehalf: false,
      },
    })

    const res = await fetch(`${BASE}/api/terms-content?acceptance=true`, {
      headers: { Cookie: `token=${await login('admin')}` },
    })
    const report: any = await res.json()
    const row = report.users.find((u: any) => u.id === inSchoolId)
    expect(row.acceptedBy).toBeNull()
    expect(row.acceptedOnBehalf).toBe(false)
    expect(report.acceptedUnknown).toBeGreaterThanOrEqual(1)
    expect(
      report.acceptedSelf + report.acceptedOnBehalf + report.acceptedUnknown,
    ).toBe(report.accepted)
  })
})
