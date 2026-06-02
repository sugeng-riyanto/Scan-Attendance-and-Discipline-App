import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

const ROLES = ['VP_KESISWAAN'];

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = params;
    const body = await request.json();
    const { dayOfWeek, startTime, endTime, teacherId, location, tasks, isActive } = body;

    const data: any = {};
    if (dayOfWeek !== undefined) data.dayOfWeek = dayOfWeek;
    if (startTime !== undefined) data.startTime = startTime;
    if (endTime !== undefined) data.endTime = endTime;
    if (teacherId !== undefined) data.teacherId = teacherId;
    if (location !== undefined) data.location = location;
    if (tasks !== undefined) data.tasks = tasks;
    if (isActive !== undefined) data.isActive = isActive;

    const schedule = await db.dutySchedule.update({
      where: { id },
      data,
      include: {
        teacher: { select: { id: true, name: true, role: true } },
      },
    });

    return NextResponse.json({ schedule });
  } catch (error) {
    console.error('Update duty schedule error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui jadwal jaga' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id } = params;

    await db.dutySchedule.delete({ where: { id } });
    return NextResponse.json({ message: 'Jadwal jaga dihapus' });
  } catch (error) {
    console.error('Delete duty schedule error:', error);
    return NextResponse.json({ error: 'Gagal menghapus jadwal jaga' }, { status: 500 });
  }
}
