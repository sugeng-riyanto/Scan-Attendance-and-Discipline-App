/**
 * Renders the README's RBAC matrix from the policy, so the documented menu and
 * the shipped menu cannot disagree.
 *
 *   bun run rbac:docs     # rewrite the block in README.md
 *
 * `src/lib/rbac-policy.test.ts` runs the same renderer against the committed
 * README, so a policy change without a docs refresh fails the suite.
 */
import fs from 'node:fs'
import path from 'node:path'
import { NAV_ITEMS } from '@/components/dashboard/nav-config'
import { ROLES, ROLE_COLUMNS, canAccessPage } from '@/lib/rbac-policy';

export const RBAC_MATRIX_START = '<!-- RBAC-MATRIX:START -->'
export const RBAC_MATRIX_END = '<!-- RBAC-MATRIX:END -->'

/** The matrix table itself: one row per menu entry, one column per role. */
export function renderRbacMatrix(): string {
  const header = `| Menu | ${ROLES.map((r) => ROLE_COLUMNS[r]).join(' | ')} |`
  const separator = `|------|${ROLES.map(() => ':-----------:').join('|')}|`
  const rows = NAV_ITEMS.map((item) => {
    const cells = ROLES.map((role) => (canAccessPage(role, item.id) ? '✅' : '—'))
    return `| ${item.label} | ${cells.join(' | ')} |`
  })
  return [header, separator, ...rows].join('\n')
}

/** The block as it should appear in README.md, markers included. */
export function renderRbacBlock(): string {
  return `${RBAC_MATRIX_START}\n${renderRbacMatrix()}\n${RBAC_MATRIX_END}`
}

export function readmePath(): string {
  return path.join(process.cwd(), 'README.md')
}

/** What README.md currently has between the markers, or null when they are absent. */
export function readCommittedBlock(readme = fs.readFileSync(readmePath(), 'utf8')): string | null {
  const start = readme.indexOf(RBAC_MATRIX_START)
  const end = readme.indexOf(RBAC_MATRIX_END)
  if (start === -1 || end === -1) return null
  return readme.slice(start, end + RBAC_MATRIX_END.length)
}

/**
 * Is the committed block what the policy renders? Compared with line endings
 * normalised, because README.md is CRLF and the renderer emits LF — see
 * `renderRbacBlock` (`bun run rbac:docs` keeps the file's own convention).
 */
export function isInSync(readme = fs.readFileSync(readmePath(), 'utf8')): boolean {
  const committed = readCommittedBlock(readme)
  if (committed === null) return false
  return committed.replace(/\r\n/g, '\n') === renderRbacBlock()
}

function main() {
  const write = process.argv.includes('--write')
  const readme = fs.readFileSync(readmePath(), 'utf8')
  const committed = readCommittedBlock(readme)

  if (isInSync(readme)) {
    console.log('README RBAC matrix is up to date.')
    return
  }
  if (!write) {
    console.log('README RBAC matrix is STALE — run `bun run rbac:docs`.')
    process.exitCode = 1
    return
  }
  if (committed === null) {
    console.error('README is missing the RBAC-MATRIX markers; insert them around the matrix first.')
    process.exitCode = 1
    return
  }
  // Match the file's existing line endings rather than forcing LF on a CRLF doc.
  const eol = committed.includes('\r\n') ? '\r\n' : '\n'
  fs.writeFileSync(readmePath(), readme.replace(committed, renderRbacBlock().replace(/\n/g, eol)))
  console.log('README RBAC matrix rewritten from the policy.')
}

if (import.meta.main) main()
