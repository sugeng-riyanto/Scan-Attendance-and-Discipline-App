import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

/**
 * Helper: combine a date string ("2024-01-15") with a time string ("07:00")
 * to produce a proper ISO DateTime string.
 */
function combineDateTime(dateStr: string, timeStr?: string): Date | null {
  if (!timeStr) return null;
  // Handle "HH:mm" or "HH:mm:ss" format
  const cleanTime = timeStr.trim();
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(cleanTime)) {
    return new Date(`${dateStr}T${cleanTime}:00`);
  }
  // If it's already a full ISO string, parse directly
  const parsed = new Date(timeStr);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'WALI_KELAS', 'VP_KESISWAAN', 'ORANG_TUA', 'SISWA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const studentId = searchParams.get('studentId');
    const type = searchParams.get('type');
    const classId = searchParams.get('classId');

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (studentId) where.studentId = studentId;
    if (type) where.type = type;

    const permissions = await db.permission.findMany({
      where,
      include: {
        student: { include: { class: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    // If classId filter requested, filter in-memory since Permission doesn't have classId directly
    let result = permissions;
    if (classId && classId !== 'all') {
      result = permissions.filter(p => p.student?.classId === classId);
    }

    return NextResponse.json({ permissions: result });
  } catch (error) {
    console.error('Get permissions error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data izin' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'WALI_KELAS', 'ORANG_TUA', 'SISWA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { studentId, type, reason, requestedBy, date, startTime, endTime, attachmentData, attachmentType, attachmentName } = body;

    if (!studentId || !type || !reason || !requestedBy || !date) {
      return NextResponse.json(
        { error: 'Data tidak lengkap: studentId, type, reason, requestedBy, date wajib diisi' },
        { status: 400 }
      );
    }

    // Validate student exists
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });
    if (!student) {
      return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 404 });
    }

    // Validate type
    const validTypes = ['LATE_ARRIVAL', 'EARLY_DEPARTURE', 'ABSENCE', 'SICK'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Jenis izin tidak valid' }, { status: 400 });
    }

    // Parse date and time properly
    const dateObj = new Date(date);
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 });
    }

    const startDateTime = combineDateTime(date, startTime);
    const endDateTime = combineDateTime(date, endTime);

    const permission = await db.permission.create({
      data: {
        studentId,
        type,
        reason,
        requestedBy,
        date: dateObj,
        startTime: startDateTime,
        endTime: endDateTime,
        status: 'PENDING',
        attachmentData,
        attachmentType,
        attachmentName,
      },
      include: { student: { include: { class: true } } },
    });

    return NextResponse.json({ permission }, { status: 201 });
  } catch (error: any) {
    console.error('Create permission error:', error);
    return NextResponse.json(
      { error: 'Gagal membuat permintaan izin', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'WALI_KELAS', 'VP_KESISWAAN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { id, status, approvedBy } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Data tidak lengkap: id dan status wajib' }, { status: 400 });
    }

    const validStatuses = ['APPROVED', 'REJECTED'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
    }

    const permission = await db.permission.update({
      where: { id },
      data: {
        status,
        approvedBy: status === 'APPROVED' ? approvedBy : undefined,
      },
      include: { student: { include: { class: true } } },
    });

    // If approved and it's an absence permission, create attendance record
    if (status === 'APPROVED' && permission.type === 'ABSENCE') {
      const d = new Date(permission.date);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

      const existing = await db.attendance.findFirst({
        where: { studentId: permission.studentId, date: { gte: dayStart, lt: dayEnd } },
      });

      if (!existing) {
        await db.attendance.create({
          data: {
            studentId: permission.studentId,
            date: dayStart,
            status: 'IZIN',
            checkInMethod: 'MANUAL',
            permissionId: permission.id,
            notes: `Izin: ${permission.reason}`,
          },
        });
      }
    }

    return NextResponse.json({ permission });
  } catch (error: any) {
    console.error('Update permission error:', error);
    return NextResponse.json(
      { error: 'Gagal mengupdate izin', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });
    }

    // Check if any attendance references this permission
    const existingAtt = await db.attendance.findFirst({
      where: { permissionId: id },
    });

    if (existingAtt) {
      // Remove the attendance link first
      await db.attendance.update({
        where: { id: existingAtt.id },
        data: { permissionId: null, notes: 'Izin dihapus' },
      });
    }

    await db.permission.delete({ where: { id } });

    return NextResponse.json({ message: 'Izin berhasil dihapus' });
  } catch (error: any) {
    console.error('Delete permission error:', error);
    return NextResponse.json(
      { error: 'Gagal menghapus izin', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
