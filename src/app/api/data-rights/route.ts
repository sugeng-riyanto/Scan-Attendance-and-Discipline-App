import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';
import { getSchoolScope } from '@/lib/school-scope';
import { logAudit } from '@/lib/audit';

// GET: List data rights requests (Admin sees their school's, user sees own)
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'ALL';
    const type = searchParams.get('type') || 'ALL';

    const where: any = {};

    // School admins see their school's requests; users see only their own
    if (requireRole(auth.role, ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH'])) {
      const scope = await getSchoolScope(auth);
      if (!scope.isSuperAdmin && scope.schoolId) {
        where.schoolId = scope.schoolId;
      }
    } else {
      where.userId = auth.userId;
    }

    if (status !== 'ALL') where.status = status;
    if (type !== 'ALL') where.type = type;

    const requests = await db.dataRightsRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, username: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('Data rights GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch data rights requests' }, { status: 500 });
  }
}

// POST: Create a data rights request
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { type, details } = body;

    if (!type || !['EXPORT', 'CORRECTION', 'DELETION'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
    }

    const scope = await getSchoolScope(auth);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    const dataRequest = await db.dataRightsRequest.create({
      data: {
        userId: auth.userId,
        schoolId: scope.schoolId || null,
        type,
        details: details?.slice(0, 2000) || null,
      },
    });

    // Log the request
    await logAudit({
      action: `DATA_RIGHTS_${type}`,
      category: 'ACCOUNT',
      severity: type === 'DELETION' ? 'WARNING' : 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      schoolId: scope.schoolId || null,
      details: `Data rights request: ${type}${details ? ` — ${details.slice(0, 100)}` : ''}`,
    });

    // Notify admin via socket
    const { emitSocketEvent } = await import('@/lib/socket-server');
    emitSocketEvent('alert:new', {
      alertType: 'DATA_RIGHTS',
      message: `New data rights request (${type}) from ${auth.username}`,
      targetRole: 'ADMIN',
    });

    return NextResponse.json({ request: dataRequest, message: 'Request submitted successfully' });
  } catch (error) {
    console.error('Data rights POST error:', error);
    return NextResponse.json({ error: 'Failed to submit request' }, { status: 500 });
  }
}

// PUT: Update request status (Admin only)
export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!requireRole(auth.role, ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status, adminNotes } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'ID and status required' }, { status: 400 });
    }

    if (!['APPROVED', 'REJECTED', 'COMPLETED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    const scope = await getSchoolScope(auth);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    // Verify the request belongs to this school (unless super admin)
    const existing = await db.dataRightsRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (!scope.isSuperAdmin && existing.schoolId !== scope.schoolId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updated = await db.dataRightsRequest.update({
      where: { id },
      data: {
        status,
        adminNotes: adminNotes?.slice(0, 2000) || null,
        processedBy: auth.username,
        processedAt: new Date(),
      },
    });

    // Log the action
    await logAudit({
      action: `DATA_RIGHTS_${status}`,
      category: 'ACCOUNT',
      severity: status === 'REJECTED' ? 'WARNING' : 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      ip,
      schoolId: scope.schoolId || null,
      details: `Data rights request ${status}: ${existing.type} by ${existing.userId}${adminNotes ? ` — ${adminNotes.slice(0, 100)}` : ''}`,
    });

    return NextResponse.json({ request: updated, message: `Request ${status.toLowerCase()}` });
  } catch (error) {
    console.error('Data rights PUT error:', error);
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 });
  }
}
