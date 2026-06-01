import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { determineCheckInStatus, isLate } from '@/lib/attendance-utils';
import { validateGeolocation } from '@/lib/geo-utils';

export async function POST(request: NextRequest) {
  try {
    const { qrCode, method, latitude, longitude, accuracy, deviceInfo } = await request.json();

    if (!qrCode) {
      return NextResponse.json({ error: 'QR Code diperlukan' }, { status: 400 });
    }

    // Find student by QR code
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

    // Check for existing attendance today (deduplication)
    const existing = await db.attendance.findFirst({
      where: {
        studentId: student.id,
        date: { gte: todayStart, lt: todayEnd },
      },
    });

    if (existing && existing.checkInTime) {
      return NextResponse.json({
        error: 'Siswa sudah melakukan check-in hari ini',
        student,
        attendance: existing,
        alreadyCheckedIn: true,
      }, { status: 409 });
    }

    // Geolocation validation
    const geofence = await db.geofenceConfig.findFirst({
      where: { isActive: true, isDefault: true },
    });

    const geoLocation = (latitude != null && longitude != null)
      ? { lat: latitude, lng: longitude, accuracy: accuracy || undefined }
      : null;

    const geoResult = validateGeolocation(geoLocation, geofence, {
      maxAccuracy: 100,
      requireGeolocation: false, // School cameras may not have GPS; personal devices should
    });

    // If geo validation fails and location was provided, return error
    if (!geoResult.valid && geoLocation) {
      return NextResponse.json({
        error: geoResult.reason,
        geoValidation: geoResult,
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name },
      }, { status: 403 });
    }

    // Check for approved late arrival permission
    const latePermission = await db.permission.findFirst({
      where: {
        studentId: student.id,
        type: 'LATE_ARRIVAL',
        status: 'APPROVED',
        date: { gte: todayStart, lt: todayEnd },
      },
    });

    const checkInTime = now;
    let status = determineCheckInStatus(checkInTime);
    const late = isLate(checkInTime);

    // If late but has permission, mark as IZIN
    if (late && latePermission) {
      status = 'IZIN';
    }

    // Create or update attendance record
    const attendance = existing
      ? await db.attendance.update({
          where: { id: existing.id },
          data: {
            checkInTime,
            status,
            checkInMethod: method || 'QR',
            isLateArrival: late && !latePermission,
            verifiedByFace: method === 'FACE',
            permissionId: latePermission?.id,
            checkInLat: latitude ?? null,
            checkInLng: longitude ?? null,
            checkInAccuracy: accuracy ?? null,
            geoVerified: geoResult.valid,
            deviceInfo: deviceInfo || null,
          },
          include: { student: { include: { class: true } } },
        })
      : await db.attendance.create({
          data: {
            studentId: student.id,
            date: todayStart,
            checkInTime,
            status,
            checkInMethod: method || 'QR',
            isLateArrival: late && !latePermission,
            verifiedByFace: method === 'FACE',
            permissionId: latePermission?.id,
            checkInLat: latitude ?? null,
            checkInLng: longitude ?? null,
            checkInAccuracy: accuracy ?? null,
            geoVerified: geoResult.valid,
            deviceInfo: deviceInfo || null,
          },
          include: { student: { include: { class: true } } },
        });

    return NextResponse.json({
      message: 'Check-in berhasil',
      student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name, level: student.class.level },
      attendance,
      status,
      isLate: late && !latePermission,
      hasPermission: !!latePermission,
      geoValidation: geoResult,
    }, { status: 201 });
  } catch (error) {
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Gagal melakukan check-in' }, { status: 500 });
  }
}
