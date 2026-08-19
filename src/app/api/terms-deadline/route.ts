import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-utils'
import { getSchoolScope } from '@/lib/school-scope'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/terms-deadline
 *
 * Admin-only endpoint to extend or reset the T&C acceptance deadline for
 * specific users.  The deadline is calculated as:
 *   (T&C createdAt + 30 days) + termsDeadlineExtension days
 *
 * Actions:
 * - extend: adds N days to the user's termsDeadlineExtension
 * - reset: sets termsDeadlineExtension back to 0
 * - set: sets termsDeadlineExtension to exactly N days
 *
 * Body: { action: 'extend' | 'reset' | 'set', userId: string, days?: number }
 */
export async function POST(request: NextRequest) {
  const auth = getAuthUser(request)
  if (!auth || !['ADMIN', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { action, userId, days } = body

    if (!action || !userId) {
      return NextResponse.json({ error: 'action and userId are required' }, { status: 400 })
    }

    if (!['extend', 'reset', 'set'].includes(action)) {
      return NextResponse.json({ error: 'action must be extend, reset, or set' }, { status: 400 })
    }

    // Coerce days to number in case it arrives as a string from JSON
    const numDays = typeof days === 'string' ? parseInt(days, 10) : days
    if ((action === 'extend' || action === 'set') && (typeof numDays !== 'number' || isNaN(numDays) || numDays < 0)) {
      return NextResponse.json({ error: 'days must be a positive number for extend/set' }, { status: 400 })
    }

    // Verify the target user exists and is in the same school (unless SUPER_ADMIN)
    const targetUser = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, role: true, schoolId: true, termsDeadlineExtension: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // School scoping: admin/kepsek can only modify users in their own school
    if (auth.role !== 'SUPER_ADMIN') {
      const scope = await getSchoolScope(auth)
      if (scope.schoolId && targetUser.schoolId !== scope.schoolId) {
        return NextResponse.json({ error: 'Cannot modify users from other schools' }, { status: 403 })
      }
    }

    // Calculate new extension value
    let newExtension: number
    switch (action) {
      case 'extend':
        newExtension = targetUser.termsDeadlineExtension + (numDays || 0)
        break
      case 'reset':
        newExtension = 0
        break
      case 'set':
        newExtension = numDays || 0
        break
      default:
        newExtension = 0
    }

    // Cap at 365 days max extension
    newExtension = Math.min(newExtension, 365)

    // Update the user
    await db.user.update({
      where: { id: userId },
      data: { termsDeadlineExtension: newExtension },
    })

    // Audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    const actionLabel = action === 'extend' ? `Extended by ${numDays} days` : action === 'reset' ? 'Reset to 0' : `Set to ${numDays} days`
    await logAudit({
      action: 'TERMS_DEADLINE_UPDATED',
      category: 'AUTH',
      severity: 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      details: `T&C deadline ${actionLabel} for ${targetUser.username} (${targetUser.name}). New extension: ${newExtension} days`,
    })

    return NextResponse.json({
      success: true,
      action,
      userId,
      username: targetUser.username,
      name: targetUser.name,
      previousExtension: targetUser.termsDeadlineExtension,
      newExtension,
      message: `T&C deadline ${actionLabel} for ${targetUser.name}. Effective deadline extended by ${newExtension} days.`,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
