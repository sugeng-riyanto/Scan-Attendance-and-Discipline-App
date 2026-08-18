import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';
import { getSchoolScope } from '@/lib/school-scope';
import { AUDIT_SOLUTIONS, AUDIT_CATEGORY_LABELS } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // Admin & Kepala Sekolah monitor users (JHS dan SHS) — per UU PDP / T&C.
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level') || 'ALL'; // JHS | SHS | ALL
    const category = searchParams.get('category') || 'ALL';
    const severity = searchParams.get('severity') || 'ALL'; // INFO | WARNING | CRITICAL | ALL
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const username = (searchParams.get('username') || '').trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

    const scope = await getSchoolScope(auth);
    const where: any = {};
    // School-scoping: non-super-admins only see their own school's audit logs.
    if (!scope.isSuperAdmin && scope.schoolId) {
      where.schoolId = scope.schoolId;
    } else if (!scope.isSuperAdmin) {
      where.id = '__no_match__';
    }
    if (level !== 'ALL') where.level = level;
    if (category !== 'ALL') where.category = category;
    if (severity !== 'ALL') where.severity = severity;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(new Date(dateTo).getTime() + 864e5);
    }
    if (username) where.username = { contains: username, mode: 'insensitive' };

    const [logs, counts] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          action: true,
          category: true,
          level: true,
          severity: true,
          details: true,
          username: true,
          role: true,
          ip: true,
          createdAt: true,
        },
      }),
      db.auditLog.groupBy({ by: ['severity'], _count: { _all: true }, where: { level: level !== 'ALL' ? level : undefined } }),
    ]);

    return NextResponse.json({
      logs,
      counts: { CRITICAL: 0, WARNING: 0, INFO: 0, ...Object.fromEntries(counts.map((c) => [c.severity, c._count._all])) },
      solutions: AUDIT_SOLUTIONS,
      categoryLabels: AUDIT_CATEGORY_LABELS,
    });
  } catch (error) {
    console.error('Audit logs error:', error);
    return NextResponse.json({ error: 'Gagal mengambil log aktivitas' }, { status: 500 });
  }
}

// Endpoint untuk melaporkan insiden kebocoran data (runbook exit solution).
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { description, level } = body;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    const entry = await db.auditLog.create({
      data: {
        action: 'BREACH_REPORTED',
        category: 'BREACH',
        severity: 'CRITICAL',
        level: level === 'SHS' ? 'SHS' : level === 'JHS' ? 'JHS' : null,
        details: (description || '').slice(0, 2000) || 'Insiden kebocoran data dilaporkan',
        userId: auth.userId,
        username: auth.username,
        role: auth.role,
        ip,
      },
    });

    // Also push an alert-style socket event so open dashboards can react.
    const { emitSocketEvent } = await import('@/lib/socket-server');
    emitSocketEvent('alert:new', {
      alertType: 'BREACH',
      message: `Insiden kebocoran data dilaporkan oleh ${auth.username}`,
      targetRole: 'ADMIN',
    });

    return NextResponse.json({ message: 'Insiden kebocoran data dilaporkan', entry });
  } catch (error) {
    console.error('Breach report error:', error);
    return NextResponse.json({ error: 'Gagal melaporkan insiden' }, { status: 500 });
  }
}
