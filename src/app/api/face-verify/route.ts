import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

// Euclidean distance between two 128-dim vectors
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Mode 1: Verify specific student (nisn or studentId provided) using descriptor
// Mode 2: Auto-detect/search face (no studentId, search all references) using descriptor
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { descriptor, nisn, studentId, autoDetect, capturedPhoto, latitude, longitude, accuracy } = body;

    // If descriptor is provided, use descriptor-based matching (fast, local math)
    if (descriptor && Array.isArray(descriptor) && descriptor.length === 128) {
      return handleDescriptorMatch(descriptor, { nisn, studentId, autoDetect, latitude, longitude, accuracy });
    }

    // Fallback: if no descriptor but capturedPhoto provided, return error asking for descriptor
    // (The old AI-based approach is too slow and unreliable)
    if (capturedPhoto) {
      return NextResponse.json({
        match: false,
        found: false,
        confidence: 0,
        message: 'Verifikasi wajah memerlukan descriptor. Pastikan model face-api.js sudah dimuat di browser.',
      });
    }

    return NextResponse.json({ error: 'Face descriptor diperlukan (128 dimensi)' }, { status: 400 });
  } catch (error) {
    console.error('Face verify error:', error);
    return NextResponse.json({ error: 'Gagal verifikasi wajah' }, { status: 500 });
  }
}

