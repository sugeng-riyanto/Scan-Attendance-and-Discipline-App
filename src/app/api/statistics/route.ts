import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA', 'ORANG_TUA', 'SISWA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'monthly'; // daily, weekly, monthly
    const classId = searchParams.get('classId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const now = new Date();
    let start: Date;
    let end: Date;

    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else {
      switch (period) {
        case 'daily':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
          break;
        case 'weekly':
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          end = now;
          break;
        case 'monthly':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case '3months':
          start = new Date(now);
          start.setDate(start.getDate() - 90);
          end = now;
          break;
        case '4months':
          start = new Date(now);
          start.setDate(start.getDate() - 120);
          end = now;
          break;
        case '1semester':
          start = new Date(now);
          start.setDate(start.getDate() - 180);
          end = now;
          break;
        case '1year':
        default:
          start = new Date(now);
          start.setDate(start.getDate() - 365);
          end = now;
          break;
      }
    }

    const studentWhere: any = {};
    if (classId && classId !== 'all') studentWhere.classId = classId;

    // Attendance statistics
    const attendances = await db.attendance.findMany({
      where: {
        date: { gte: start, lt: end },
        student: studentWhere,
      },
      include: {
        student: { include: { class: true } },
      },
    });

    const totalStudents = await db.student.count({ where: studentWhere });

    // Status distribution
    const statusDist = {
      HADIR: attendances.filter(a => a.status === 'HADIR').length,
      TERLAMBAT: attendances.filter(a => a.status === 'TERLAMBAT').length,
      IZIN: attendances.filter(a => a.status === 'IZIN').length,
      SAKIT: attendances.filter(a => a.status === 'SAKIT').length,
      ALPHA: attendances.filter(a => a.status === 'ALPHA').length,
    };

    // Daily attendance counts for time series
    const dailyData: Record<string, { hadir: number; terlambat: number; izin: number; sakit: number; alpha: number }> = {};
    for (const a of attendances) {
      const day = a.date.toISOString().split('T')[0];
      if (!dailyData[day]) dailyData[day] = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
      const key = a.status.toLowerCase() as 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpha';
      if (key in dailyData[day]) dailyData[day][key]++;
    }

    const timeSeriesData = Object.entries(dailyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));

    // Class comparison
    const classes = await db.class.findMany({
      include: { _count: { select: { students: true } } },
    });

    const classComparison = await Promise.all(
      classes.map(async (cls) => {
        const clsAttendances = attendances.filter(a => a.student?.classId === cls.id);
        return {
          className: cls.name,
          level: cls.level,
          total: clsAttendances.length,
          hadir: clsAttendances.filter(a => a.status === 'HADIR').length,
          terlambat: clsAttendances.filter(a => a.status === 'TERLAMBAT').length,
          alpha: clsAttendances.filter(a => a.status === 'ALPHA').length,
          percentage: clsAttendances.length > 0
            ? Math.round((clsAttendances.filter(a => a.status === 'HADIR' || a.status === 'TERLAMBAT').length / clsAttendances.length) * 100)
            : 0,
        };
      })
    );

    // Top violators
    const topViolators = await db.student.findMany({
      where: { totalViolationPoints: { gt: 0 }, ...studentWhere },
      include: { class: true },
      orderBy: { totalViolationPoints: 'desc' },
      take: 10,
    });

    // Top good students
    const topGoodStudents = await db.student.findMany({
      where: { totalGoodPoints: { gt: 0 }, ...studentWhere },
      include: { class: true },
      orderBy: { totalGoodPoints: 'desc' },
      take: 10,
    });

    // Violation category distribution
    const violations = await db.violation.findMany({
      where: {
        date: { gte: start, lt: end },
        student: studentWhere,
      },
      include: { category: true },
    });

    const violationByCategory: Record<string, { name: string; count: number; points: number }> = {};
    for (const v of violations) {
      const catName = v.category?.name || 'Lainnya';
      if (!violationByCategory[v.categoryId]) {
        violationByCategory[v.categoryId] = { name: catName, count: 0, points: 0 };
      }
      violationByCategory[v.categoryId].count++;
      violationByCategory[v.categoryId].points += v.points;
    }

    // Good deed category distribution
    const goodDeeds = await db.goodDeed.findMany({
      where: {
        date: { gte: start, lt: end },
        student: studentWhere,
      },
      include: { category: true },
    });

    const goodDeedByCategory: Record<string, { name: string; count: number; points: number }> = {};
    for (const g of goodDeeds) {
      const catName = g.category?.name || 'Lainnya';
      if (!goodDeedByCategory[g.categoryId]) {
        goodDeedByCategory[g.categoryId] = { name: catName, count: 0, points: 0 };
      }
      goodDeedByCategory[g.categoryId].count++;
      goodDeedByCategory[g.categoryId].points += g.points;
    }

    // Behavior point trend (for top violators)
    const behaviorTrend: Record<string, { name: string; data: { date: string; violationPoints: number; goodPoints: number }[] }> = {};
    for (const v of violations) {
      const sName = v.studentId;
      if (!behaviorTrend[sName]) behaviorTrend[sName] = { name: '', data: [] };
    }

    // Overall summary
    const totalViolationPoints = violations.reduce((sum, v) => sum + v.points, 0);
    const totalGoodPoints = goodDeeds.reduce((sum, g) => sum + g.points, 0);

    const attendancePercentage = attendances.length > 0
      ? Math.round(((statusDist.HADIR + statusDist.TERLAMBAT) / attendances.length) * 100)
      : 0;

    return NextResponse.json({
      period,
      dateRange: { start: start.toISOString(), end: end.toISOString() },
      totalStudents,
      totalAttendanceRecords: attendances.length,
      attendancePercentage,
      statusDistribution: statusDist,
      timeSeriesData,
      classComparison,
      topViolators: topViolators.map(s => ({
        id: s.id,
        name: s.name,
        nisn: s.nisn,
        className: s.class.name,
        violationPoints: s.totalViolationPoints,
        goodPoints: s.totalGoodPoints,
      })),
      topGoodStudents: topGoodStudents.map(s => ({
        id: s.id,
        name: s.name,
        nisn: s.nisn,
        className: s.class.name,
        goodPoints: s.totalGoodPoints,
      })),
      violationByCategory: Object.values(violationByCategory),
      goodDeedByCategory: Object.values(goodDeedByCategory),
      totalViolationPoints,
      totalGoodPoints,
      totalViolations: violations.length,
      totalGoodDeeds: goodDeeds.length,
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data statistik' }, { status: 500 });
  }
}
