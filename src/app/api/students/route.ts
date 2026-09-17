import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hashPassword } from '@/lib/auth-utils';
import { canAccessApi } from '@/lib/rbac-policy';
import { getSchoolScope } from '@/lib/school-scope';

function generateQRString(nisn: string): string {
  const salt = 'SCHOOL-ATTENDANCE-2024';
  const b64 = Buffer.from(nisn + salt).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `SCH-${nisn}-${b64.slice(0, 8)}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'GET /api/students')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const search = searchParams.get('search');
    const academicYearId = searchParams.get('academicYearId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Per-school isolation: non-super users only see their own school's students.
    const scope = await getSchoolScope(auth);
    const where: any = { ...scope.schoolWhere };
    if (classId && classId !== 'all') where.classId = classId;
    if (academicYearId) where.academicYearId = academicYearId;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nisn: { contains: search } },
        { qrCode: { contains: search } },
      ];
    }

    const [students, total] = await Promise.all([
      db.student.findMany({
        where,
        include: {
          class: { include: { academicYear: { select: { id: true, name: true } } } },
          user: { select: { id: true, username: true, name: true, role: true } },
          parents: { include: { user: { select: { id: true, name: true } } } },
        },
        orderBy: [{ class: { name: 'asc' } }, { name: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.student.count({ where }),
    ]);

    return NextResponse.json({
      students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get students error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data siswa' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'POST /api/students')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { nisn, name, classId, academicYearId, gender, qrCode, photoBase64, photoUrl, address, email, phone, status } = body;

    if (!nisn || !name || !classId || !academicYearId) {
      return NextResponse.json({ error: 'NISN, Nama, Kelas, dan Tahun Ajaran wajib diisi' }, { status: 400 });
    }

    // No HP is required for a *new* student — the settings form marks the field
    // with a red *. Rows created before this rule (seeder, bulk import) may
    // still be empty, so PUT below only blocks clearing a phone that exists.
    const cleanPhone = String(phone ?? '').trim();
    if (!cleanPhone) {
      return NextResponse.json({ error: 'No HP wajib diisi' }, { status: 400 });
    }

    // Per-school isolation: the new student — and the login created with it — is
    // bound to the actor's school, and the class it is filed into must belong to
    // that school, so an admin of another school cannot file a student into
    // school-A's class and inherit its roster. A SUPER_ADMIN previewing a school
    // acts as that school; a school-bound actor is pinned to their own; an actor
    // with no school binding must not create unbound students and logins.
    const scope = await getSchoolScope(auth);
    if (!scope.schoolId && !scope.isSuperAdmin) {
      return NextResponse.json({ error: 'Akun Anda tidak terhubung ke sekolah mana pun' }, { status: 403 });
    }

    if (scope.schoolId) {
      const ownedClass = await db.class.findFirst({
        where: { id: classId, schoolId: scope.schoolId },
        select: { id: true },
      });
      if (!ownedClass) {
        return NextResponse.json({ error: 'Kelas tidak ditemukan di sekolah Anda' }, { status: 404 });
      }
    }

    // Auto-create User account for the student (bound to the same school)
    const username = `student_${nisn}`;
    const defaultPassword = nisn; // Use NISN as default password
    const hashedPw = hashPassword(defaultPassword);

    const user = await db.user.create({
      data: {
        username,
        password: hashedPw,
        name,
        role: 'SISWA',
        schoolId: scope.schoolId,
      },
    });

    // Generate QR code if not provided
    const studentQrCode = qrCode || generateQRString(nisn);

    const student = await db.student.create({
      data: {
        nisn,
        name,
        schoolId: scope.schoolId,
        classId,
        academicYearId,
        userId: user.id,
        qrCode: studentQrCode,
        gender: gender || null,
        // Clients (settings page, ID card) send the student photo as base64.
        // Student has no photoBase64 column — it is stored in photoUrl, which
        // holds either a URL or a data URL and is what the UI renders.
        photoUrl: photoBase64 || photoUrl || null,
        address: address || null,
        email: email || null,
        phone: cleanPhone,
        status: status || 'AKTIF',
      },
      include: { class: true, user: { select: { name: true, username: true } } },
    });

    return NextResponse.json({ student }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      const target = error?.meta?.target as string[] | undefined;
      if (target?.includes('nisn')) {
        return NextResponse.json({ error: 'NISN sudah terdaftar' }, { status: 409 });
      }
      if (target?.includes('qrCode')) {
        return NextResponse.json({ error: 'QR Code sudah terdaftar' }, { status: 409 });
      }
      if (target?.includes('userId')) {
        return NextResponse.json({ error: 'User akun sudah terkait dengan siswa lain' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Data duplikat terdeteksi' }, { status: 409 });
    }
    console.error('Create student error:', error);
    return NextResponse.json({ error: 'Gagal membuat siswa' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'PUT /api/students')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    // Per-school isolation: only allow updating a student in the actor's school.
    const scope = await getSchoolScope(auth);
    if (!scope.isSuperAdmin && scope.schoolId) {
      const owned = await db.student.findFirst({ where: { id, ...scope.schoolWhere }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: 'Siswa tidak ditemukan di sekolah Anda' }, { status: 404 });
    }

    // No HP is required when creating a student, so an existing one can't be
    // blanked later — that would quietly undo the requirement. Students that
    // were created empty (seeder, bulk import) stay editable as they are.
    if (data.phone !== undefined && !String(data.phone).trim()) {
      const current = await db.student.findUnique({ where: { id }, select: { phone: true } });
      if (current?.phone) {
        return NextResponse.json({ error: 'No HP wajib diisi' }, { status: 400 });
      }
    }

    // Filter out fields that shouldn't be updated directly
    const allowedFields = ['nisn', 'name', 'classId', 'academicYearId', 'gender', 'qrCode', 'address', 'email', 'phone', 'status', 'photoUrl', 'totalViolationPoints', 'totalGoodPoints', 'faceCaptureEnabled', 'idCardVisibleToStudent', 'idCardVisibleToParent'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key];
      }
    }
    // Same mapping as POST: the client's photoBase64 lands in photoUrl.
    // (Leaving it in allowedFields would send an unknown column to Prisma and
    // fail the whole update.)
    if (data.photoBase64 !== undefined) {
      updateData.photoUrl = data.photoBase64;
    }
    // Students that predate the required-No HP rule keep phone = null, while the
    // settings form always submits the field — so store an empty one as null
    // instead of rewriting the legacy row to ''.  (Blanking a phone that does
    // exist is refused above.)
    if (updateData.phone !== undefined) {
      updateData.phone = String(updateData.phone).trim() || null;
    }

    // If name is being updated, also update the user's name
    if (data.name) {
      const existingStudent = await db.student.findUnique({ where: { id }, select: { userId: true } });
      if (existingStudent) {
        await db.user.update({
          where: { id: existingStudent.userId },
          data: { name: data.name },
        });
      }
    }

    const student = await db.student.update({
      where: { id },
      data: updateData,
      include: { class: true, user: { select: { name: true, username: true } } },
    });

    return NextResponse.json({ student });
  } catch (error) {
    console.error('Update student error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate siswa' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'DELETE /api/students')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    // Per-school isolation: only allow deleting a student in the actor's school.
    const scope = await getSchoolScope(auth);
    if (!scope.isSuperAdmin && scope.schoolId) {
      const owned = await db.student.findFirst({ where: { id, ...scope.schoolWhere }, select: { id: true } });
      if (!owned) return NextResponse.json({ error: 'Siswa tidak ditemukan di sekolah Anda' }, { status: 404 });
    }

    // Get the student to find associated userId
    const student = await db.student.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!student) {
      return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 404 });
    }

    // Delete the student record
    await db.student.delete({ where: { id } });

    // Also delete the associated user account
    try {
      await db.user.delete({ where: { id: student.userId } });
    } catch {
      // User might already be deleted or have other relations, ignore
    }

    return NextResponse.json({ message: 'Siswa dihapus' });
  } catch (error) {
    console.error('Delete student error:', error);
    return NextResponse.json({ error: 'Gagal menghapus siswa' }, { status: 500 });
  }
}
