import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, signToken, getAuthUser, requireRole } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const { username, password, pin, acceptedTerms } = await request.json();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    if (!username || (!password && !pin)) {
      return NextResponse.json({ error: 'Username dan password/PIN diperlukan' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      await logAudit({ action: 'LOGIN_FAILED', category: 'AUTH', severity: 'WARNING', username, ip, details: 'Username tidak ditemukan atau akun nonaktif' });
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    // PIN quick login (login cepat) — only when the user enabled it.
    if (pin) {
      if (!user.pinEnabled || !user.authEnabled || !user.pinHash || !verifyPassword(pin, user.pinHash)) {
        await logAudit({ action: 'LOGIN_FAILED', category: 'AUTH', severity: 'WARNING', userId: user.id, username: user.username, role: user.role, ip, details: 'Percobaan login PIN gagal' });
        return NextResponse.json({ error: 'PIN salah atau login PIN belum diaktifkan' }, { status: 401 });
      }
    } else if (!verifyPassword(password, user.password)) {
      await logAudit({ action: 'LOGIN_FAILED', category: 'AUTH', severity: 'WARNING', userId: user.id, username: user.username, role: user.role, ip, details: 'Kata sandi salah' });
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    // Langganan (subscription): sekolah nonaktif/kedaluwarsa diblokir login.
    // SUPER_ADMIN bebas dari pengecekan langganan (mengelola semua sekolah).
    if (user.role !== 'SUPER_ADMIN' && user.schoolId) {
      const sub = await db.subscription.findUnique({ where: { schoolId: user.schoolId } });
      const blocked = sub && (sub.status === 'INACTIVE' || sub.status === 'EXPIRED');
      if (blocked) {
        await logAudit({ action: 'LOGIN_BLOCKED_SUBSCRIPTION', category: 'AUTH', severity: 'WARNING', userId: user.id, username: user.username, role: user.role, ip, details: `Login ditolak: langganan ${sub.status}` });
        return NextResponse.json({ error: 'Langganan sekolah Anda tidak aktif. Hubungi administrator untuk memperbarui langganan.' }, { status: 403 });
      }
    }

    // Syarat & Ketentuan: pengguna yang belum menyetujui tidak boleh login.
    // If the T&C has been updated since the user last accepted, they must
    // re-accept the latest version before logging in.
    let termsAcceptedAt = user.termsAcceptedAt;
    let termsAcceptedVersion = user.termsAcceptedVersion;

    // Fetch the current active T&C version + publication date for deadline calc
    const activeTerms = await db.termsContent.findFirst({
      where: { isActive: true },
      orderBy: { version: 'desc' },
      select: { version: true, createdAt: true },
    });
    const currentVersion = activeTerms?.version ?? 0;

    // 30-day enforcement deadline: if the T&C was published more than 30 days
    // ago and the user still hasn't accepted, their account is locked until
    // an admin publishes a new version (resetting the deadline) or the user
    // contacts support.
    const TERMS_DEADLINE_DAYS = 30;
    let daysUntilDeadline: number | null = null;
    let deadlineLocked = false;

    if (activeTerms?.createdAt) {
      const publishedAt = new Date(activeTerms.createdAt);
      const deadline = new Date(publishedAt);
      // Per-user deadline extension: admins can add extra days for specific users
      const userExtension = (user as any).termsDeadlineExtension ?? 0;
      deadline.setDate(deadline.getDate() + TERMS_DEADLINE_DAYS + userExtension);
      const now = new Date();
      daysUntilDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      deadlineLocked = now > deadline;
    }

    // Determine if re-acceptance is needed
    const needsReAcceptance = currentVersion > 0 && (
      !termsAcceptedAt ||
      termsAcceptedVersion === null ||
      termsAcceptedVersion < currentVersion
    );

    if (needsReAcceptance) {
      // HARD BLOCK: 30-day deadline exceeded — even acceptedTerms=true won't help
      if (deadlineLocked) {
        await logAudit({
          action: 'LOGIN_BLOCKED_TERMS_DEADLINE', category: 'AUTH', severity: 'WARNING',
          userId: user.id, username: user.username, role: user.role, ip,
          details: `Login ditolak: batas waktu 30 hari penerimaan Syarat & Ketentuan v${currentVersion} telah habis`,
        });
        return NextResponse.json({
          error: `Anda belum menyetujui Syarat & Ketentuan v${currentVersion} dalam waktu 30 hari sejak diterbitkan. Akun Anda terkunci. Silakan hubungi administrator sekolah untuk mengaktifkan kembali akun Anda.`,
          termsDeadlineLocked: true, currentVersion, daysUntilDeadline: 0,
        }, { status: 403 });
      }

      if (acceptedTerms === true) {
        termsAcceptedAt = new Date();
        termsAcceptedVersion = currentVersion;
        await db.user.update({
          where: { id: user.id },
          data: { termsAcceptedAt, termsAcceptedVersion },
        });
      } else {
        return NextResponse.json(
          { error: 'Terms & Conditions have been updated. Please accept the latest version before logging in.',
            termsUpdated: true, currentVersion, daysUntilDeadline },
          { status: 403 }
        );
      }
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    // Per-school branding: the client stores the user's school so the app
    // header and pages use THAT school's branding after login.
    const school = user.schoolId
      ? await db.school.findUnique({
          where: { id: user.schoolId },
          select: { id: true, code: true, name: true, address: true, logo: true, themeColor: true },
        })
      : null;

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
        termsAccepted: !!termsAcceptedAt,
        termsAcceptedVersion,
        school: school
          ? { id: school.id, code: school.code, name: school.name, address: school.address, logo: school.logo, themeColor: school.themeColor }
          : null,
      },
      message: 'Login berhasil',
    });

    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    response.headers.set('Authorization', `Bearer ${token}`);

    await logAudit({ action: pin ? 'LOGIN_PIN_SUCCESS' : 'LOGIN_SUCCESS', category: 'AUTH', severity: 'INFO', userId: user.id, username: user.username, role: user.role, ip, details: pin ? 'Login cepat dengan PIN' : 'Login dengan kata sandi' });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Gagal login' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth || !requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    const where: Record<string, unknown> = {};
    if (role) where.role = role;

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        student: { select: { id: true, nisn: true, name: true } },
        parent: { select: { id: true, studentId: true, relationship: true, student: { select: { name: true } } } },
        teacher: { select: { id: true, nip: true } },
        homeroomOf: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data pengguna' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth || !requireRole(auth.role, ['ADMIN'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await logAudit({ action: 'LOGOUT', category: 'AUTH', severity: 'INFO', userId: auth.userId, username: auth.username, role: auth.role, details: 'Pengguna logout' });

    const response = NextResponse.json({ message: 'Logout berhasil' });

    response.cookies.set('token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    });

    return response;
  } catch (error) {
    return NextResponse.json({ error: 'Gagal logout' }, { status: 500 });
  }
}
