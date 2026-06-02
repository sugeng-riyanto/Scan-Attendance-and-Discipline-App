import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

const GET_ROLES = ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'];
const POST_ROLES = ['VP_KESISWAAN'];

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, GET_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const dayOfWeek = searchParams.get('dayOfWeek');
    const teacherId = searchParams.get('teacherId');

    const where: any = { isActive: true };
    if (dayOfWeek) where.dayOfWeek = parseInt(dayOfWeek);
    if (teacherId) where.teacherId = teacherId;

    const schedules = await db.dutySchedule.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true, role: true } },
        substitutes: {
          include: {
            substituteTeacher: { select: { id: true, name: true } },
            originalTeacher: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
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
    if (!requireRole(auth.role, POST_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { dayOfWeek, startTime, endTime, teacherId, location, tasks } = await request.json();

    if (dayOfWeek === undefined || !startTime || !endTime || !teacherId || !location) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    if (dayOfWeek < 1 || dayOfWeek > 7) {
      return NextResponse.json({ error: 'Hari tidak valid (1-7)' }, { status: 400 });
    }

    const schedule = await db.dutySchedule.create({
      data: {
        dayOfWeek,
        startTime,
        endTime,
        teacherId,
        location,
        tasks: tasks || [],
      },
      include: {
        teacher: { select: { id: true, name: true, role: true } },
      },
    });

    return NextResponse.json({ schedule }, { status: 201 });
  } catch (error) {
    console.error('Create duty schedule error:', error);
    return NextResponse.json({ error: 'Gagal membuat jadwal jaga' }, { status: 500 });
  }
}
