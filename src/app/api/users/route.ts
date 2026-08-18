import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole, hashPassword } from '@/lib/auth-utils';
import { getSchoolScope } from '@/lib/school-scope';

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

    // School-scoped: non-super-admins only see users from their own school.
    const scope = await getSchoolScope(authErr);
    const where: Record<string, unknown> = {};
    if (!scope.isSuperAdmin && scope.schoolId) {
      where.schoolId = scope.schoolId;
    } else if (!scope.isSuperAdmin) {
      // No school binding → deny (return empty)
      where.id = '__no_match__';
    }
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
        schoolId: true,
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

    // Non-super-admins can only create users in the same school.
    const scope = await getSchoolScope(authErr);
    const schoolId = scope.isSuperAdmin ? (body.schoolId || scope.schoolId) : scope.schoolId;

    // Only SUPER_ADMIN can create SUPER_ADMIN accounts.
    if (role === 'SUPER_ADMIN' && authErr.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await db.user.create({
      data: {
        username,
        password: hashPassword(password),
        name,
        role,
        schoolId: schoolId || undefined,
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

    const isSelf = auth.userId === id;
    const isAdmin = requireRole(auth.role, ADMIN_ROLES);

    // Only ADMIN can update other users; non-admins can only update themselves.
    if (!isSelf && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Self-updates: only allow safe profile fields (no role, schoolId, or isActive).
    if (isSelf && !isAdmin) {
      const safeFields = ['name', 'avatar', 'password', 'email', 'pin'];
      for (const key of Object.keys(data)) {
        if (!safeFields.includes(key)) {
          return NextResponse.json({ error: `Cannot change field '${key}'` }, { status: 403 });
        }
      }
    }

    // Only SUPER_ADMIN can assign or change SUPER_ADMIN role.
    if (data.role === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Only ADMIN can change roles.
    if (data.role && !isAdmin) {
      return NextResponse.json({ error: 'Cannot change role' }, { status: 403 });
    }

    // School-scoping: non-admins cannot change schoolId.
    if (data.schoolId && !isAdmin) {
      return NextResponse.json({ error: 'Cannot change school assignment' }, { status: 403 });
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
