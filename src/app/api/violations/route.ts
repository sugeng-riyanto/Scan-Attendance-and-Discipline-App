import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getBehaviorLevel } from '@/lib/attendance-utils';
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

    const [violations, total] = await Promise.all([
      db.violation.findMany({
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
      db.violation.count({ where }),
    ]);

    return NextResponse.json({ violations, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get violations error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data pelanggaran' }, { status: 500 });
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

    // Get category for default points
    const category = await db.violationCategory.findUnique({ where: { id: categoryId } });
    const pointValue = points || category?.defaultPoints || 5;

    const violation = await db.violation.create({
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

    // Update student total violation points
    const student = await db.student.findUnique({ where: { id: studentId } });
    if (student) {
      const newTotal = student.totalViolationPoints + pointValue;
      await db.student.update({
        where: { id: studentId },
        data: { totalViolationPoints: newTotal },
      });

      // Check for escalation
      const prevLevel = getBehaviorLevel(student.totalViolationPoints);
      const newLevel = getBehaviorLevel(newTotal);

      if (newLevel.level > prevLevel.level) {
        const alertTargets: { alertType: string; targetRole: string }[] = [];
        if (newTotal > 150) {
          alertTargets.push({ alertType: 'LEVEL_4', targetRole: 'ORANG_TUA' });
        } else if (newTotal > 100) {
          alertTargets.push({ alertType: 'LEVEL_3', targetRole: 'KEPALA_SEKOLAH' });
        } else if (newTotal > 50) {
          alertTargets.push({ alertType: 'LEVEL_2', targetRole: 'VP_KESISWAAN' });
        }

        for (const at of alertTargets) {
          await db.behaviorAlert.create({
            data: {
              studentId,
              alertType: at.alertType,
              message: `${student.name} telah melampaui ${newTotal > 150 ? 150 : newTotal > 100 ? 100 : 50} poin pelanggaran (total: ${newTotal}). ${newLevel.handler} perlu menindaklanjuti.`,
              threshold: newTotal > 150 ? 150 : newTotal > 100 ? 100 : 50,
              targetRole: at.targetRole,
            },
          });
        }
      }
    }

    return NextResponse.json({ violation }, { status: 201 });
  } catch (error) {
    console.error('Create violation error:', error);
    return NextResponse.json({ error: 'Gagal mencatat pelanggaran' }, { status: 500 });
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

    const violation = await db.violation.findUnique({ where: { id } });
    if (!violation) return NextResponse.json({ error: 'Pelanggaran tidak ditemukan' }, { status: 404 });

    // Reduce student points
    await db.student.update({
      where: { id: violation.studentId },
      data: { totalViolationPoints: { decrement: violation.points } },
    });

    await db.violation.delete({ where: { id } });
    return NextResponse.json({ message: 'Pelanggaran dihapus' });
  } catch (error) {
    console.error('Delete violation error:', error);
    return NextResponse.json({ error: 'Gagal menghapus pelanggaran' }, { status: 500 });
  }
}
