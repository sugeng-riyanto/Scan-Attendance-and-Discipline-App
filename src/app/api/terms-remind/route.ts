import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth-utils'
import { getSchoolScope } from '@/lib/school-scope'
import { logAudit } from '@/lib/audit'
import { emitSocketEvent } from '@/lib/socket-server'
import { sendEmail, buildTermsReminderEmail } from '@/lib/email'

const TERMS_DEADLINE_DAYS = 30

/**
 * POST /api/terms-remind
 *
 * Admin-only endpoint that finds all users who haven't accepted the current
 * active T&C version and:
 * 1. Broadcasts a `terms:remind` socket event (for online users — toast nudge)
 * 2. Sends an email reminder to users who have an email address (for offline
 *    users who won't see the socket toast)
 *
 * Returns a summary of how many users were notified via each channel.
 */
export async function POST(request: NextRequest) {
  const auth = getAuthUser(request)
  if (!auth || !['ADMIN', 'KEPALA_SEKOLAH', 'SUPER_ADMIN'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // Find the current active T&C version + publication date
    const activeTerms = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true, title: true, createdAt: true },
    })

    if (!activeTerms) {
      return NextResponse.json({ error: 'No active Terms & Conditions found' }, { status: 404 })
    }

    // Calculate deadline for email content
    const publishedAt = new Date(activeTerms.createdAt)
    const deadline = new Date(publishedAt)
    deadline.setDate(deadline.getDate() + TERMS_DEADLINE_DAYS)
    const daysRemaining = Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))

    // Find all users who haven't accepted the current version
    // Include email + school info for email sending
    const whereClause: any = {
      isActive: true,
      OR: [
        { termsAcceptedVersion: null },
        { termsAcceptedVersion: { lt: activeTerms.version } },
      ],
    }

    // School scoping: admin/kepsek only sees their own school's users
    let schoolName = 'Sekolah'
    if (auth.role !== 'SUPER_ADMIN') {
      const scope = await getSchoolScope(auth)
      if (scope.schoolId) {
        whereClause.schoolId = scope.schoolId
        // Fetch school name for email content
        const school = await db.school.findUnique({ where: { id: scope.schoolId }, select: { name: true } })
        if (school) schoolName = school.name
      }
    } else {
      // SUPER_ADMIN: get school name from the first affected user's school
      const sampleUser = await db.user.findFirst({
        where: whereClause,
        select: { schoolId: true },
      })
      if (sampleUser?.schoolId) {
        const school = await db.school.findUnique({ where: { id: sampleUser.schoolId }, select: { name: true } })
        if (school) schoolName = school.name
      }
    }

    const pendingUsers = await db.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        email: true,
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

    // --- Channel 1: Socket event (for online users) ---
    try {
      emitSocketEvent('terms:remind', {
        version: activeTerms.version,
        title: activeTerms.title,
        userIds: pendingUsers.map(u => u.id),
        reminderBy: auth.username,
        timestamp: new Date().toISOString(),
      })
    } catch {
      // Socket service may be down — not fatal
    }

    // --- Channel 2: Email (for users with email addresses) ---
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const usersWithEmail = pendingUsers.filter(u => u.email && u.email.trim().length > 0)
    let emailsSent = 0
    let emailsFailed = 0
    const emailErrors: string[] = []

    if (usersWithEmail.length > 0) {
      const emailHtml = buildTermsReminderEmail({
        userName: '', // Will be customized per user below
        schoolName,
        termsVersion: activeTerms.version,
        termsTitle: activeTerms.title,
        daysRemaining,
        deadline: deadline.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        appUrl,
      })

      // Send emails in parallel (batch of 5 to avoid SMTP rate limits)
      const BATCH_SIZE = 5
      for (let i = 0; i < usersWithEmail.length; i += BATCH_SIZE) {
        const batch = usersWithEmail.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(user => {
            const personalizedHtml = emailHtml.replace(
              /Halo <strong>.*?<\/strong>/,
              `Halo <strong>${user.name}</strong>`
            )
            return sendEmail({
              to: user.email!,
              subject: `[${schoolName}] Persetujuan Syarat & Ketentuan v${activeTerms.version} Diperlukan`,
              html: personalizedHtml,
              text: `Halo ${user.name},\n\n${schoolName} telah memperbarui Syarat & Ketentuan v${activeTerms.version}. Sisa waktu: ${daysRemaining} hari (deadline: ${deadline.toLocaleDateString('id-ID')}).\n\nSilakan buka ${appUrl}/terms untuk menyetujui.\n\nJika tidak disetujui dalam ${TERMS_DEADLINE_DAYS} hari, akun Anda akan terkunci.`,
            })
          })
        )

        for (let j = 0; j < results.length; j++) {
          const result = results[j]
          if (result.status === 'fulfilled' && result.value.sent) {
            emailsSent++
          } else {
            emailsFailed++
            const reason = result.status === 'rejected' ? result.reason?.message : result.value.reason
            emailErrors.push(`${batch[j].username}: ${reason}`)
          }
        }
      }
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
      details: `T&C v${activeTerms.version} reminder: ${pendingUsers.length} users, ${emailsSent} emails sent, ${emailsFailed} failed`,
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
      email: {
        sent: emailsSent,
        failed: emailsFailed,
        skipped: usersWithEmail.length === 0 ? 'No users with email addresses' : undefined,
        errors: emailErrors.length > 0 ? emailErrors.slice(0, 5) : undefined, // Limit error details
      },
      users: pendingUsers.map(u => ({
        name: u.name,
        username: u.username,
        role: u.role,
        email: u.email || null,
        lastAcceptedVersion: u.termsAcceptedVersion,
      })),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
