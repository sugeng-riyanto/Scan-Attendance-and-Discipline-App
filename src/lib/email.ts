import nodemailer from 'nodemailer'

/**
 * Email sending utility using nodemailer.
 *
 * SMTP configuration via environment variables:
 * - SMTP_HOST     (default: smtp.gmail.com)
 * - SMTP_PORT     (default: 587)
 * - SMTP_USER     (default: '')
 * - SMTP_PASS     (default: '')
 * - SMTP_FROM     (default: 'noreply@attendance-app.com')
 * - SMTP_SECURE   (default: 'false' — use STARTTLS on port 587)
 *
 * If SMTP credentials are not configured, emails are logged to the console
 * instead of being sent (development mode).
 */

interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER || ''
  const pass = process.env.SMTP_PASS || ''
  const secure = process.env.SMTP_SECURE === 'true'

  // If no credentials configured, use jsonTransport (logs to console)
  if (!user || !pass) {
    return nodemailer.createTransport({ jsonTransport: true })
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 5000,
  })
}

/**
 * Send an email.  Returns `{ sent: true }` on success, or `{ sent: false, reason }`
 * if SMTP is not configured (development mode — email content is logged instead).
 */
export async function sendEmail(options: EmailOptions): Promise<{ sent: boolean; messageId?: string; reason?: string }> {
  const from = process.env.SMTP_FROM || 'Attendance Application <noreply@attendance-app.com>'

  try {
    const transporter = getTransporter()
    const info = await transporter.sendMail({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })

    // jsonTransport returns the message as JSON
    if (process.env.SMTP_USER) {
      return { sent: true, messageId: info.messageId }
    }
    // Development mode: log the email content
    console.log('[EMAIL-DEV] Would send to:', options.to)
    console.log('[EMAIL-DEV] Subject:', options.subject)
    console.log('[EMAIL-DEV] Preview:', (info as any).message ? JSON.parse((info as any).message).subject : options.subject)
    return { sent: false, reason: 'SMTP not configured — email logged to console' }
  } catch (error: any) {
    console.error('[EMAIL] Failed to send:', error.message)
    return { sent: false, reason: error.message }
  }
}

/**
 * Build the HTML for a T&C reminder email.
 */
export function buildTermsReminderEmail(params: {
  userName: string
  schoolName: string
  termsVersion: number
  termsTitle: string
  daysRemaining: number
  deadline: string
  appUrl: string
}): string {
  const { userName, schoolName, termsVersion, termsTitle, daysRemaining, deadline, appUrl } = params

  const urgencyColor = daysRemaining <= 7 ? '#dc2626' : daysRemaining <= 14 ? '#d97706' : '#059669'
  const urgencyText = daysRemaining <= 7
    ? `⚠️ Segera! Hanya tersisa ${daysRemaining} hari.`
    : daysRemaining <= 14
      ? `Mohon segera setujui. Tersisa ${daysRemaining} hari.`
      : `Silakan setujui dalam ${daysRemaining} hari.`

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1f2937;">
  <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 20px;">📋 Persetujuan Syarat & Ketentuan Diperlukan</h1>
  </div>
  <div style="background: #f9fafb; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <p>Halo <strong>${userName}</strong>,</p>
    <p>Sekolah <strong>${schoolName}</strong> telah memperbarui Syarat & Ketentuan penggunaan aplikasi presensi.</p>
    
    <div style="background: white; border-left: 4px solid ${urgencyColor}; padding: 16px; margin: 16px 0; border-radius: 0 8px 8px 0;">
      <p style="margin: 0; font-weight: 600; color: ${urgencyColor};">${urgencyText}</p>
      <p style="margin: 8px 0 0; font-size: 14px; color: #6b7280;">
        Versi: <strong>v${termsVersion}</strong> — ${termsTitle}<br>
        Deadline: <strong>${deadline}</strong>
      </p>
    </div>

    <p>Untuk melanjutkan penggunaan aplikasi, Anda <strong>wajib menyetujui</strong> versi terbaru dari Syarat & Ketentuan. Tanpa persetujuan, akun Anda akan terkunci setelah batas waktu berakhir.</p>

    <div style="text-align: center; margin: 24px 0;">
      <a href="${appUrl}/terms" style="display: inline-block; background: #059669; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">
        Buka Syarat & Ketentuan →
      </a>
    </div>

    <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
      Email ini dikirim otomatis oleh Attendance Application. Jika Anda merasa tidak seharusnya menerima email ini, silakan hubungi administrator sekolah.
    </p>
  </div>
</body>
</html>`
}
