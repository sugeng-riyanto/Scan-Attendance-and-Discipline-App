// Automatic subscription reminders: a server-side interval scans for schools
// whose subscription expires within 30 days (or is already EXPIRED/INACTIVE
// and thus login-locked) and broadcasts a `subscription:alert` socket event.
// The app shell (MainApp) turns that into a live toast for the Super Admin
// (and for the affected school's own Admin/Kepala Sekolah).
//
// Next.js loads instrumentation.ts in BOTH runtimes, so Prisma is imported
// dynamically inside the nodejs-only branch — the Edge Runtime never sees it
// (Prisma uses node:* modules, which would fail edge module evaluation).
//
// Interval in minutes: SUBSCRIPTION_ALERT_INTERVAL_MIN (default 15).

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { db } = await import('@/lib/db')
  const { emitSocketEvent } = await import('@/lib/socket-server')

  let lastPayload = ''

  const checkAndAlert = async () => {
    try {
      const now = new Date()
      const in30 = new Date(now.getTime() + 30 * 864e5)
      const subs = await db.subscription.findMany({
        where: {
          OR: [
            { status: { in: ['EXPIRED', 'INACTIVE'] } },
            { status: { in: ['ACTIVE', 'TRIAL'] }, periodEnd: { gte: now, lte: in30 } },
          ],
        },
        include: { school: { select: { id: true, code: true, name: true } } },
      })

      const expiring = subs
        .filter(s => s.status === 'ACTIVE' || s.status === 'TRIAL')
        .map(s => ({
          schoolId: s.school.id, code: s.school.code, name: s.school.name,
          status: s.status, periodEnd: s.periodEnd ? s.periodEnd.toISOString() : null,
        }))
        .sort((a, b) => (a.periodEnd || '').localeCompare(b.periodEnd || ''))
      const locked = subs
        .filter(s => s.status === 'EXPIRED' || s.status === 'INACTIVE')
        .map(s => ({ schoolId: s.school.id, code: s.school.code, name: s.school.name, status: s.status }))

      // Only broadcast when the alert set actually changed (checkedAt excluded),
      // so idle servers don't re-toast every interval.
      const key = JSON.stringify({ expiring, locked })
      if (key === lastPayload) return
      lastPayload = key

      emitSocketEvent('subscription:alert', { expiring, locked, checkedAt: new Date().toISOString() })
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[subscription-alert] checked: ${expiring.length} expiring ≤30d, ${locked.length} locked`)
      }
    } catch (err) {
      console.error('[subscription-alert] check failed:', err)
    }
  }

  checkAndAlert() // immediate check on server boot
  const minutes = Math.max(1, Number(process.env.SUBSCRIPTION_ALERT_INTERVAL_MIN || 15))
  setInterval(checkAndAlert, minutes * 60_000)
}
