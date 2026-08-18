import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hashPassword, verifyPassword } from '@/lib/auth-utils';
import { getPreviewSchoolId } from '@/lib/school-scope';
import { logAudit } from '@/lib/audit';

const PIN_RE = /^\d{4,8}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: auth.userId } });
    if (!user || !user.isActive) return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });

    // SUPER_ADMIN preview mode: report the previewed school's subscription so
    // the banner reflects what that school's users see.
    const scopeSchoolId = user.role === 'SUPER_ADMIN' ? (await getPreviewSchoolId()) : null;
    const effectiveSchoolId = scopeSchoolId ?? user.schoolId;

    const [jhsCfg, shsCfg, checkinCfg, school, subscription] = await Promise.all([
      db.schoolConfig.findUnique({ where: { key: 'dismissal_jhs_time' } }),
      db.schoolConfig.findUnique({ where: { key: 'dismissal_shs_time' } }),
      db.schoolConfig.findUnique({ where: { key: 'checkin_cutoff_hour' } }),
      effectiveSchoolId ? db.school.findUnique({ where: { id: effectiveSchoolId }, select: { id: true, name: true, code: true } }) : Promise.resolve(null),
      effectiveSchoolId ? db.subscription.findUnique({ where: { schoolId: effectiveSchoolId } }) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      profile: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        email: user.email || '',
        pinEnabled: user.pinEnabled,
        authEnabled: user.authEnabled,
        reminderEnabled: user.reminderEnabled,
        reminderType: user.reminderType || 'CHECK_IN',
        reminderLevel: user.reminderLevel || 'JHS',
        createdAt: user.createdAt,
      },
      dismissalTimes: {
        jhs: jhsCfg?.value || '14:50',
        shs: shsCfg?.value || '15:30',
        checkinCutoff: checkinCfg?.value || '7',
      },
      subscription: school && subscription ? {
        schoolId: school.id,
        schoolName: school.name,
        schoolCode: school.code,
        plan: subscription.plan,
        status: subscription.status,
        periodStart: subscription.periodStart,
        periodEnd: subscription.periodEnd,
        price: subscription.price,
        notes: subscription.notes,
      } : null,
    });
  } catch (error) {
    console.error('Account GET error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data akun' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: auth.userId } });
    if (!user || !user.isActive) return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });

    const body = await request.json();
    const action = body.action;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    if (action === 'password') {
      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: 'Kata sandi lama dan baru diperlukan' }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ error: 'Kata sandi baru minimal 6 karakter' }, { status: 400 });
      }
      if (!verifyPassword(currentPassword, user.password)) {
        await logAudit({ action: 'PASSWORD_CHANGE_FAILED', category: 'ACCOUNT', severity: 'WARNING', userId: user.id, username: user.username, role: user.role, ip, details: 'Percobaan ganti kata sandi dengan kata sandi lama salah' });
        return NextResponse.json({ error: 'Kata sandi lama salah' }, { status: 403 });
      }
      await db.user.update({ where: { id: user.id }, data: { password: hashPassword(newPassword) } });
      await logAudit({ action: 'PASSWORD_CHANGE', category: 'ACCOUNT', severity: 'INFO', userId: user.id, username: user.username, role: user.role, ip });
      return NextResponse.json({ message: 'Kata sandi berhasil diubah' });
    }

    if (action === 'email') {
      const email = String(body.email || '').trim();
      if (!EMAIL_RE.test(email)) {
        return NextResponse.json({ error: 'Format email tidak valid' }, { status: 400 });
      }
      await db.user.update({ where: { id: user.id }, data: { email } });
      await logAudit({ action: 'EMAIL_CHANGE', category: 'ACCOUNT', severity: 'INFO', userId: user.id, username: user.username, role: user.role, ip, details: `Email diubah menjadi ${email}` });
      return NextResponse.json({ message: 'Email berhasil diperbarui', email });
    }

    if (action === 'pin') {
      // body: { pin: string, enabled: boolean } — set/change or disable the PIN
      const enabled = !!body.enabled;
      if (enabled) {
        const pin = String(body.pin || '');
        if (!PIN_RE.test(pin)) {
          return NextResponse.json({ error: 'PIN harus 4–8 digit angka' }, { status: 400 });
        }
        await db.user.update({ where: { id: user.id }, data: { pinHash: hashPassword(pin), pinEnabled: true } });
        await logAudit({ action: 'PIN_CHANGE', category: 'ACCOUNT', severity: 'INFO', userId: user.id, username: user.username, role: user.role, ip, details: 'PIN login cepat diatur/diubah' });
        return NextResponse.json({ message: 'PIN berhasil disimpan' });
      }
      await db.user.update({ where: { id: user.id }, data: { pinHash: null, pinEnabled: false, authEnabled: false } });
      await logAudit({ action: 'PIN_DISABLED', category: 'ACCOUNT', severity: 'INFO', userId: user.id, username: user.username, role: user.role, ip, details: 'PIN login cepat dinonaktifkan' });
      return NextResponse.json({ message: 'PIN dinonaktifkan' });
    }

    if (action === 'auth') {
      const authEnabled = !!body.authEnabled;
      if (authEnabled && !user.pinEnabled) {
        return NextResponse.json({ error: 'Atur PIN terlebih dahulu sebelum mengaktifkan autentikasi PIN' }, { status: 400 });
      }
      await db.user.update({ where: { id: user.id }, data: { authEnabled } });
      await logAudit({ action: authEnabled ? 'AUTH_PIN_ENABLED' : 'AUTH_PIN_DISABLED', category: 'ACCOUNT', severity: 'INFO', userId: user.id, username: user.username, role: user.role, ip });
      return NextResponse.json({ message: authEnabled ? 'Autentikasi PIN diaktifkan' : 'Autentikasi PIN dinonaktifkan', authEnabled });
    }

    if (action === 'reminder') {
      const reminderEnabled = !!body.reminderEnabled;
      const reminderType = body.reminderType === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN';
      const reminderLevel = body.reminderLevel === 'SHS' ? 'SHS' : 'JHS';
      await db.user.update({ where: { id: user.id }, data: { reminderEnabled, reminderType, reminderLevel } });
      await logAudit({ action: reminderEnabled ? 'REMINDER_ENABLED' : 'REMINDER_DISABLED', category: 'ACCOUNT', severity: 'INFO', userId: user.id, username: user.username, role: user.role, ip, details: `Reminder ${reminderType === 'CHECK_IN' ? 'check-in' : 'check-out'} (${reminderLevel})` });
      return NextResponse.json({ message: 'Preferensi pengingat disimpan', reminderEnabled, reminderType, reminderLevel });
    }

    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error) {
    console.error('Account POST error:', error);
    return NextResponse.json({ error: 'Gagal memproses pengaturan akun' }, { status: 500 });
  }
}
