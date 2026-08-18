import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';
import { getSchoolScope } from '@/lib/school-scope';

// Subscription audit history per school: who renewed/activated/deactivated a
// subscription and when. Built from the audit log (SUBSCRIPTION_* actions).
// Access: SUPER_ADMIN (any school) or the school's own Admin/Kepala Sekolah.

const SUBSCRIPTION_ACTIONS = ['SUBSCRIPTION_RENEW', 'SUBSCRIPTION_ACTIVATE', 'SUBSCRIPTION_DEACTIVATE', 'SUBSCRIPTION_UPDATE'];

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const schoolId = searchParams.get('schoolId');
    if (!schoolId) return NextResponse.json({ error: 'Parameter schoolId wajib' }, { status: 400 });

    const isSuperAdmin = auth.role === 'SUPER_ADMIN';
    if (!isSuperAdmin) {
      // School-bound Admin/Kepala Sekolah may only see their own school.
      if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH'])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const scope = await getSchoolScope(auth);
      if (scope.schoolId !== schoolId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, code: true, name: true } });
    if (!school) return NextResponse.json({ error: 'Sekolah tidak ditemukan' }, { status: 404 });

    // New rows carry schoolId; legacy rows only mention it in `details`.
    const entries = await db.auditLog.findMany({
      where: {
        action: { in: SUBSCRIPTION_ACTIONS },
        OR: [{ schoolId }, { details: { contains: schoolId } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, action: true, username: true, role: true, details: true, ip: true, createdAt: true,
      },
    });

    return NextResponse.json({ school, entries });
  } catch (error: any) {
    console.error('Subscription history error:', error);
    return NextResponse.json({ error: 'Gagal mengambil riwayat langganan: ' + error.message }, { status: 500 });
  }
}