async function handleDescriptorMatch(
  descriptor: number[],
  options: { nisn?: string; studentId?: string; autoDetect?: boolean; latitude?: number; longitude?: number; accuracy?: number }
) {
  const { nisn, studentId, autoDetect } = options;

  // Get all active face references with descriptors
  const references = await db.faceReference.findMany({
    where: {
      isActive: true,
      faceDescriptor: { not: null },
    },
    include: {
      student: {
        include: {
          class: true,
          user: true,
        },
      },
    },
  });

  if (references.length === 0) {
    return NextResponse.json({
      match: false,
      found: false,
      confidence: 0,
      message: 'Belum ada referensi wajah yang tersimpan dengan descriptor. Capture wajah siswa terlebih dahulu.',
      isAutoDetected: !nisn && !studentId,
    });
  }

  // If NISN or studentId provided, only compare against that student's references
  let targetRefs = references;
  if (studentId) {
    targetRefs = references.filter(r => r.studentId === studentId);
    if (targetRefs.length === 0) {
      return NextResponse.json({
        match: false,
        found: false,
        confidence: 0,
        message: 'Siswa belum memiliki referensi wajah dengan descriptor',
        isAutoDetected: false,
      });
    }
  } else if (nisn) {
    targetRefs = references.filter(r => r.student.nisn === nisn);
    if (targetRefs.length === 0) {
      return NextResponse.json({
        match: false,
        found: false,
        confidence: 0,
        message: 'Siswa tidak ditemukan atau belum ada referensi wajah',
        isAutoDetected: false,
      });
    }
  }

  // Compare descriptor against all stored descriptors
  const MATCH_THRESHOLD = 0.6; // Standard threshold for face-api.js
  let bestMatch: { ref: typeof references[0]; distance: number } | null = null;

  for (const ref of targetRefs) {
    if (!ref.faceDescriptor) continue;
    try {
      const storedDescriptor = JSON.parse(ref.faceDescriptor);
      if (!Array.isArray(storedDescriptor) || storedDescriptor.length !== 128) continue;

      const distance = euclideanDistance(descriptor, storedDescriptor);

      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { ref, distance };
      }
    } catch (e) {
      continue; // Skip invalid descriptors
    }
  }

  if (!bestMatch || bestMatch.distance > MATCH_THRESHOLD) {
    return NextResponse.json({
      match: false,
      found: false,
      confidence: bestMatch ? Math.max(0, 1 - bestMatch.distance) : 0,
      message: 'Wajah tidak dikenali. Pastikan wajah terlihat jelas dan sudah terdaftar.',
      bestDistance: bestMatch?.distance || null,
      threshold: MATCH_THRESHOLD,
      isAutoDetected: !nisn && !studentId,
    });
  }

  // Face matched! Now process attendance
  const matchedStudent = bestMatch.ref.student;

  // Check student status
  if (matchedStudent.status !== 'AKTIF') {
    return NextResponse.json({
      match: true,
      found: true,
      confidence: Math.max(0, 1 - bestMatch.distance),
      distance: bestMatch.distance,
      isAutoDetected: !nisn && !studentId,
      canCheckIn: false,
      student: {
        id: matchedStudent.id,
        name: matchedStudent.name,
        nisn: matchedStudent.nisn,
        className: matchedStudent.class?.name,
        photoUrl: matchedStudent.photoBase64 || matchedStudent.photoUrl,
        status: matchedStudent.status,
      },
      message: `Siswa ${matchedStudent.name} tidak aktif`,
    });
  }

  // Check geolocation if provided
  let geoVerified = false;
  const { latitude, longitude, accuracy } = options;
  if (latitude && longitude) {
    const geofence = await db.geofenceConfig.findFirst({
      where: { isActive: true, isDefault: true },
    });
    if (geofence) {
      const R = 6371000;
      const dLat = ((geofence.centerLat - latitude) * Math.PI) / 180;
      const dLng = ((geofence.centerLng - longitude) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((latitude * Math.PI) / 180) * Math.cos((geofence.centerLat * Math.PI) / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;
      geoVerified = distance <= geofence.radiusMeters;
    }
  }

  // Get timezone from school config
  const tzConfig = await db.schoolConfig.findUnique({ where: { key: 'timezone' } });
  const timezone = tzConfig?.value || 'Asia/Jakarta';

  // Determine current time in configured timezone
  const now = new Date();
  const checkInHour = parseInt(now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }));

  // Determine if this is check-in or check-out
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const existingAttendance = await db.attendance.findUnique({
    where: { studentId_date: { studentId: matchedStudent.id, date: today } },
  });

  // Get school config for check-in cutoff
  const cutoffConfig = await db.schoolConfig.findUnique({ where: { key: 'checkin_cutoff_hour' } });
  const cutoffHour = cutoffConfig ? parseInt(cutoffConfig.value) : 7;

  let result;
  if (existingAttendance) {
    // Check-out
    if (existingAttendance.checkOutTime) {
      result = {
        match: true,
        found: true,
        isAutoDetected: !nisn && !studentId,
        student: {
          id: matchedStudent.id,
          name: matchedStudent.name,
          nisn: matchedStudent.nisn,
          className: matchedStudent.class?.name,
          photoUrl: matchedStudent.photoBase64 || matchedStudent.photoUrl,
        },
        alreadyDone: true,
        message: `${matchedStudent.name} sudah melakukan check-in dan check-out hari ini.`,
        confidence: Math.max(0, 1 - bestMatch.distance).toFixed(3),
        distance: bestMatch.distance.toFixed(4),
        attendance: {
          checkInTime: existingAttendance.checkInTime,
          checkOutTime: existingAttendance.checkOutTime,
          status: existingAttendance.status,
        },
      };
    } else {
      // Do check-out
      const updated = await db.attendance.update({
        where: { id: existingAttendance.id },
        data: {
          checkOutTime: now,
          checkOutMethod: 'FACE',
          checkOutLat: latitude || null,
          checkOutLng: longitude || null,
          checkOutAccuracy: accuracy || null,
          geoVerified,
          verifiedByFace: true,
        },
      });

      result = {
        match: true,
        found: true,
        isAutoDetected: !nisn && !studentId,
        student: {
          id: matchedStudent.id,
          name: matchedStudent.name,
          nisn: matchedStudent.nisn,
          className: matchedStudent.class?.name,
          photoUrl: matchedStudent.photoBase64 || matchedStudent.photoUrl,
        },
        action: 'checkout',
        message: `Check-out berhasil: ${matchedStudent.name}`,
        confidence: Math.max(0, 1 - bestMatch.distance).toFixed(3),
        distance: bestMatch.distance.toFixed(4),
        attendance: {
          checkInTime: updated.checkInTime,
          checkOutTime: updated.checkOutTime,
          status: updated.status,
        },
      };
    }
  } else {
    // Check-in
    const isLate = checkInHour > cutoffHour || (checkInHour === cutoffHour && now.getMinutes() > 0);
    const status = isLate ? 'TERLAMBAT' : 'HADIR';

    const attendance = await db.attendance.create({
      data: {
        studentId: matchedStudent.id,
        date: today,
        checkInTime: now,
        status,
        checkInMethod: 'FACE',
        isLateArrival: isLate,
        checkInLat: latitude || null,
        checkInLng: longitude || null,
        checkInAccuracy: accuracy || null,
        geoVerified,
        verifiedByFace: true,
      },
    });

    // Update student violation points if late
    if (isLate) {
      const lateCategory = await db.violationCategory.findFirst({ where: { code: 'TRLM' } });
      if (lateCategory) {
        const adminUser = await db.user.findFirst({ where: { role: 'ADMIN' } });
        const recorderId = adminUser?.id || matchedStudent.userId;
        try {
          await db.violation.create({
            data: {
              studentId: matchedStudent.id,
              categoryId: lateCategory.id,
              points: lateCategory.defaultPoints,
              description: `Terlambat masuk sekolah - check in ${now.toLocaleTimeString('id-ID', { timeZone: timezone })}`,
              date: today,
              recordedBy: recorderId,
            },
          });
          await db.student.update({
            where: { id: matchedStudent.id },
            data: { totalViolationPoints: { increment: lateCategory.defaultPoints } },
          });
        } catch (violationErr) {
          console.error('Failed to create late violation:', violationErr);
        }
      }
    }

    // Get welcome config
    const welcomeTextConfig = await db.schoolConfig.findUnique({ where: { key: 'welcome_text' } });
    const lateTextConfig = await db.schoolConfig.findUnique({ where: { key: 'welcome_late_text' } });
    const welcomeTemplate = isLate
      ? (lateTextConfig?.value || '{name}, Anda terlambat hari ini. Semoga besok lebih tepat waktu.')
      : (welcomeTextConfig?.value || 'Selamat datang, {name}! Semoga harimu menyenangkan.');
    const welcomeMessage = welcomeTemplate
      .replace(/\{name\}/g, matchedStudent.name)
      .replace(/\{nisn\}/g, matchedStudent.nisn)
      .replace(/\{className\}/g, matchedStudent.class?.name || '')
      .replace(/\{time\}/g, now.toLocaleTimeString('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }) + ' WIB')
      .replace(/\{status\}/g, status);

    result = {
      match: true,
      found: true,
      isAutoDetected: !nisn && !studentId,
      student: {
        id: matchedStudent.id,
        name: matchedStudent.name,
        nisn: matchedStudent.nisn,
        className: matchedStudent.class?.name,
        photoUrl: matchedStudent.photoBase64 || matchedStudent.photoUrl,
      },
      action: 'checkin',
      message: `Check-in berhasil: ${matchedStudent.name}`,
      isLate,
      status,
      welcomeMessage,
      confidence: Math.max(0, 1 - bestMatch.distance).toFixed(3),
      distance: bestMatch.distance.toFixed(4),
      attendance: {
        checkInTime: attendance.checkInTime,
        status: attendance.status,
      },
    };
  }

  return NextResponse.json(result);
}
