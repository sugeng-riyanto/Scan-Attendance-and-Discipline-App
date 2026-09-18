import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-utils'
import { logAudit } from '@/lib/audit'
import { selfAcceptance } from '@/lib/terms-provenance'

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

    // Update the user's acceptance record. This endpoint only ever writes the
    // caller's own row, so the provenance is unambiguous: they accepted it
    // themselves, and the record names them rather than leaving a bare timestamp.
    const now = new Date()
    const provenance = selfAcceptance({ id: auth.userId, username: auth.username })
    await db.user.update({
      where: { id: auth.userId },
      data: {
        termsAcceptedAt: now,
        termsAcceptedVersion: activeTerms.version,
        ...provenance,
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
      details:
        `Terms & Conditions v${activeTerms.version} accepted via Terms page ` +
        `by the account holder (${auth.username})`,
    })

    return NextResponse.json({
      success: true,
      termsAcceptedVersion: activeTerms.version,
      termsAcceptedAt: now.toISOString(),
      termsAcceptedBy: provenance.termsAcceptedBy,
      termsAcceptedByUserId: provenance.termsAcceptedByUserId,
      termsAcceptedOnBehalf: provenance.termsAcceptedOnBehalf,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
