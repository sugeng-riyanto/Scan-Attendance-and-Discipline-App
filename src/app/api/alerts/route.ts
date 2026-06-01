import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'SISWA', 'ORANG_TUA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const targetRole = searchParams.get('targetRole');

    const where: any = {};
    if (targetRole) where.targetRole = targetRole;
    if (isRead !== null && isRead !== undefined && isRead !== '') where.isRead = isRead === 'true';

    const alerts = await db.behaviorAlert.findMany({
      where,
      include: {
        student: { include: { class: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('Get alerts error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data peringatan' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'SISWA', 'ORANG_TUA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { id, isRead } = body;

    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const alert = await db.behaviorAlert.update({
      where: { id },
      data: { isRead: isRead !== undefined ? isRead : true },
    });

    return NextResponse.json({ alert });
  } catch (error) {
    console.error('Update alert error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate peringatan' }, { status: 500 });
  }
}
