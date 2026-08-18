import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emitSocketEvent } from '@/lib/socket-server';
import { decideScanAction } from '@/lib/scan-gating';

// Euclidean distance between two 128-dim vectors
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Public scan endpoint - no auth required
// Used by the public /scan page for QR and face-based attendance
export async function POST(request: NextRequest) {
  try {
    const { qrCode, nisn, method, latitude, longitude, accuracy, capturedPhoto, autoDetect, descriptor } = await request.json();

    // Allow face auto-detect mode without QR/NISN
    if (!qrCode && !nisn && !(capturedPhoto && method === 'FACE') && !(descriptor && method === 'FACE')) {
      return NextResponse.json({ error: 'QR code, NISN, atau foto wajah diperlukan' }, { status: 400 });
    }

    // Find student by QR code or NISN
    let student;
    if (qrCode) {
      student = await db.student.findUnique({
        where: { qrCode },
        include: { class: true, user: true },
      });
    }
    if (!student && nisn) {
      student = await db.student.findUnique({
        where: { nisn },
        include: { class: true, user: true },
      });
    }

    // Face auto-detect mode using descriptor-based matching
    if (!student && method === 'FACE' && descriptor && Array.isArray(descriptor) && descriptor.length === 128) {
      try {
        const matchedStudent = await matchFaceDescriptor(descriptor, nisn);
        if (matchedStudent) {
          student = matchedStudent;
        } else {
          return NextResponse.json({
            found: false,
            message: 'Wajah tidak dikenali. Pastikan wajah terlihat jelas dan sudah terdaftar, atau gunakan NISN/QR code.',
            isAutoDetected: true,
            autoDetectFailed: true,
          });
        }
      } catch (faceErr) {
        console.error('Face descriptor match error in public-scan:', faceErr);
        return NextResponse.json({
          found: false,
          message: 'Gagal mengenali wajah. Gunakan NISN atau QR code.',
          autoDetectFailed: true,
        });
      }
    }
    // Legacy fallback: face mode with capturedPhoto but no descriptor
    else if (!student && capturedPhoto && method === 'FACE' && !descriptor) {
      return NextResponse.json({
        found: false,
        message: 'Verifikasi wajah memerlukan face descriptor. Pastikan model AI sudah dimuat.',
        isAutoDetected: true,
        autoDetectFailed: true,
      });
    }

    if (!student) {
      return NextResponse.json({ error: 'Siswa tidak ditemukan', found: false }, { status: 404 });
    }

    if (student.status !== 'AKTIF') {
      return NextResponse.json({
        error: 'Siswa tidak aktif',
        found: true,
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name, status: student.status },
        canCheckIn: false,
      });
    }

    // Check geolocation if provided
    let geoVerified = false;
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
    const timezone = tzConfig?.value || 'Asia/Jakarta'; // Default UTC+7

    // Determine current time in configured timezone
    const now = new Date();
    const checkInHour = (() => {
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false });
      return parseInt(formatter.format(now));
    })();

    // Determine if this is check-in or check-out
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const existingAttendance = await db.attendance.findUnique({
      where: { studentId_date: { studentId: student.id, date: today } },
    });

    // Get school config for check-in cutoff
    const cutoffConfig = await db.schoolConfig.findUnique({ where: { key: 'checkin_cutoff_hour' } });
    const cutoffHour = cutoffConfig ? parseInt(cutoffConfig.value) : 7; // Default 07:00

    // Active scan session shift gating: PAGI only allows check-in, SORE only
    // allows check-out. No active session (or no shift set) = no gating.
    const activeScanSession = await db.scanSession.findFirst({ where: { isActive: true } });
    const sessionShift = activeScanSession?.shift || null;

    // Decide the action with the pure gating rules (unit-tested in
    // src/lib/scan-gating.test.ts) so the route stays a thin executor.
    const minHoursConfig = await db.schoolConfig.findUnique({ where: { key: 'min_checkout_hours' } });
    const minCheckoutHours = minHoursConfig ? parseFloat(minHoursConfig.value) : 4;

    const decision = decideScanAction({
      hasExistingAttendance: !!existingAttendance,
      hasCheckOutTime: !!existingAttendance?.checkOutTime,
      hasCheckInTime: !!existingAttendance?.checkInTime,
      checkInTime: existingAttendance?.checkInTime ?? null,
      sessionShift,
      now,
      minCheckoutHours,
    });

    let result;
    if (decision.kind === 'already_done') {
      result = {
        found: true,
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name, photoUrl: student.photoBase64 || student.photoUrl },
        alreadyDone: true,
        message: `${student.name} sudah melakukan check-in dan check-out hari ini.`,
        attendance: {
          checkInTime: existingAttendance?.checkInTime ?? null,
          checkOutTime: existingAttendance?.checkOutTime ?? null,
          status: existingAttendance?.status ?? null,
        },
      };
    } else if (decision.kind === 'refused') {
      const base = {
        found: true,
        refused: true,
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name, photoUrl: student.photoBase64 || student.photoUrl },
      };
      if (decision.reason === 'pagi_checkout') {
        // PAGI sessions are for check-in only — refuse the check-out.
        result = {
          ...base,
          message: `${student.name} sudah check-in. Sesi PAGI hanya untuk check-in — check-out dilakukan pada sesi SORE.`,
          attendance: {
            checkInTime: existingAttendance?.checkInTime ?? null,
            checkOutTime: existingAttendance?.checkOutTime ?? null,
            status: existingAttendance?.status ?? null,
          },
        };
      } else if (decision.reason === 'min_checkout_hours') {
        const checkInTimeStr = existingAttendance?.checkInTime
          ? existingAttendance.checkInTime.toLocaleTimeString('id-ID', {
              timeZone: timezone,
              hour: '2-digit',
              minute: '2-digit',
            })
          : '—';
        const hoursStr = Number.isInteger(minCheckoutHours) ? String(minCheckoutHours) : minCheckoutHours.toFixed(1);
        result = {
          ...base,
          message: `${student.name} baru check-in pukul ${checkInTimeStr} WIB. Check-out diperbolehkan setelah minimal ${hoursStr} jam sejak check-in.`,
          attendance: {
            checkInTime: existingAttendance?.checkInTime ?? null,
            checkOutTime: existingAttendance?.checkOutTime ?? null,
            status: existingAttendance?.status ?? null,
          },
        };
      } else if (decision.reason === 'no_checkin') {
        // The student has a placeholder record (IZIN/ALPHA/SAKIT) but never
        // checked in — refuse the check-out instead of stamping a check-out
        // time on an absent row.
        const status = existingAttendance?.status ? ` (status: ${existingAttendance.status})` : '';
        result = {
          ...base,
          message: `${student.name} belum tercatat check-in hari ini${status}. Check-out tidak dapat dilakukan karena belum ada check-in.`,
          attendance: {
            checkInTime: existingAttendance?.checkInTime ?? null,
            checkOutTime: existingAttendance?.checkOutTime ?? null,
            status: existingAttendance?.status ?? null,
          },
        };
      } else {
        // SORE sessions are for check-out only — refuse the check-in.
        result = {
          ...base,
          message: `${student.name} belum check-in hari ini. Sesi SORE hanya untuk check-out — check-in dilakukan pada sesi PAGI.`,
        };
      }
    } else if (decision.kind === 'checkout') {
      // Do check-out
      const checkoutMethod = method || 'QR';
      const updated = await db.attendance.update({
        where: { id: existingAttendance!.id },
        data: {
          checkOutTime: now,
          checkOutMethod: checkoutMethod,
          checkOutLat: latitude || null,
          checkOutLng: longitude || null,
          checkOutAccuracy: accuracy || null,
          geoVerified,
          verifiedByFace: method === 'FACE' || false,
        },
      });

      emitSocketEvent('attendance:checkout', {
        action: 'checkout',
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name },
        attendance: updated,
        isEarlyDeparture: false,
      });

      result = {
        found: true,
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name, photoUrl: student.photoBase64 || student.photoUrl },
        action: 'checkout',
        message: `Check-out berhasil: ${student.name}`,
        attendance: {
          checkInTime: updated.checkInTime,
          checkOutTime: updated.checkOutTime,
          status: updated.status,
        },
      };
    } else {
      // Check-in
      const checkInMethod = method || 'QR';
      const isLate = checkInHour > cutoffHour || (checkInHour === cutoffHour && now.getMinutes() > 0);
      const status = isLate ? 'TERLAMBAT' : 'HADIR';

      const attendance = await db.attendance.upsert({
        where: { studentId_date: { studentId: student.id, date: today } },
        update: {
          checkInTime: now,
          status,
          checkInMethod,
          isLateArrival: isLate,
          checkInLat: latitude || null,
          checkInLng: longitude || null,
          checkInAccuracy: accuracy || null,
          geoVerified,
          verifiedByFace: method === 'FACE' || false,
        },
        create: {
          studentId: student.id,
          date: today,
          checkInTime: now,
          status,
          checkInMethod,
          isLateArrival: isLate,
          checkInLat: latitude || null,
          checkInLng: longitude || null,
          checkInAccuracy: accuracy || null,
          geoVerified,
          verifiedByFace: method === 'FACE' || false,
        },
      });

      emitSocketEvent('attendance:checkin', {
        action: 'checkin',
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name },
        attendance,
        status,
        isLate,
      });

      // Update student violation points if late
      if (isLate) {
        const lateCategory = await db.violationCategory.findFirst({ where: { code: 'TRLM' } });
        if (lateCategory) {
          // Find an admin user to record the violation, or use the student's user
          const adminUser = await db.user.findFirst({ where: { role: 'ADMIN' } });
          const recorderId = adminUser?.id || student.userId;
          try {
            await db.violation.create({
              data: {
                studentId: student.id,
                categoryId: lateCategory.id,
                points: lateCategory.defaultPoints,
                description: `Terlambat masuk sekolah - check in ${now.toLocaleTimeString('id-ID', { timeZone: timezone })}`,
                date: today,
                recordedBy: recorderId,
              },
            });
            await db.student.update({
              where: { id: student.id },
              data: { totalViolationPoints: { increment: lateCategory.defaultPoints } },
            });
            emitSocketEvent('violation:new', {
              student: { id: student.id, name: student.name, className: student.class.name },
              points: lateCategory.defaultPoints,
              description: `Terlambat masuk sekolah - check in ${now.toLocaleTimeString('id-ID', { timeZone: timezone })}`,
              date: today,
            });
          } catch (violationErr) {
            console.error('Failed to create late violation:', violationErr);
            // Don't fail the whole check-in if violation creation fails
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
        .replace(/\{name\}/g, student.name)
        .replace(/\{nisn\}/g, student.nisn)
        .replace(/\{className\}/g, student.class.name)
        .replace(/\{time\}/g, now.toLocaleTimeString('id-ID', { timeZone: timezone, hour: '2-digit', minute: '2-digit' }) + ' WIB')
        .replace(/\{status\}/g, status);

      result = {
        found: true,
        student: { id: student.id, name: student.name, nisn: student.nisn, className: student.class.name, photoUrl: student.photoBase64 || student.photoUrl },
        action: 'checkin',
        message: `Check-in berhasil: ${student.name}`,
        isLate,
        status,
        welcomeMessage,
        attendance: {
          checkInTime: attendance.checkInTime,
          status: attendance.status,
        },
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Public scan error:', error);
    return NextResponse.json({ error: 'Gagal memproses scan' }, { status: 500 });
  }
}

// Match a face descriptor against stored face references
// Returns the matched student or null
async function matchFaceDescriptor(
  descriptor: number[],
  nisn?: string
): Promise<any | null> {
  // Get all active face references with descriptors
  const where: any = {
    isActive: true,
    faceDescriptor: { not: null },
  };

  // If NISN provided, filter by that student
  if (nisn) {
    const student = await db.student.findUnique({ where: { nisn } });
    if (!student) return null;
    where.studentId = student.id;
  }

  const references = await db.faceReference.findMany({
    where,
    include: {
      student: {
        include: { class: true, user: true },
      },
    },
  });

  if (references.length === 0) return null;

  // Compare descriptor against all stored descriptors
  const MATCH_THRESHOLD = 0.6;
  let bestMatch: { ref: typeof references[0]; distance: number } | null = null;

  for (const ref of references) {
    if (!ref.faceDescriptor) continue;
    try {
      const storedDescriptor = JSON.parse(ref.faceDescriptor);
      if (!Array.isArray(storedDescriptor) || storedDescriptor.length !== 128) continue;

      const distance = euclideanDistance(descriptor, storedDescriptor);

      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { ref, distance };
      }
    } catch (e) {
      continue;
    }
  }

  if (!bestMatch || bestMatch.distance > MATCH_THRESHOLD) {
    return null;
  }

  // Verify student is active
  const student = bestMatch.ref.student;
  if (student.status !== 'AKTIF') return null;

  // Return full student with class and user for attendance processing
  return db.student.findUnique({
    where: { id: student.id },
    include: { class: true, user: true },
  });
}
