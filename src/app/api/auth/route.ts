import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, signToken, getAuthUser, requireRole } from '@/lib/auth-utils';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'Username dan password diperlukan' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { username } });
    if (!user || !user.isActive) {
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    if (!verifyPassword(password, user.password)) {
      return NextResponse.json({ error: 'Username atau password salah' }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
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
