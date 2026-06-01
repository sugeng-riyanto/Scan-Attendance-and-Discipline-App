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
    const studentId = searchParams.get('studentId');
    const categoryId = searchParams.get('categoryId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const classId = searchParams.get('classId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (categoryId) where.categoryId = categoryId;
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      where.date = { gte: new Date(s.getFullYear(), s.getMonth(), s.getDate()), lt: new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1) };
    }
    if (classId && classId !== 'all') where.student = { classId };

    const [goodDeeds, total] = await Promise.all([
      db.goodDeed.findMany({
        where,
        include: {
          student: { include: { class: true } },
          category: true,
          recorder: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.goodDeed.count({ where }),
    ]);

    return NextResponse.json({ goodDeeds, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get good deeds error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data kebaikan' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { studentId, categoryId, points, description, date, recordedBy, scanMethod, teacherSignature, studentSignature } = body;

    if (!studentId || !categoryId || !date || !recordedBy) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const category = await db.goodDeedCategory.findUnique({ where: { id: categoryId } });
    const pointValue = points || category?.defaultPoints || 5;

    const goodDeed = await db.goodDeed.create({
      data: {
        studentId,
        categoryId,
        points: pointValue,
        description,
        date: new Date(date),
        recordedBy,
        scanMethod: scanMethod || 'MANUAL',
        teacherSignature,
        studentSignature,
      },
      include: {
        student: { include: { class: true } },
        category: true,
        recorder: { select: { name: true } },
      },
    });

    // Update student total good points
    await db.student.update({
      where: { id: studentId },
      data: { totalGoodPoints: { increment: pointValue } },
    });

    return NextResponse.json({ goodDeed }, { status: 201 });
  } catch (error) {
    console.error('Create good deed error:', error);
    return NextResponse.json({ error: 'Gagal mencatat kebaikan' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const goodDeed = await db.goodDeed.findUnique({ where: { id } });
    if (!goodDeed) return NextResponse.json({ error: 'Kebaikan tidak ditemukan' }, { status: 404 });

    await db.student.update({
      where: { id: goodDeed.studentId },
      data: { totalGoodPoints: { decrement: goodDeed.points } },
    });

    await db.goodDeed.delete({ where: { id } });
    return NextResponse.json({ message: 'Kebaikan dihapus' });
  } catch (error) {
    console.error('Delete good deed error:', error);
    return NextResponse.json({ error: 'Gagal menghapus kebaikan' }, { status: 500 });
  }
}
