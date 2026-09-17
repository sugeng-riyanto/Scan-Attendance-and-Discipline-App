/**
 * Guards the single source of truth.
 *
 * The RBAC policy used to exist as four hand-maintained copies — the route
 * guards, `nav-config.tsx`, `auth-utils.rolePermissions` and the README menu
 * matrix — which had silently drifted apart (the README denied the menu to
 * three roles that had it, and omitted a row the app shipped). These tests make
 * the policy the only place a role list may live, and make the derived copies
 * fail loudly when they fall behind it.
 *
 * No database or dev server needed: everything here is static.
 */
import { describe, expect, it } from 'bun:test'
import fs from 'node:fs'
import path from 'node:path'
import {
  API_ROLES, MENU, PAGE_ROLES, PUBLIC_API_ROUTES, ROLES, ROLE_COLUMNS, ROLE_LABELS,
  canAccessApi, canAccessPage, hasRole, isPublicApiRoute, permissionsFor, type ApiRoute,
} from '@/lib/rbac-policy'
import { NAV_ITEMS } from '@/components/dashboard/nav-config'
import { isInSync } from '@/lib/rbac-docs'

const root = process.cwd()
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

function walkRoutes(dir = path.join(root, 'src/app/api'), acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkRoutes(full, acc)
    else if (entry.name === 'route.ts') acc.push(full)
  }
  return acc
}

