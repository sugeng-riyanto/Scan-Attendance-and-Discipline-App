import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exportToXLSX, createAttendanceExport, createViolationExport, createGoodDeedExport } from '@/lib/export-utils';
import { getAuthUser, requireRole } from '@/lib/auth-utils';
import { getSchoolScope } from '@/lib/school-scope';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'attendance'; // attendance, violations, good-deeds
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const classId = searchParams.get('classId');
    const format = searchParams.get('format') || 'xlsx';

    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Per-school isolation: exports only cover this school's data.
    const scope = await getSchoolScope(auth);
    const studentWhere: any = { ...scope.schoolWhere };
    if (classId && classId !== 'all') studentWhere.classId = classId;

    let buffer: Buffer;
    let filename: string;

    switch (type) {
      case 'violations': {
        const violations = await db.violation.findMany({
          where: {
            date: { gte: start, lt: end },
            student: studentWhere,
          },
          include: {
            student: { include: { class: true } },
            category: true,
            recorder: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
        });
        const { data, columns } = createViolationExport(violations);
        buffer = exportToXLSX(data, columns, 'Pelanggaran');
        filename = `pelanggaran_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.xlsx`;
        break;
      }

      case 'good-deeds': {
        const goodDeeds = await db.goodDeed.findMany({
          where: {
            date: { gte: start, lt: end },
            student: studentWhere,
          },
          include: {
            student: { include: { class: true } },
            category: true,
            recorder: { select: { name: true } },
          },
          orderBy: { date: 'desc' },
        });
        const { data, columns } = createGoodDeedExport(goodDeeds);
        buffer = exportToXLSX(data, columns, 'Kebaikan');
        filename = `kebaikan_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.xlsx`;
        break;
      }

      default: {
        const attendances = await db.attendance.findMany({
          where: {
            date: { gte: start, lt: end },
            student: studentWhere,
          },
          include: {
            student: { include: { class: true } },
          },
          orderBy: { date: 'desc' },
        });
        const { data, columns } = createAttendanceExport(attendances);
        buffer = exportToXLSX(data, columns, 'Kehadiran');
        filename = `kehadiran_${start.toISOString().split('T')[0]}_${end.toISOString().split('T')[0]}.xlsx`;
        break;
      }
    }

    await logAudit({ action: 'EXPORT', category: 'EXPORT', severity: 'INFO', userId: auth.userId, username: auth.username, role: auth.role, details: `Ekspor ${type} (${startDate || 'awal bulan'} s.d. ${endDate || 'sekarang'})` });

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Gagal mengekspor data' }, { status: 500 });
  }
}
