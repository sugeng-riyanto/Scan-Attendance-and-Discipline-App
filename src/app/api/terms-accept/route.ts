import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-utils'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/terms-accept
 *
 * Allows an already-authenticated user to accept the current active T&C
 * version without re-entering their password.  Used by the Terms page's
 * "I Accept" button and the dashboard re-acceptance banner flow.
 *
 * Returns the updated user acceptance info on success.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthUser(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Fetch the current active T&C version
    const activeTerms = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true },
    })

    if (!activeTerms) {
      return NextResponse.json({ error: 'No active Terms & Conditions found' }, { status: 404 })
    }

    // Update the user's acceptance record
    const now = new Date()
    await db.user.update({
      where: { id: auth.userId },
      data: {
        termsAcceptedAt: now,
        termsAcceptedVersion: activeTerms.version,
      },
    })

    // Audit log
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    await logAudit({
      action: 'TERMS_ACCEPTED',
      category: 'AUTH',
      severity: 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      details: `Terms & Conditions v${activeTerms.version} accepted via Terms page`,
    })

    return NextResponse.json({
      success: true,
      termsAcceptedVersion: activeTerms.version,
      termsAcceptedAt: now.toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