describe('RBAC policy — the tables are coherent', () => {
  it('lists every role once, with a label and a README column', () => {
    expect(new Set(ROLES).size).toBe(ROLES.length)
    for (const role of ROLES) {
      expect(ROLE_LABELS[role]).toBeTruthy()
      expect(ROLE_COLUMNS[role]).toBeTruthy()
    }
  })

  it('lists SUPER_ADMIN only on its own (the bypass makes it redundant with others)', () => {
    for (const [route, roles] of Object.entries(API_ROLES)) {
      const list = roles as readonly string[]
      // `[SUPER_ADMIN]` means "platform administrators only"; adding it to a list
      // of school roles would be noise, because the bypass admits it anyway.
      if (list.includes('SUPER_ADMIN')) expect(list).toEqual(['SUPER_ADMIN'])
      expect(new Set(list).size).toBe(list.length)
      for (const role of list) expect(ROLES as readonly string[]).toContain(role)
      expect(route).toMatch(/^(GET|POST|PUT|PATCH|DELETE) \/api\//)
    }
    for (const entry of MENU) {
      const list = entry.roles as readonly string[]
      if (list.includes('SUPER_ADMIN')) expect(list).toEqual(['SUPER_ADMIN'])
      for (const role of list) expect(ROLES as readonly string[]).toContain(role)
    }
  })

  it('gives every menu entry a unique id and a page policy', () => {
    const ids = MENU.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(PAGE_ROLES[id]).toBe(MENU.find((m) => m.id === id)!.roles)
  })

  it('keeps public routes out of the guarded table', () => {
    for (const route of PUBLIC_API_ROUTES) {
      expect(route).toMatch(/^(GET|POST) \/api\//)
      expect(route in API_ROLES).toBe(false)
      expect(isPublicApiRoute(route)).toBe(true)
    }
    expect(isPublicApiRoute('GET /api/students')).toBe(false)
  })
})

describe('RBAC policy — the access functions', () => {
  it('lets a Super Admin through every gate, including an empty role list', () => {
    for (const route of Object.keys(API_ROLES) as ApiRoute[]) {
      expect(canAccessApi('SUPER_ADMIN', route)).toBe(true)
    }
    for (const entry of MENU) expect(canAccessPage('SUPER_ADMIN', entry.id)).toBe(true)
  })

  it('applies each endpoint list to the roles that are not the Super Admin', () => {
    expect(canAccessApi('ADMIN', 'GET /api/audit-logs')).toBe(true)
    expect(canAccessApi('SISWA', 'GET /api/audit-logs')).toBe(false)
    expect(canAccessApi('VP_KESISWAAN', 'POST /api/duty-schedule')).toBe(true)
    expect(canAccessApi('WALI_KELAS', 'POST /api/duty-schedule')).toBe(false)
    expect(canAccessApi('GURU', 'GET /api/export')).toBe(false) // school-wide report
    expect(canAccessApi('GURU', 'POST /api/users')).toBe(false) // admin maintains accounts
    expect(canAccessApi('GURU_JAGA', 'POST /api/scan-session')).toBe(true)
  })

  it('refuses an unknown or missing role', () => {
    expect(canAccessApi('AUDITOR', 'GET /api/students')).toBe(false)
    expect(canAccessApi(undefined, 'GET /api/students')).toBe(false)
    expect(canAccessApi(null, 'GET /api/students')).toBe(false)
    expect(canAccessPage(undefined, 'dashboard')).toBe(false)
  })

  it('offers hasRole without the bypass, for "is this exactly an ADMIN?"', () => {
    expect(hasRole('ADMIN', ['ADMIN'])).toBe(true)
    expect(hasRole('SUPER_ADMIN', ['ADMIN'])).toBe(false)
    expect(hasRole('GURU', ['ADMIN'])).toBe(false)
  })

  it('pages outside the policy are unreachable rather than open', () => {
    expect(canAccessPage('ADMIN', 'attendance')).toBe(false)
  })

  it('derives a role view from the same tables', () => {
    const superAdmin = permissionsFor('SUPER_ADMIN')
    expect(superAdmin.endpoints.length).toBe(Object.keys(API_ROLES).length)
    // Every policy page — the menu plus the off-menu ones (student-profile).
    expect(superAdmin.pages.length).toBe(Object.keys(PAGE_ROLES).length)
    expect(superAdmin.pages).toContain('student-profile')

    const guru = permissionsFor('GURU')
    expect(guru.endpoints).toContain('GET /api/students')
    expect(guru.endpoints).not.toContain('POST /api/users')
    expect(guru.pages).toContain('attendance-scanner')
    expect(guru.pages).not.toContain('audit-logs')
  })
})

describe('RBAC policy — the derived copies cannot drift', () => {
  it('nav-config presents exactly the menu roles, in order', () => {
    expect(NAV_ITEMS.map((n) => n.id)).toEqual(MENU.map((m) => m.id))
    for (const item of NAV_ITEMS) {
      expect([...item.roles]).toEqual([...MENU.find((m) => m.id === item.id)!.roles])
      expect(item.label).toBeTruthy()
    }
  })

  it('every page main-app renders has a policy entry', () => {
    const rendered = [...read('src/components/dashboard/main-app.tsx').matchAll(/case '([a-z-]+)':/g)]
      .map((m) => m[1])
    expect(rendered.length).toBeGreaterThan(10)
    for (const page of rendered) {
      expect(PAGE_ROLES[page as keyof typeof PAGE_ROLES]).toBeDefined()
    }
  })

  it('no route makes an authorisation decision of its own', () => {
    const offenders: string[] = []
    for (const file of walkRoutes()) {
      const src = fs.readFileSync(file, 'utf8')
      if (/requireRole\s*\(/.test(src)) offenders.push(`requireRole: ${path.relative(root, file)}`)
      if (/\.includes\(\s*auth\.role\s*\)/.test(src)) offenders.push(`role list: ${path.relative(root, file)}`)
    }
    expect(offenders).toEqual([])
  })

  it('auth-utils no longer owns an RBAC table', () => {
    const src = read('src/lib/auth-utils.ts')
    expect(/export (const|function) (rolePermissions|hasPermission|requireRole)\b/.test(src)).toBe(false)
  })

  it('keeps the README menu matrix generated from the policy', () => {
    // `bun run rbac:docs` rewrites it; this is what makes a stale one fail.
    expect(isInSync()).toBe(true)
  })
})
