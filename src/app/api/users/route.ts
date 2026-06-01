import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole, hashPassword } from '@/lib/auth-utils';

async function checkAuth(request: NextRequest, allowedRoles: string[]) {
  const auth = getAuthUser(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!requireRole(auth.role, allowedRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return auth;
}

const ADMIN_ROLES = ['ADMIN'];
const STAFF_ROLES = ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'];

export async function GET(request: NextRequest) {
  const authErr = await checkAuth(request, STAFF_ROLES);
  if (authErr instanceof NextResponse) return authErr;

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const isActive = searchParams.get('isActive');

    const where: Record<string, unknown> = {};
    if (role) where.role = role;
    if (isActive !== null && isActive !== undefined && isActive !== '') where.isActive = isActive === 'true';

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        student: { select: { id: true, nisn: true, name: true, class: { select: { name: true } } } },
        parent: { select: { id: true, student: { select: { name: true, class: { select: { name: true } } } }, relationship: true } },
        teacher: { select: { id: true, nip: true, subjects: true } },
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

export async function POST(request: NextRequest) {
  const authErr = await checkAuth(request, ADMIN_ROLES);
  if (authErr instanceof NextResponse) return authErr;

  try {
    const body = await request.json();
    const { username, password, name, role } = body;

    if (!username || !password || !name || !role) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const user = await db.user.create({
      data: {
        username,
        password: hashPassword(password),
        name,
        role,
      },
    });

    return NextResponse.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } }, { status: 201 });
  } catch (error: unknown) {
    const prismaErr = error as { code?: string };
    if (prismaErr.code === 'P2002') {
      return NextResponse.json({ error: 'Username sudah digunakan' }, { status: 409 });
    }
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Gagal membuat pengguna' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    // Allow ADMIN to update any user, or user to update their own profile
    if (auth.userId !== id && !requireRole(auth.role, ADMIN_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (data.password) {
      data.password = hashPassword(data.password);
    }

    const user = await db.user.update({
      where: { id },
      data,
    });

    return NextResponse.json({ user: { id: user.id, username: user.username, name: user.name, role: user.role } });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate pengguna' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const authErr = await checkAuth(request, ADMIN_ROLES);
  if (authErr instanceof NextResponse) return authErr;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const user = await db.user.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ message: 'Pengguna dinonaktifkan', user: { id: user.id, username: user.username, name: user.name, isActive: user.isActive } });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Gagal menghapus pengguna' }, { status: 500 });
  }
}
