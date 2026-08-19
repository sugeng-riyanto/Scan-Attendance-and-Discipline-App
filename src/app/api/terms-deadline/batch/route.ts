import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-utils'
import { getSchoolScope } from '@/lib/school-scope'
import { logAudit } from '@/lib/audit'

/**
 * PATCH /api/terms-deadline/batch
 *
 * Admin-only endpoint to bulk extend or reset T&C deadlines for ALL pending
 * users (users who haven't accepted the current T&C version).
 *
 * Body: { action: 'extend' | 'reset', days?: number }
 */
export async function PATCH(request: NextRequest) {
  const auth = getAuthUser(request)
  if (!auth || !['ADMIN', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action, days } = body

    if (!action || !['extend', 'reset'].includes(action)) {
      return NextResponse.json({ error: 'action must be extend or reset' }, { status: 400 })
    }

    // Coerce days to number
    const numDays = typeof days === 'string' ? parseInt(days, 10) : days
    if (action === 'extend' && (typeof numDays !== 'number' || isNaN(numDays) || numDays <= 0)) {
      return NextResponse.json({ error: 'days must be a positive number for extend' }, { status: 400 })
    }

    // Find the current active T&C version
    const activeTerms = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    if (!activeTerms) {
      return NextResponse.json({ error: 'No active Terms & Conditions found' }, { status: 404 })
    }

    // Find all users who haven't accepted the current version
    const whereClause: any = {
      isActive: true,
      OR: [
        { termsAcceptedVersion: null },
        { termsAcceptedVersion: { lt: activeTerms.version } },
      ],
    }

    // School scoping
    if (auth.role !== 'SUPER_ADMIN') {
      const scope = await getSchoolScope(auth)
      if (scope.schoolId) {
        whereClause.schoolId = scope.schoolId
      }
    }

    const pendingUsers = await db.user.findMany({
      where: whereClause,
      select: { id: true, name: true, termsDeadlineExtension: true },
    })

    if (pendingUsers.length === 0) {
      return NextResponse.json({ success: true, updated: 0, message: 'No pending users found.' })
    }

    // Bulk update
    let updatedCount = 0
    if (action === 'reset') {
      const result = await db.user.updateMany({
        where: { id: { in: pendingUsers.map(u => u.id) } },
        data: { termsDeadlineExtension: 0 },
      })
      updatedCount = result.count
    } else {
      // For extend, we need per-user updates to add to existing extension
      // Cap at 365 days per user
      for (const user of pendingUsers) {
        const newExt = Math.min(user.termsDeadlineExtension + numDays, 365)
        await db.user.update({
          where: { id: user.id },
          data: { termsDeadlineExtension: newExt },
        })
        updatedCount++
      }
    }

    // Audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const actionLabel = action === 'extend' ? `Extended by ${numDays} days each` : 'Reset to 0'
    await logAudit({
      action: 'TERMS_DEADLINE_BULK_UPDATED',
      category: 'AUTH',
      severity: 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      details: `Bulk T&C deadline ${actionLabel} for ${updatedCount} user(s) v${activeTerms.version}`,
    })

    return NextResponse.json({
      success: true,
      action,
      updated: updatedCount,
      version: activeTerms.version,
      message: `T&C deadline ${actionLabel} for ${updatedCount} user(s).`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
