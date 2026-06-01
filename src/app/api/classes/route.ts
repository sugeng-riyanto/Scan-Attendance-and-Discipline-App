import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA', 'SISWA', 'ORANG_TUA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const academicYearId = searchParams.get('academicYearId');

    const where: any = {};
    if (academicYearId) where.academicYearId = academicYearId;

    const classes = await db.class.findMany({
      where,
      include: {
        homeroomTeacher: { select: { id: true, name: true } },
        academicYear: { select: { name: true, isActive: true } },
        _count: { select: { students: true } },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ classes });
  } catch (error) {
    console.error('Get classes error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data kelas' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { name, level, academicYearId, homeroomTeacherId } = body;

    if (!name || !level || !academicYearId) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const cls = await db.class.create({
      data: { name, level, academicYearId, homeroomTeacherId: homeroomTeacherId || null },
      include: { homeroomTeacher: { select: { name: true } }, academicYear: { select: { name: true } } },
    });

    return NextResponse.json({ cls }, { status: 201 });
  } catch (error) {
    console.error('Create class error:', error);
    return NextResponse.json({ error: 'Gagal membuat kelas' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { id, ...data } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    // Handle empty homeroomTeacherId (set to null instead of empty string)
    if (data.homeroomTeacherId === '') {
      data.homeroomTeacherId = null;
    }

    const cls = await db.class.update({
      where: { id },
      data,
      include: { homeroomTeacher: { select: { name: true } } },
    });

    return NextResponse.json({ cls });
  } catch (error) {
    console.error('Update class error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate kelas' }, { status: 500 });
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

    // Check if class has students
    const studentCount = await db.student.count({ where: { classId: id } });
    if (studentCount > 0) {
      return NextResponse.json(
        { error: `Kelas masih memiliki ${studentCount} siswa. Pindahkan siswa terlebih dahulu.` },
        { status: 400 }
      );
    }

    await db.class.delete({ where: { id } });
    return NextResponse.json({ message: 'Kelas dihapus' });
  } catch (error) {
    console.error('Delete class error:', error);
    return NextResponse.json({ error: 'Gagal menghapus kelas' }, { status: 500 });
  }
}
