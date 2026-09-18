import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-utils'
import { canAccessApi } from '@/lib/rbac-policy'
import { getSchoolScope } from '@/lib/school-scope'
import { logAudit } from '@/lib/audit'
import { acceptanceOnBehalf, selfAcceptance } from '@/lib/terms-provenance'
import { emitSocketEvent } from '@/lib/socket-server'

/**
 * POST /api/terms-accept-bulk
 *
 * Records acceptance of the active T&C version for every user who has not
 * accepted it yet — the administrative counterpart to `POST /api/terms-accept`,
 * which can only ever write the caller's own record.
 *
 * This exists because acceptance is version-scoped: publishing a new version
 * makes the whole school pending at once, and until now the only ways to clear
 * that were for every user to tick the box themselves or for someone to edit the
 * database by hand. It is deliberately an explicit, audited act rather than a
 * side effect of publishing, because the trail has to say that one person
 * recorded it for many, on what date and in which school.
 *
 * The scope is `getSchoolScope` — the same boundary `/api/terms-content?
 * acceptance=true` uses to draw the list an administrator is shown, so they can
 * accept for exactly the users they can see. An administrator covering another
 * school's users would not be a bulk action, it would be a cross-tenant write.
 *
 * Every row it touches carries the provenance: an administrator recorded this,
 * for this account, on this date — except the caller's own row when they are
 * themselves pending, which is written as a self-acceptance, because nobody can
 * hold a mandate from themselves and the trail must not claim one.
 *
 * Idempotent: with nothing pending it reports `updated: 0` and changes nothing.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthUser(request)
  if (!auth || !canAccessApi(auth.role, 'POST /api/terms-accept-bulk')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const activeTerms = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true, title: true },
    })

    if (!activeTerms) {
      return NextResponse.json({ error: 'No active Terms & Conditions found' }, { status: 404 })
    }

    const scope = await getSchoolScope(auth)
    const pendingWhere: any = {
      isActive: true,
      ...scope.schoolWhere,
      OR: [
        { termsAcceptedVersion: null },
        { termsAcceptedVersion: { lt: activeTerms.version } },
      ],
    }

    const pending = await db.user.findMany({
      where: pendingWhere,
      select: { id: true, role: true },
    })

    const now = new Date()

    // Resolved before the write, not after: the record has to name the actor as
    // they were at the time, and the school label needs the same row.
    const actor = await db.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, name: true, username: true, school: { select: { code: true, name: true } } },
    })
    const actorIdentity = { id: actor?.id ?? auth.userId, username: actor?.username ?? auth.username }

    // The caller's own account is not "on behalf": if an administrator is
    // themselves pending, their own acceptance is a self-acceptance. Splitting the
    // two is what keeps `termsAcceptedOnBehalf` meaning what it says.
    const ownRows = pending.filter((u) => u.id === actorIdentity.id)
    const otherRows = pending.filter((u) => u.id !== actorIdentity.id)

    let updated = 0
    let onBehalfCount = 0
    let selfCount = 0
    if (otherRows.length > 0) {
      const result = await db.user.updateMany({
        where: { id: { in: otherRows.map((u) => u.id) } },
        data: {
          termsAcceptedAt: now,
          termsAcceptedVersion: activeTerms.version,
          ...acceptanceOnBehalf(actorIdentity),
        },
      })
      onBehalfCount = result.count
      updated += result.count
    }
    if (ownRows.length > 0) {
      const result = await db.user.updateMany({
        where: { id: { in: ownRows.map((u) => u.id) } },
        data: {
          termsAcceptedAt: now,
          termsAcceptedVersion: activeTerms.version,
          ...selfAcceptance(actorIdentity),
        },
      })
      selfCount = result.count
      updated += result.count
    }

    // Who did it, for how many, in which school, when — the part a consent
    // record must carry, and the reason this is one audit row that says "in bulk"
    // rather than N rows that would read like N individual clicks. The per-user
    // half now lives on each account (`termsAcceptedBy` and friends), so this row
    // only has to say that a single act covered many people.
    const schoolLabel =
      scope.isSuperAdmin && !scope.schoolId
        ? 'every school (platform-wide)'
        : actor?.school?.name ?? 'their school'

    const roleTally = new Map<string, number>()
    for (const user of pending) roleTally.set(user.role, (roleTally.get(user.role) ?? 0) + 1)
    const tally = [...roleTally].map(([role, count]) => `${role}=${count}`).join(', ')

    if (updated > 0) {
      await logAudit({
        action: 'TERMS_ACCEPTED_BULK',
        category: 'AUTH',
        severity: 'INFO',
        userId: auth.userId,
        username: auth.username,
        role: auth.role,
        schoolId: scope.schoolId,
        ip:
          request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
          request.headers.get('x-real-ip') ||
          null,
        details:
          `T&C v${activeTerms.version} recorded as accepted for ${updated} user(s) in ${schoolLabel} ` +
          `(${tally}) — recorded by ${auth.username}, not clicked by each user` +
          (selfCount > 0
            ? `; ${selfCount} of them the caller's own account, recorded as a self-acceptance`
            : ''),
      })

      // An open acceptance widget should not need a reload to notice.
      emitSocketEvent('terms:bulk-accepted', {
        version: activeTerms.version,
        updated,
        onBehalfCount,
        selfCount,
        acceptedBy: actorIdentity.username,
        acceptedAt: now.toISOString(),
      })
    }

    const remaining = await db.user.count({ where: pendingWhere })

    return NextResponse.json({
      success: true,
      version: activeTerms.version,
      updated,
      // How the rows were recorded, so a caller (and the tests) can tell a real
      // bulk act from the case where the only pending account was the admin's own.
      onBehalfCount,
      selfCount,
      remaining,
      scope: schoolLabel,
      acceptedBy: {
        username: actorIdentity.username,
        name: actor?.name ?? auth.username,
        role: auth.role,
      },
      acceptedAt: now.toISOString(),
      message:
        updated > 0
          ? `T&C v${activeTerms.version} accepted for ${updated} user(s) in ${schoolLabel}`
          : `Every user in ${schoolLabel} had already accepted v${activeTerms.version}`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
