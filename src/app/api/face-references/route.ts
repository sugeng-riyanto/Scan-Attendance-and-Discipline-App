import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

const FACE_ROLES = ['ADMIN', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'];
const MAX_CAPTURES_PER_STUDENT = 5;
const MIN_CAPTURES_FOR_BASIC_ACCURACY = 3;

const RECOMMENDATION_TEXT =
  'Untuk akurasi optimal, disarankan 5 kali capture wajah dari berbagai sudut (depan, kiri, kanan, atas, bawah). Minimum 3 capture untuk akurasi dasar.';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, FACE_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Recommendation endpoint
    if (action === 'recommendation') {
      return NextResponse.json({
        recommendation: RECOMMENDATION_TEXT,
        maxCaptures: MAX_CAPTURES_PER_STUDENT,
        minCaptures: MIN_CAPTURES_FOR_BASIC_ACCURACY,
      });
    }

    // List face references
    const studentId = searchParams.get('studentId');
    const nisn = searchParams.get('nisn');

    const where: Record<string, unknown> = { isActive: true };

    if (studentId) {
      where.studentId = studentId;
    } else if (nisn) {
      const student = await db.student.findUnique({ where: { nisn } });
      if (!student) {
        return NextResponse.json({ faceReferences: [] });
      }
      where.studentId = student.id;
    }

    const faceReferences = await db.faceReference.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nisn: true,
            class: { select: { id: true, name: true } },
          },
        },
        capturer: {
          select: { id: true, name: true, username: true },
        },
      },
      orderBy: [{ studentId: 'asc' }, { captureIndex: 'asc' }],
    });

    // Reshape for cleaner response
    const formatted = faceReferences.map((ref) => ({
      id: ref.id,
      studentId: ref.studentId,
      photoBase64: ref.photoBase64,
      faceDescriptor: ref.faceDescriptor,
      captureIndex: ref.captureIndex,
      capturedBy: ref.capturedBy,
      capturerName: ref.capturer?.name ?? null,
      captureMethod: ref.captureMethod,
      quality: ref.quality,
      isActive: ref.isActive,
      createdAt: ref.createdAt,
      updatedAt: ref.updatedAt,
      student: {
        id: ref.student.id,
        name: ref.student.name,
        nisn: ref.student.nisn,
        className: ref.student.class.name,
      },
    }));

    return NextResponse.json({ faceReferences: formatted });
  } catch (error) {
    console.error('Get face references error:', error);
    return NextResponse.json(
      { error: 'Gagal mengambil data referensi wajah' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, FACE_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { studentId, photoBase64, captureIndex, capturedBy, captureMethod, faceDescriptor } =
      body;

    // Validate required fields
    if (!studentId) {
      return NextResponse.json(
        { error: 'ID siswa wajib diisi' },
        { status: 400 }
      );
    }
    if (!photoBase64) {
      return NextResponse.json(
        { error: 'Foto wajah wajib diisi' },
        { status: 400 }
      );
    }
    if (captureIndex === undefined || captureIndex === null) {
      return NextResponse.json(
        { error: 'Nomor capture wajib diisi' },
        { status: 400 }
      );
    }

    // Validate capture method
    if (
      captureMethod &&
      captureMethod !== 'WEBCAM' &&
      captureMethod !== 'MANUAL'
    ) {
      return NextResponse.json(
        { error: 'Metode capture tidak valid. Gunakan WEBCAM atau MANUAL' },
        { status: 400 }
      );
    }

    // Validate face descriptor if provided
    if (faceDescriptor !== undefined && faceDescriptor !== null) {
      if (!Array.isArray(faceDescriptor) || faceDescriptor.length !== 128) {
        return NextResponse.json(
          { error: 'Face descriptor tidak valid (harus array 128 dimensi)' },
          { status: 400 }
        );
      }
    }

    // Validate student exists
    const student = await db.student.findUnique({
      where: { id: studentId },
      include: { class: true },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'Siswa tidak ditemukan' },
        { status: 404 }
      );
    }

    // Check existing active captures count
    const existingCount = await db.faceReference.count({
      where: { studentId, isActive: true },
    });

    let warning: string | null = null;

    if (existingCount >= MAX_CAPTURES_PER_STUDENT) {
      warning = `Siswa sudah memiliki ${MAX_CAPTURES_PER_STUDENT} capture aktif. Capture tambahan mungkin mengurangi akurasi.`;
    }

    // Validate capturer exists if provided
    if (capturedBy) {
      const capturer = await db.user.findUnique({
        where: { id: capturedBy },
      });
      if (!capturer) {
        return NextResponse.json(
          { error: 'Pengguna yang melakukan capture tidak ditemukan' },
          { status: 404 }
        );
      }
    }

    // Create the face reference
    const faceReference = await db.faceReference.create({
      data: {
        studentId,
        photoBase64,
        captureIndex: Number(captureIndex),
        capturedBy: capturedBy || null,
        captureMethod: captureMethod || null,
        quality: body.quality ?? null,
        isActive: true,
        faceDescriptor: faceDescriptor ? JSON.stringify(faceDescriptor) : null,
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            nisn: true,
            class: { select: { id: true, name: true } },
          },
        },
        capturer: {
          select: { id: true, name: true, username: true },
        },
      },
    });

    // Get updated total captures
    const totalCaptures = await db.faceReference.count({
      where: { studentId, isActive: true },
    });

    const message =
      totalCaptures >= MIN_CAPTURES_FOR_BASIC_ACCURACY
        ? `Capture wajah berhasil disimpan. Total: ${totalCaptures}/${MAX_CAPTURES_PER_STUDENT}`
        : `Capture wajah berhasil disimpan. Total: ${totalCaptures}/${MAX_CAPTURES_PER_STUDENT}. ${RECOMMENDATION_TEXT}`;

    return NextResponse.json(
      {
        message,
        warning,
        faceReference: {
          id: faceReference.id,
          studentId: faceReference.studentId,
          captureIndex: faceReference.captureIndex,
          capturedBy: faceReference.capturedBy,
          capturerName: faceReference.capturer?.name ?? null,
          captureMethod: faceReference.captureMethod,
          quality: faceReference.quality,
          isActive: faceReference.isActive,
          hasDescriptor: !!faceReference.faceDescriptor,
          createdAt: faceReference.createdAt,
          student: {
            id: faceReference.student.id,
            name: faceReference.student.name,
            nisn: faceReference.student.nisn,
            className: faceReference.student.class.name,
          },
        },
        totalCaptures,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create face reference error:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan referensi wajah' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, FACE_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { id, softDelete } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'ID referensi wajah wajib diisi' },
        { status: 400 }
      );
    }

    const faceRef = await db.faceReference.findUnique({ where: { id } });

    if (!faceRef) {
      return NextResponse.json(
        { error: 'Referensi wajah tidak ditemukan' },
        { status: 404 }
      );
    }

    if (softDelete === false) {
      // Hard delete
      await db.faceReference.delete({ where: { id } });
      return NextResponse.json({
        message: 'Referensi wajah berhasil dihapus permanen',
      });
    }

    // Default: soft delete (set isActive = false)
    await db.faceReference.update({
      where: { id },
      data: { isActive: false },
    });

    // Get remaining active captures for the student
    const remainingCaptures = await db.faceReference.count({
      where: { studentId: faceRef.studentId, isActive: true },
    });

    let message = 'Referensi wajah berhasil dinonaktifkan';
    if (remainingCaptures < MIN_CAPTURES_FOR_BASIC_ACCURACY) {
      message += `. Perhatian: Sisa capture aktif (${remainingCaptures}) di bawah minimum yang disarankan (${MIN_CAPTURES_FOR_BASIC_ACCURACY}). ${RECOMMENDATION_TEXT}`;
    }

    return NextResponse.json({
      message,
      remainingCaptures,
    });
  } catch (error) {
    console.error('Delete face reference error:', error);
    return NextResponse.json(
      { error: 'Gagal menghapus referensi wajah' },
      { status: 500 }
    );
  }
}
