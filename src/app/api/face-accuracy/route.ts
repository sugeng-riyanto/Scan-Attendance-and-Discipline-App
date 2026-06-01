import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

const FACE_ROLES = ['ADMIN', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'];

// Euclidean distance between two 128-dim vectors
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

const MATCH_THRESHOLD = 0.6;
const MIN_ACCURACY_PERCENT = 75;

interface PairwiseResult {
  i: number;
  j: number;
  distance: number;
  accuracy: number;
}

// GET /api/face-accuracy?studentId=xxx - Calculate accuracy for a student's face references
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, FACE_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const nisn = searchParams.get('nisn');
    const action = searchParams.get('action');

    // Get threshold info
    if (action === 'info') {
      return NextResponse.json({
        matchThreshold: MATCH_THRESHOLD,
        minAccuracyPercent: MIN_ACCURACY_PERCENT,
        description: 'Threshold untuk kecocokan wajah. Jarak euclidean < threshold = cocok. Akurasi = (1 - jarak) * 100.',
        accuracyLevels: [
          { label: 'Sangat Baik', minPercent: 85, color: 'emerald' },
          { label: 'Baik', minPercent: 75, color: 'blue' },
          { label: 'Perlu Perbaikan', minPercent: 60, color: 'amber' },
          { label: 'Kurang Baik', minPercent: 0, color: 'red' },
        ],
      });
    }

    if (!studentId && !nisn) {
      return NextResponse.json(
        { error: 'studentId atau nisn wajib diisi' },
        { status: 400 }
      );
    }

    // Find student
    let targetStudentId = studentId;
    if (!targetStudentId && nisn) {
      const student = await db.student.findUnique({ where: { nisn } });
      if (!student) {
        return NextResponse.json(
          { error: 'Siswa tidak ditemukan' },
          { status: 404 }
        );
      }
      targetStudentId = student.id;
    }

    // Get all active face references with descriptors
    const references = await db.faceReference.findMany({
      where: {
        studentId: targetStudentId!,
        isActive: true,
        faceDescriptor: { not: null },
      },
      orderBy: { captureIndex: 'asc' },
      select: {
        id: true,
        captureIndex: true,
        faceDescriptor: true,
        quality: true,
      },
    });

    if (references.length < 2) {
      return NextResponse.json({
        studentId: targetStudentId,
        totalReferences: references.length,
        canTest: references.length >= 2,
        message: references.length < 2
          ? 'Minimal 2 referensi wajah dengan descriptor diperlukan untuk menguji akurasi'
          : undefined,
      });
    }

    // Parse descriptors
    const descriptors: { index: number; descriptor: number[]; refId: string }[] = [];
    for (const ref of references) {
      if (!ref.faceDescriptor) continue;
      try {
        const desc = JSON.parse(ref.faceDescriptor);
        if (Array.isArray(desc) && desc.length === 128) {
          descriptors.push({ index: ref.captureIndex, descriptor: desc, refId: ref.id });
        }
      } catch {
        continue;
      }
    }

    if (descriptors.length < 2) {
      return NextResponse.json({
        studentId: targetStudentId,
        totalReferences: references.length,
        validDescriptors: descriptors.length,
        canTest: false,
        message: 'Tidak cukup descriptor valid untuk pengujian',
      });
    }

    // Calculate pairwise accuracy
    const pairwiseResults: PairwiseResult[] = [];
    let totalAccuracy = 0;
    let totalDistance = 0;
    let count = 0;

    for (let i = 0; i < descriptors.length; i++) {
      for (let j = i + 1; j < descriptors.length; j++) {
        const distance = euclideanDistance(descriptors[i].descriptor, descriptors[j].descriptor);
        const accuracy = Math.max(0, (1 - distance) * 100);
        pairwiseResults.push({ i: descriptors[i].index, j: descriptors[j].index, distance, accuracy });
        totalAccuracy += accuracy;
        totalDistance += distance;
        count++;
      }
    }

    const overallAccuracy = count > 0 ? totalAccuracy / count : 0;
    const minAccuracy = pairwiseResults.length > 0 ? Math.min(...pairwiseResults.map(r => r.accuracy)) : 0;
    const maxAccuracy = pairwiseResults.length > 0 ? Math.max(...pairwiseResults.map(r => r.accuracy)) : 0;
    const avgDistance = count > 0 ? totalDistance / count : 0;

    let status: string;
    let statusLabel: string;
    let recommendation: string;

    if (overallAccuracy >= 85) {
      status = 'excellent';
      statusLabel = 'Sangat Baik';
      recommendation = 'Referensi wajah sangat konsisten. Sistem akan mengenali wajah dengan akurasi tinggi.';
    } else if (overallAccuracy >= 75) {
      status = 'good';
      statusLabel = 'Baik';
      recommendation = 'Referensi wajah cukup konsisten. Akurasi pengenalan wajah sudah memadai untuk presensi.';
    } else if (overallAccuracy >= 60) {
      status = 'warning';
      statusLabel = 'Perlu Perbaikan';
      recommendation = 'Konsistensi referensi wajah kurang baik. Disarankan untuk menghapus foto yang kurang jelas dan melakukan capture ulang dengan pencahayaan yang lebih baik.';
    } else {
      status = 'poor';
      statusLabel = 'Kurang Baik';
      recommendation = 'Referensi wajah sangat tidak konsisten. Harap hapus semua foto dan lakukan capture ulang dengan kondisi pencahayaan yang baik dan wajah yang jelas terlihat.';
    }

    return NextResponse.json({
      studentId: targetStudentId,
      totalReferences: references.length,
      validDescriptors: descriptors.length,
      canTest: true,
      accuracy: {
        overall: Math.round(overallAccuracy * 10) / 10,
        min: Math.round(minAccuracy * 10) / 10,
        max: Math.round(maxAccuracy * 10) / 10,
        avgDistance: Math.round(avgDistance * 1000) / 1000,
        status,
        statusLabel,
        recommendation,
        meetsMinimum: overallAccuracy >= MIN_ACCURACY_PERCENT,
        minimumRequired: MIN_ACCURACY_PERCENT,
      },
      pairwiseResults: pairwiseResults.map(r => ({
        ...r,
        accuracy: Math.round(r.accuracy * 10) / 10,
        distance: Math.round(r.distance * 1000) / 1000,
      })),
    });
  } catch (error) {
    console.error('Face accuracy test error:', error);
    return NextResponse.json(
      { error: 'Gagal menguji akurasi wajah' },
      { status: 500 }
    );
  }
}

