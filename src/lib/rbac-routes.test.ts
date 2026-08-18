/**
 * RBAC E2E Test Suite
 * Requires dev server running on http://localhost:3000 with seeded data.
 * Run: bun test src/lib/rbac-routes.test.ts
 *
 * NOTE: bun test runner has a known issue where Cookie headers in fetch
 * requests are not properly forwarded, causing all authenticated requests
 * to return 401/403. This works correctly outside the test runner.
 * To verify RBAC outside bun test: bun -e "<inline test script>"
 */
import { describe, expect, it } from 'bun:test'

const BASE = 'http://localhost:3000'

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

// Cache tokens across tests (lazy login on first use)
const tokenCache: Record<string, string> = {}

async function getToken(username: string): Promise<string | null> {
  if (tokenCache[username]) return tokenCache[username]
  const { password } = ACCOUNTS[username]
  const res = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, acceptedTerms: true }),
  })
  if (!res.ok) return null
  let raw = ''
  if (typeof (res.headers as any).getSetCookie === 'function') {
    raw = (res.headers as any).getSetCookie().join(', ')
  } else {
    raw = res.headers.get('set-cookie') || ''
  }
  const m = raw.match(/token=([^;\s]+)/)
  if (m) { tokenCache[username] = m[1]; return m[1] }
  return null
}

async function req(method: string, path: string, token: string, body?: unknown): Promise<number> {
  const headers: Record<string, string> = { Cookie: `token=${token}` }
  if (body) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return res.status
}

interface EndpointTest {
  label: string; method: string; path: string
  allowedRoles: string[]; body?: unknown
}

const EP: EndpointTest[] = [
  { label: 'GET /api/students', method: 'GET', path: '/api/students', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','SISWA','ORANG_TUA'] },
  { label: 'POST /api/students', method: 'POST', path: '/api/students', allowedRoles: ['ADMIN','VP_KESISWAAN','WALI_KELAS'], body: { nisn:'9999999999', name:'test', classId:'x' } },
  { label: 'GET /api/classes', method: 'GET', path: '/api/classes', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','SISWA','ORANG_TUA'] },
  { label: 'POST /api/classes', method: 'POST', path: '/api/classes', allowedRoles: ['ADMIN'], body: { name:'test', level:'JHS' } },
  { label: 'GET /api/users', method: 'GET', path: '/api/users', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'] },
  { label: 'POST /api/users', method: 'POST', path: '/api/users', allowedRoles: ['ADMIN'], body: { username:'rbact', password:'t', name:'T', role:'GURU' } },
  { label: 'GET /api/attendance', method: 'GET', path: '/api/attendance', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','SISWA','ORANG_TUA'] },
  { label: 'GET /api/violations', method: 'GET', path: '/api/violations', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','SISWA','ORANG_TUA'] },
  { label: 'POST /api/violations', method: 'POST', path: '/api/violations', allowedRoles: ['ADMIN','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'], body: { studentId:'x', categoryId:'x', description:'t' } },
  { label: 'GET /api/good-deeds', method: 'GET', path: '/api/good-deeds', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','SISWA','ORANG_TUA'] },
  { label: 'POST /api/good-deeds', method: 'POST', path: '/api/good-deeds', allowedRoles: ['ADMIN','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'], body: { studentId:'x', categoryId:'x', description:'t' } },
  { label: 'GET /api/permissions', method: 'GET', path: '/api/permissions', allowedRoles: ['ADMIN','WALI_KELAS','VP_KESISWAAN','ORANG_TUA','SISWA'] },
  { label: 'GET /api/categories', method: 'GET', path: '/api/categories', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','SISWA','ORANG_TUA'] },
  { label: 'POST /api/categories', method: 'POST', path: '/api/categories', allowedRoles: ['ADMIN','VP_KESISWAAN'], body: { name:'t', type:'VIOLATION', severity:'LOW', points:1 } },
  { label: 'GET /api/statistics', method: 'GET', path: '/api/statistics', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { label: 'GET /api/alerts', method: 'GET', path: '/api/alerts', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','SISWA','ORANG_TUA'] },
  { label: 'GET /api/audit-logs', method: 'GET', path: '/api/audit-logs', allowedRoles: ['ADMIN','KEPALA_SEKOLAH'] },
  { label: 'GET /api/export', method: 'GET', path: '/api/export', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU_JAGA'] },
  { label: 'GET /api/export-pdf', method: 'GET', path: '/api/export-pdf', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU_JAGA'] },
  { label: 'GET /api/super-admin', method: 'GET', path: '/api/super-admin?resource=schools', allowedRoles: ['SUPER_ADMIN'] },
  { label: 'GET /api/scan-session', method: 'GET', path: '/api/scan-session', allowedRoles: ['_public'] },
  { label: 'GET /api/duty-schedule', method: 'GET', path: '/api/duty-schedule', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'] },
  { label: 'GET /api/school-documents', method: 'GET', path: '/api/school-documents', allowedRoles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','SISWA','ORANG_TUA'] },
  { label: 'GET /api/face-references', method: 'GET', path: '/api/face-references', allowedRoles: ['ADMIN','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'] },
]

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
  for (const ep of EP.filter(e => !e.allowedRoles.includes('_public'))) {
    it(`${ep.label} → 401`, async () => {
      const s = await req(ep.method, ep.path, '', ep.body)
      expect(s).toBe(401)
    })
  }
})

// ─── Per-role tests ───
for (const [username, account] of Object.entries(ACCOUNTS)) {
  describe(`RBAC — ${account.role} (${username})`, () => {
    it('login succeeds', async () => {
      const t = await getToken(username)
      expect(t).not.toBeNull()
      expect(t!.length).toBeGreaterThan(50)
    })

    for (const ep of EP) {
      // _public endpoints are accessible to everyone
      const shouldAllow = ep.allowedRoles.includes('_public') || ep.allowedRoles.includes(account.role)
      it(`${ep.label} → ${shouldAllow ? 'allowed' : '403'}`, async () => {
        const t = await getToken(username)
        if (!t) return // skip if login failed (previous test would fail)

        const s = await req(ep.method, ep.path, t, ep.body)
        if (shouldAllow) {
          expect(s).not.toBe(401)
          expect(s).not.toBe(403)
        } else {
          expect(s).toBe(403)
        }
      })
    }
  })
}
