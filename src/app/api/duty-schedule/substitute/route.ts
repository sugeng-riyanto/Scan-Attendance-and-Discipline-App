import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

const ROLES = ['VP_KESISWAAN'];

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { dutyScheduleId, substituteTeacherId, originalTeacherId, substituteDate, reason } = await request.json();

    if (!dutyScheduleId || !substituteTeacherId || !originalTeacherId || !substituteDate) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    const substitute = await db.dutySubstitute.create({
      data: {
        dutyScheduleId,
        substituteTeacherId,
        originalTeacherId,
        substituteDate: new Date(substituteDate),
        reason: reason || null,
      },
      include: {
        dutySchedule: true,
        substituteTeacher: { select: { id: true, name: true } },
        originalTeacher: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ substitute }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Penggantian sudah ada untuk jadwal dan tanggal ini' }, { status: 409 });
    }
    console.error('Create substitute error:', error);
    return NextResponse.json({ error: 'Gagal membuat penggantian jaga' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID penggantian diperlukan' }, { status: 400 });
    }

    await db.dutySubstitute.delete({ where: { id } });
    return NextResponse.json({ message: 'Penggantian jaga dihapus' });
  } catch (error) {
    console.error('Delete substitute error:', error);
    return NextResponse.json({ error: 'Gagal menghapus penggantian jaga' }, { status: 500 });
  }
}