// POST /api/face-accuracy - Live test: compare a descriptor against stored references
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, FACE_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { descriptor, studentId, nisn } = body;

    if (!descriptor || !Array.isArray(descriptor) || descriptor.length !== 128) {
      return NextResponse.json(
        { error: 'Face descriptor diperlukan (128 dimensi)' },
        { status: 400 }
      );
    }

    if (!studentId && !nisn) {
      return NextResponse.json(
        { error: 'studentId atau nisn wajib diisi' },
        { status: 400 }
      );
    }

    // Find student
    let targetStudentId = studentId;
    if (!targetStudentId && nisn) {
      const student = await db.student.findUnique({ where: { nisn } });
      if (!student) {
        return NextResponse.json(
          { error: 'Siswa tidak ditemukan' },
          { status: 404 }
        );
      }
      targetStudentId = student.id;
    }

    // Get stored references
    const references = await db.faceReference.findMany({
      where: {
        studentId: targetStudentId!,
        isActive: true,
        faceDescriptor: { not: null },
      },
      orderBy: { captureIndex: 'asc' },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nisn: true,
            class: { select: { name: true } },
          },
        },
      },
    });

    if (references.length === 0) {
      return NextResponse.json({
        matched: false,
        message: 'Siswa belum memiliki referensi wajah',
      });
    }

    // Compare against all stored descriptors
    const results: { captureIndex: number; distance: number; accuracy: number; matched: boolean }[] = [];
    let bestMatch: { ref: typeof references[0]; distance: number } | null = null;

    for (const ref of references) {
      if (!ref.faceDescriptor) continue;
      try {
        const storedDesc = JSON.parse(ref.faceDescriptor);
        if (!Array.isArray(storedDesc) || storedDesc.length !== 128) continue;

        const distance = euclideanDistance(descriptor, storedDesc);
        const accuracy = Math.max(0, (1 - distance) * 100);
        results.push({
          captureIndex: ref.captureIndex,
          distance: Math.round(distance * 1000) / 1000,
          accuracy: Math.round(accuracy * 10) / 10,
          matched: distance <= MATCH_THRESHOLD,
        });

        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { ref, distance };
        }
      } catch {
        continue;
      }
    }

    if (!bestMatch) {
      return NextResponse.json({
        matched: false,
        message: 'Tidak ada descriptor valid untuk perbandingan',
      });
    }

    const matched = bestMatch.distance <= MATCH_THRESHOLD;
    const bestAccuracy = Math.max(0, (1 - bestMatch.distance) * 100);

    return NextResponse.json({
      matched,
      student: matched ? {
        id: bestMatch.ref.student.id,
        name: bestMatch.ref.student.name,
        nisn: bestMatch.ref.student.nisn,
        className: bestMatch.ref.student.class?.name,
      } : null,
      bestAccuracy: Math.round(bestAccuracy * 10) / 10,
      bestDistance: Math.round(bestMatch.distance * 1000) / 1000,
      threshold: MATCH_THRESHOLD,
      totalReferencesCompared: results.length,
      results,
      recommendation: matched
        ? (bestAccuracy >= 85
          ? 'Wajah dikenali dengan sangat baik. Akurasi sangat tinggi.'
          : bestAccuracy >= 75
            ? 'Wajah dikenali dengan baik. Akurasi cukup untuk presensi.'
            : 'Wajah dikenali namun akurasi rendah. Pertimbangkan untuk melakukan capture ulang.')
        : 'Wajah tidak cocok dengan referensi manapun. Pastikan ini adalah siswa yang benar dan referensi wajah sudah di-capture.',
    });
  } catch (error) {
    console.error('Face accuracy live test error:', error);
    return NextResponse.json(
      { error: 'Gagal melakukan live test wajah' },
      { status: 500 }
    );
  }
}
