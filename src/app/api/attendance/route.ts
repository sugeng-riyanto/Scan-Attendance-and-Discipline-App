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
    const date = searchParams.get('date');
    const classId = searchParams.get('classId');
    const status = searchParams.get('status');
    const studentId = searchParams.get('studentId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const where: any = {};

    if (date) {
      const d = new Date(date);
      where.date = { gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()), lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1) };
    } else if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      where.date = { gte: new Date(s.getFullYear(), s.getMonth(), s.getDate()), lt: new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1) };
    }

    if (classId && classId !== 'all') {
      where.student = { classId };
    }
    if (status && status !== 'all') where.status = status;
    if (studentId) where.studentId = studentId;

    const [attendances, total] = await Promise.all([
      db.attendance.findMany({
        where,
        include: {
          student: { include: { class: true } },
          permission: true,
        },
        orderBy: [{ date: 'desc' }, { checkInTime: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.attendance.count({ where }),
    ]);

    // Summary stats
    const hadir = attendances.filter(a => a.status === 'HADIR').length;
    const terlambat = attendances.filter(a => a.status === 'TERLAMBAT').length;
    const izin = attendances.filter(a => a.status === 'IZIN').length;
    const sakit = attendances.filter(a => a.status === 'SAKIT').length;
    const alpha = attendances.filter(a => a.status === 'ALPHA').length;

    return NextResponse.json({
      attendances,
      summary: { total, hadir, terlambat, izin, sakit, alpha },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data kehadiran' }, { status: 500 });
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
    const { studentId, date, status, checkInTime, checkOutTime, checkInMethod, checkOutMethod, notes, permissionId } = body;

    if (!studentId || !date || !status) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const d = new Date(date);
    const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

    // Check for existing record
    const existing = await db.attendance.findFirst({
      where: { studentId, date: { gte: dayStart, lt: dayEnd } },
    });

    if (existing) {
      return NextResponse.json({ error: 'Siswa sudah memiliki catatan kehadiran hari ini', attendance: existing }, { status: 409 });
    }

    const isLateArrival = status === 'TERLAMBAT';
    const attendance = await db.attendance.create({
      data: {
        studentId,
        date: dayStart,
        checkInTime: checkInTime ? new Date(checkInTime) : null,
        checkOutTime: checkOutTime ? new Date(checkOutTime) : null,
        status,
        checkInMethod,
        checkOutMethod,
        isLateArrival,
        isEarlyDeparture: false,
        permissionId: permissionId || null,
        verifiedByFace: checkInMethod === 'FACE',
        notes,
      },
      include: { student: { include: { class: true } } },
    });

    return NextResponse.json({ attendance }, { status: 201 });
  } catch (error) {
    console.error('Create attendance error:', error);
    return NextResponse.json({ error: 'Gagal membuat catatan kehadiran' }, { status: 500 });
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

    if (data.checkInTime) data.checkInTime = new Date(data.checkInTime);
    if (data.checkOutTime) data.checkOutTime = new Date(data.checkOutTime);

    const attendance = await db.attendance.update({
      where: { id },
      data,
      include: { student: { include: { class: true } } },
    });

    return NextResponse.json({ attendance });
  } catch (error) {
    console.error('Update attendance error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate kehadiran' }, { status: 500 });
  }
}
