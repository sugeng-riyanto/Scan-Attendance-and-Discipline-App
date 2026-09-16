import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole, hashPassword } from '@/lib/auth-utils';
import { getSchoolScope, type SchoolScope } from '@/lib/school-scope';
import { lockoutGuard } from '@/lib/user-lockout';

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

/**
 * Per-school isolation for account writes.
 *
 * Resolves the target user and returns it only if the actor may manage that
 * account: a SUPER_ADMIN manages any school, but a school-bound actor —
 * including a SUPER_ADMIN previewing a school — is confined to users of their
 * own school, and an actor with no school binding may manage nobody. The row is
 * read back by (id, schoolId) rather than fetched and compared, so a user in
 * another school is indistinguishable from one that does not exist.
 */
async function findManageableUser(id: string, scope: SchoolScope) {
  const where: { id: string; schoolId?: string } = { id };
  if (!scope.isSuperAdmin || scope.schoolId) {
    if (!scope.schoolId) return null;
    where.schoolId = scope.schoolId;
  }
  return db.user.findFirst({ where, select: { id: true, role: true, schoolId: true, isActive: true } });
}

export async function GET(request: NextRequest) {
  const authErr = await checkAuth(request, STAFF_ROLES);
  if (authErr instanceof NextResponse) return authErr;

  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const isActive = searchParams.get('isActive');

    // School-scoped reads: a super admin outside preview mode sees every school
    // (no filter); everyone else is confined to one school — their own, or the
    // school a super admin is currently previewing, which is the same thing from
    // here on. An actor with no school binding and no preview sees nobody.
    //
    // Deliberately NOT `{ ...scope.schoolWhere }`: that helper's deny marker is
    // `{ id: null }`, and Prisma rejects null for the required `id` field
    // ("Argument `id` must not be null") instead of matching nothing.
    const scope = await getSchoolScope(authErr);
    const where: Record<string, unknown> = {};
    if (scope.schoolId) {
      where.schoolId = scope.schoolId;
    } else if (!scope.isSuperAdmin) {
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

    // Per-school isolation for creates, the same tenant rule PUT/DELETE use.
    // A school-bound actor — including a SUPER_ADMIN previewing a school — may
    // only create accounts inside the school they are acting for, so a requested
    // `body.schoolId` pointing elsewhere is refused rather than silently ignored
    // (picking a tenant is a platform-level action, exactly as in PUT). An actor
    // with no binding at all must not mint another unbound, unmanageable account.
    const scope = await getSchoolScope(authErr);
    let schoolId: string | null;
    if (scope.schoolId) {
      if (body.schoolId && body.schoolId !== scope.schoolId) {
        return NextResponse.json({ error: 'Tidak dapat membuat pengguna di sekolah lain' }, { status: 403 });
      }
      schoolId = scope.schoolId;
    } else if (scope.isSuperAdmin) {
      // A platform account has no tenant of its own, so it has to name one: an
      // omitted `schoolId` used to create an unbound account, which can neither
      // see nor manage anything — the platform panel could not even edit it into
      // shape without picking a school. Unbound is for SUPER_ADMIN accounts
      // only, and those cannot be created here at all.
      if (role !== 'SUPER_ADMIN' && !body.schoolId) {
        return NextResponse.json({ error: 'Pilih sekolah untuk pengguna baru' }, { status: 400 });
      }
      schoolId = body.schoolId || null;
    } else {
      return NextResponse.json({ error: 'Akun Anda tidak terhubung ke sekolah mana pun' }, { status: 403 });
    }

    // Only SUPER_ADMIN can create SUPER_ADMIN accounts, and never from inside a
    // school preview — that is a platform-level, multi-tenant action.
    if (role === 'SUPER_ADMIN') {
      if (authErr.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (scope.schoolId) {
        return NextResponse.json({ error: 'Tidak dapat membuat akun SUPER_ADMIN saat mode pratinjau aktif' }, { status: 403 });
      }
    }

    const user = await db.user.create({
      data: {
        username,
        password: hashPassword(password),
        name,
        role,
        schoolId: schoolId ?? undefined,
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

    // Per-school isolation: an admin can only manage accounts of their own
    // school, so the target is resolved *through* that school. Self-edit is
    // exempt (a super admin previewing a school has no schoolId of their own to
    // match against).
    let target: { id: string; role: string; schoolId: string | null; isActive: boolean } | null;
    if (isSelf) {
      target = await db.user.findUnique({ where: { id }, select: { id: true, role: true, schoolId: true, isActive: true } });
    } else {
      target = await findManageableUser(id, await getSchoolScope(auth));
      // Escalation guard: a platform account is never manageable from inside a
      // single school, even one it is administratively attached to.
      if (target && target.role === 'SUPER_ADMIN' && auth.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
    if (!target) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan di sekolah Anda' }, { status: 404 });
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

    // Moving an account into another school is a multi-tenant action; everyone
    // else — including a super admin previewing a school — stays in their own
    // tenant (re-sending the same schoolId is a no-op and remains allowed).
    if (data.schoolId !== undefined && data.schoolId !== target.schoolId) {
      const scope = await getSchoolScope(auth);
      if (!scope.isSuperAdmin || scope.schoolId) {
        return NextResponse.json({ error: 'Tidak dapat memindahkan pengguna ke sekolah lain' }, { status: 403 });
      }
    }

    // Lockout guard: deactivating this account, or taking the ADMIN role away
    // from it, must not leave the school without an active administrator.
    const refused = await lockoutGuard({
      actorId: auth.userId,
      target,
      deactivates: data.isActive === false,
      removesAdmin: !!data.role && data.role !== 'ADMIN',
    });
    if (refused) return refused;

    // A blank password means "leave it as it is" — the forms label it that way
    // and omit the key entirely. `if (data.password) { hash }` let an empty
    // string through untouched, so `password: ''` was stored verbatim: no input
    // hashes to '', which bricked the account (and `null` failed the whole
    // update on a non-nullable column). A non-blank password is hashed exactly
    // as sent, so passwords with meaningful surrounding spaces keep working.
    if (data.password !== undefined) {
      const raw = typeof data.password === 'string' ? data.password : '';
      if (raw.trim()) {
        data.password = hashPassword(raw);
      } else {
        delete data.password;
      }
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

    // Per-school isolation: an admin can only deactivate accounts of their own
    // school, so this can't be used to lock other tenants out.
    const target = await findManageableUser(id, await getSchoolScope(authErr));
    if (!target) {
      return NextResponse.json({ error: 'Pengguna tidak ditemukan di sekolah Anda' }, { status: 404 });
    }
    if (target.role === 'SUPER_ADMIN' && authErr.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Lockout guard: never deactivate yourself, and never leave a school with no
    // active administrator.
    const refused = await lockoutGuard({ actorId: authErr.userId, target, deactivates: true });
    if (refused) return refused;

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
