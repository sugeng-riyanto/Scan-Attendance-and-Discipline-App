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
    const academicYears = await db.academicYear.findMany({
      include: {
        _count: { select: { classes: true, students: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    return NextResponse.json({ academicYears });
  } catch (error) {
    console.error('Get academic years error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data tahun ajaran' }, { status: 500 });
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
    const { name, startDate, endDate, isActive } = body;

    if (!name || !startDate || !endDate) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    // If setting as active, deactivate others
    if (isActive) {
      await db.academicYear.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    const academicYear = await db.academicYear.create({
      data: { name, startDate: new Date(startDate), endDate: new Date(endDate), isActive: isActive || false },
    });

    return NextResponse.json({ academicYear }, { status: 201 });
  } catch (error) {
    console.error('Create academic year error:', error);
    return NextResponse.json({ error: 'Gagal membuat tahun ajaran' }, { status: 500 });
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

    if (data.isActive) {
      await db.academicYear.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      });
    }

    if (data.startDate) data.startDate = new Date(data.startDate);
    if (data.endDate) data.endDate = new Date(data.endDate);

    const academicYear = await db.academicYear.update({ where: { id }, data });

    return NextResponse.json({ academicYear });
  } catch (error) {
    console.error('Update academic year error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate tahun ajaran' }, { status: 500 });
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

    // Check if academic year has associated classes or students
    const classCount = await db.class.count({ where: { academicYearId: id } });
    const studentCount = await db.student.count({ where: { academicYearId: id } });

    if (classCount > 0 || studentCount > 0) {
      return NextResponse.json(
        { error: `Tahun ajaran masih memiliki ${classCount} kelas dan ${studentCount} siswa. Hapus atau pindahkan data terlebih dahulu.` },
        { status: 400 }
      );
    }

    await db.academicYear.delete({ where: { id } });
    return NextResponse.json({ message: 'Tahun ajaran dihapus' });
  } catch (error) {
    console.error('Delete academic year error:', error);
    return NextResponse.json({ error: 'Gagal menghapus tahun ajaran' }, { status: 500 });
  }
}
