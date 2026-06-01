import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isEarlyDeparture } from '@/lib/attendance-utils';
import { validateGeolocation } from '@/lib/geo-utils';

export async function POST(request: NextRequest) {
  try {
    const { qrCode, method, latitude, longitude, accuracy, deviceInfo } = await request.json();

    if (!qrCode) {
      return NextResponse.json({ error: 'QR Code diperlukan' }, { status: 400 });
    }

    const student = await db.student.findUnique({
      where: { qrCode },
      include: { class: true },
    });

    if (!student) {
      return NextResponse.json({ error: 'Siswa tidak ditemukan' }, { status: 404 });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const existing = await db.attendance.findFirst({
      where: {
        studentId: student.id,
        date: { gte: todayStart, lt: todayEnd },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Siswa belum melakukan check-in hari ini' }, { status: 400 });
    }

    if (existing.checkOutTime) {
      return NextResponse.json({
        error: 'Siswa sudah melakukan check-out hari ini',
        student: { name: student.name, className: student.class.name },
        attendance: existing,
        alreadyCheckedOut: true,
      }, { status: 409 });
    }

    // Geolocation validation for checkout
    const geofence = await db.geofenceConfig.findFirst({
      where: { isActive: true, isDefault: true },
    });

    const geoLocation = (latitude != null && longitude != null)
      ? { lat: latitude, lng: longitude, accuracy: accuracy || undefined }
      : null;

    const geoResult = validateGeolocation(geoLocation, geofence, {
      maxAccuracy: 100,
      requireGeolocation: false,
    });

    if (!geoResult.valid && geoLocation) {
      return NextResponse.json({
        error: geoResult.reason,
        geoValidation: geoResult,
      }, { status: 403 });
    }

    // Check for early departure permission
    const earlyPermission = await db.permission.findFirst({
      where: {
        studentId: student.id,
        type: 'EARLY_DEPARTURE',
        status: 'APPROVED',
        date: { gte: todayStart, lt: todayEnd },
      },
    });

    const level = student.class.level as 'SMP' | 'SMA';
    const early = isEarlyDeparture(now, level);

    const attendance = await db.attendance.update({
      where: { id: existing.id },
      data: {
        checkOutTime: now,
        checkOutMethod: method || 'QR',
        isEarlyDeparture: early && !earlyPermission,
        permissionId: earlyPermission?.id || existing.permissionId,
        checkOutLat: latitude ?? null,
        checkOutLng: longitude ?? null,
        checkOutAccuracy: accuracy ?? null,
        geoVerified: existing.geoVerified && geoResult.valid,
        deviceInfo: deviceInfo ? `${existing.deviceInfo || ''}; checkout: ${deviceInfo}` : existing.deviceInfo,
      },
      include: { student: { include: { class: true } } },
    });

    return NextResponse.json({
      message: 'Check-out berhasil',
      student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name, level },
      attendance,
      isEarlyDeparture: early && !earlyPermission,
      hasPermission: !!earlyPermission,
      geoValidation: geoResult,
    });
  } catch (error) {
    console.error('Check-out error:', error);
    return NextResponse.json({ error: 'Gagal melakukan check-out' }, { status: 500 });
  }
}
