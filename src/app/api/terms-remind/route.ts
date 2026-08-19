import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-utils'
import { getSchoolScope } from '@/lib/school-scope'
import { logAudit } from '@/lib/audit'
import { emitSocketEvent } from '@/lib/socket-server'

/**
 * POST /api/terms-remind
 *
 * Admin-only endpoint that finds all users who haven't accepted the current
 * active T&C version and broadcasts a `terms:remind` socket event to notify
 * them.  Affected users who are currently logged in will see a toast nudge
 * on their dashboard.
 *
 * Returns a summary of how many users were notified.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthUser(request)
  if (!auth || !['ADMIN', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Find the current active T&C version
    const activeTerms = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true, title: true },
    })

    if (!activeTerms) {
      return NextResponse.json({ error: 'No active Terms & Conditions found' }, { status: 404 })
    }

    // Find all users who haven't accepted the current version
    // Scope to the same school as the admin (unless SUPER_ADMIN)
    const whereClause: any = {
      isActive: true,
      OR: [
        { termsAcceptedVersion: null },
        { termsAcceptedVersion: { lt: activeTerms.version } },
      ],
    }

    // School scoping: admin/kepsek only sees their own school's users
    if (auth.role !== 'SUPER_ADMIN') {
      const scope = await getSchoolScope(auth)
      if (scope.schoolId) {
        whereClause.schoolId = scope.schoolId
      }
    }

    const pendingUsers = await db.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        termsAcceptedVersion: true,
      },
    })

    if (pendingUsers.length === 0) {
      return NextResponse.json({
        success: true,
        notified: 0,
        message: 'All users have already accepted the latest version.',
      })
    }

    // Broadcast a socket event to all connected dashboards so affected users
    // see a toast nudge immediately.  The event includes the user IDs so the
    // client can filter — only users whose ID is in the list will see the toast.
    try {
      emitSocketEvent('terms:remind', {
        version: activeTerms.version,
        title: activeTerms.title,
        userIds: pendingUsers.map(u => u.id),
        reminderBy: auth.username,
        timestamp: new Date().toISOString(),
      })
    } catch {
      // Socket service may be down — not fatal, the reminder is still logged
    }

    // Audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    await logAudit({
      action: 'TERMS_REMIND_SENT',
      category: 'AUTH',
      severity: 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      details: `Sent T&C v${activeTerms.version} reminder to ${pendingUsers.length} user(s)`,
    })

    // Build summary by role
    const roleCounts: Record<string, number> = {}
    for (const u of pendingUsers) {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1
    }

    return NextResponse.json({
      success: true,
      notified: pendingUsers.length,
      version: activeTerms.version,
      roleCounts,
      users: pendingUsers.map(u => ({
        name: u.name,
        username: u.username,
        role: u.role,
        lastAcceptedVersion: u.termsAcceptedVersion,
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
