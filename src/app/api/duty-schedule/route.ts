import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'GURU_JAGA', 'KEPALA_SEKOLAH'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const userId = searchParams.get('userId');

    const where: any = {};
    if (date) {
      const d = new Date(date);
      where.date = {
        gte: new Date(d.getFullYear(), d.getMonth(), d.getDate()),
        lt: new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1),
      };
    }
    if (userId) where.userId = userId;

    const schedules = await db.dutySchedule.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, role: true } },
        class: { select: { id: true, name: true, level: true } },
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({ schedules });
  } catch (error) {
    console.error('Get duty schedules error:', error);
    return NextResponse.json({ error: 'Gagal mengambil jadwal jaga' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'GURU_JAGA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { userId, date, shift, classId, notes } = await request.json();

    if (!userId || !date || !shift) {
      return NextResponse.json({ error: 'User, tanggal, dan shift diperlukan' }, { status: 400 });
    }

    const validShifts = ['PAGI', 'SORE', 'FULL_DAY'];
    if (!validShifts.includes(shift)) {
      return NextResponse.json({ error: 'Shift tidak valid' }, { status: 400 });
    }

    const schedule = await db.dutySchedule.create({
      data: {
        userId,
        date: new Date(date),
        shift,
        classId: classId || null,
        notes: notes || null,
      },
      include: {
        user: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ schedule });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Jadwal jaga sudah ada untuk user, tanggal, dan shift ini' }, { status: 409 });
    }
    console.error('Create duty schedule error:', error);
    return NextResponse.json({ error: 'Gagal membuat jadwal jaga' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'GURU_JAGA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id, userId, date, shift, classId, notes } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'ID jadwal diperlukan' }, { status: 400 });
    }

    const schedule = await db.dutySchedule.update({
      where: { id },
      data: {
        ...(userId && { userId }),
        ...(date && { date: new Date(date) }),
        ...(shift && { shift }),
        classId: classId || null,
        notes: notes || null,
      },
      include: {
        user: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error('Update duty schedule error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui jadwal jaga' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'GURU_JAGA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID jadwal diperlukan' }, { status: 400 });
    }

    await db.dutySchedule.delete({ where: { id } });
    return NextResponse.json({ message: 'Jadwal jaga dihapus' });
  } catch (error) {
    console.error('Delete duty schedule error:', error);
    return NextResponse.json({ error: 'Gagal menghapus jadwal jaga' }, { status: 500 });
  }
}
