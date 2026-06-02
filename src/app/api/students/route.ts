import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole, hashPassword } from '@/lib/auth-utils';

function generateQRString(nisn: string): string {
  const salt = 'SCHOOL-ATTENDANCE-2024';
  const b64 = Buffer.from(nisn + salt).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `SCH-${nisn}-${b64.slice(0, 8)}`;
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA', 'SISWA', 'ORANG_TUA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('classId');
    const search = searchParams.get('search');
    const academicYearId = searchParams.get('academicYearId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: any = {};
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
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN', 'WALI_KELAS'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { nisn, name, classId, academicYearId, gender, qrCode, photoBase64, address, email, phone, status } = body;

    if (!nisn || !name || !classId || !academicYearId) {
      return NextResponse.json({ error: 'NISN, Nama, Kelas, dan Tahun Ajaran wajib diisi' }, { status: 400 });
    }

    // Auto-create User account for the student
    const username = `student_${nisn}`;
    const defaultPassword = nisn; // Use NISN as default password
    const hashedPw = hashPassword(defaultPassword);

    const user = await db.user.create({
      data: {
        username,
        password: hashedPw,
        name,
        role: 'SISWA',
      },
    });

    // Generate QR code if not provided
    const studentQrCode = qrCode || generateQRString(nisn);

    const student = await db.student.create({
      data: {
        nisn,
        name,
        classId,
        academicYearId,
        userId: user.id,
        qrCode: studentQrCode,
        gender: gender || null,
        photoBase64: photoBase64 || null,
        address: address || null,
        email: email || null,
        phone: phone || null,
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
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN', 'WALI_KELAS'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    // Filter out fields that shouldn't be updated directly
    const allowedFields = ['nisn', 'name', 'classId', 'academicYearId', 'gender', 'qrCode', 'photoBase64', 'address', 'email', 'phone', 'status', 'photoUrl', 'totalViolationPoints', 'totalGoodPoints', 'faceCaptureEnabled', 'idCardVisibleToStudent', 'idCardVisibleToParent'];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key];
      }
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
    if (!requireRole(auth.role, ['ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

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
