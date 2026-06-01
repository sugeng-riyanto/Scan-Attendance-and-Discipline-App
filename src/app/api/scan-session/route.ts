import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-utils';

const ALLOWED_ROLES = ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'];

export async function GET() {
  try {
    // Find the current active scan session
    const activeSession = await db.scanSession.findFirst({
      where: { isActive: true },
      include: {
        activator: { select: { id: true, name: true } },
        deactivator: { select: { id: true, name: true } },
      },
    });

    // Fetch last 10 scan session history records (most recent first)
    const history = await db.scanSession.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        activator: { select: { id: true, name: true } },
        deactivator: { select: { id: true, name: true } },
      },
    });

    if (activeSession) {
      return NextResponse.json({
        active: true,
        sessionId: activeSession.id,
        defaultMode: activeSession.defaultMode,
        activatedBy: activeSession.activator?.name ?? null,
        activatedAt: activeSession.activatedAt,
        shift: activeSession.shift,
        notes: activeSession.notes,
        history: history.map(formatSessionRecord),
      });
    }

    return NextResponse.json({
      active: false,
      history: history.map(formatSessionRecord),
    });
  } catch (error) {
    console.error('Get scan session error:', error);
    return NextResponse.json(
      { error: 'Gagal mengambil data sesi pemindaian' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { action, defaultMode, shift, notes } = body;
    const userId = auth.userId;

    if (!action) {
      return NextResponse.json(
        { error: 'Data tidak lengkap' },
        { status: 400 }
      );
    }

    if (action !== 'activate' && action !== 'deactivate') {
      return NextResponse.json(
        { error: 'Action harus "activate" atau "deactivate"' },
        { status: 400 }
      );
    }

    if (action === 'activate') {
      // Validate defaultMode
      const mode = defaultMode ?? 'FACE';
      if (mode !== 'FACE' && mode !== 'QR') {
        return NextResponse.json(
          { error: 'defaultMode harus "FACE" atau "QR"' },
          { status: 400 }
        );
      }

      // Validate shift if provided
      if (shift && shift !== 'PAGI' && shift !== 'SORE') {
        return NextResponse.json(
          { error: 'Shift harus "PAGI" atau "SORE"' },
          { status: 400 }
        );
      }

      // Check if there's already an active session
      const existingActive = await db.scanSession.findFirst({
        where: { isActive: true },
      });

      if (existingActive) {
        return NextResponse.json(
          { error: 'Sesi pemindaian sudah aktif' },
          { status: 409 }
        );
      }

      // Create new active scan session
      const session = await db.scanSession.create({
        data: {
          isActive: true,
          defaultMode: mode,
          activatedBy: userId,
          activatedAt: new Date(),
          shift: shift ?? null,
          notes: notes ?? null,
        },
        include: {
          activator: { select: { id: true, name: true } },
          deactivator: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json(
        {
          active: true,
          sessionId: session.id,
          defaultMode: session.defaultMode,
          activatedBy: session.activator?.name ?? null,
          activatedAt: session.activatedAt,
          shift: session.shift,
          notes: session.notes,
          message: 'Sesi pemindaian berhasil diaktifkan',
        },
        { status: 201 }
      );
    }

    if (action === 'deactivate') {
      // Find current active session
      const activeSession = await db.scanSession.findFirst({
        where: { isActive: true },
      });

      if (!activeSession) {
        return NextResponse.json(
          { error: 'Tidak ada sesi pemindaian yang aktif' },
          { status: 404 }
        );
      }

      // Deactivate the session
      const session = await db.scanSession.update({
        where: { id: activeSession.id },
        data: {
          isActive: false,
          deactivatedBy: userId,
          deactivatedAt: new Date(),
        },
        include: {
          activator: { select: { id: true, name: true } },
          deactivator: { select: { id: true, name: true } },
        },
      });

      return NextResponse.json({
        active: false,
        sessionId: session.id,
        defaultMode: session.defaultMode,
        activatedBy: session.activator?.name ?? null,
        activatedAt: session.activatedAt,
        deactivatedBy: session.deactivator?.name ?? null,
        deactivatedAt: session.deactivatedAt,
        shift: session.shift,
        notes: session.notes,
        message: 'Sesi pemindaian berhasil dinonaktifkan',
      });
    }

    return NextResponse.json(
      { error: 'Action tidak valid' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Scan session action error:', error);
    return NextResponse.json(
      { error: 'Gagal mengubah sesi pemindaian' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!ALLOWED_ROLES.includes(auth.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { defaultMode } = body;

    if (!defaultMode) {
      return NextResponse.json(
        { error: 'Data tidak lengkap' },
        { status: 400 }
      );
    }

    if (defaultMode !== 'FACE' && defaultMode !== 'QR') {
      return NextResponse.json(
        { error: 'defaultMode harus "FACE" atau "QR"' },
        { status: 400 }
      );
    }

    // Find current active session
    const activeSession = await db.scanSession.findFirst({
      where: { isActive: true },
    });

    if (!activeSession) {
      return NextResponse.json(
        { error: 'Tidak ada sesi pemindaian yang aktif' },
        { status: 404 }
      );
    }

    // Update default mode
    const session = await db.scanSession.update({
      where: { id: activeSession.id },
      data: { defaultMode },
      include: {
        activator: { select: { id: true, name: true } },
        deactivator: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      active: true,
      sessionId: session.id,
      defaultMode: session.defaultMode,
      activatedBy: session.activator?.name ?? null,
      activatedAt: session.activatedAt,
      shift: session.shift,
      notes: session.notes,
      message: `Mode pemindaian diubah ke ${defaultMode}`,
    });
  } catch (error) {
    console.error('Update scan session mode error:', error);
    return NextResponse.json(
      { error: 'Gagal mengubah mode pemindaian' },
      { status: 500 }
    );
  }
}

function formatSessionRecord(session: {
  id: string;
  isActive: boolean;
  defaultMode: string;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
  shift: string | null;
  notes: string | null;
  createdAt: Date;
  activator: { id: string; name: string } | null;
  deactivator: { id: string; name: string } | null;
}) {
  return {
    id: session.id,
    isActive: session.isActive,
    defaultMode: session.defaultMode,
    activatedBy: session.activator?.name ?? null,
    activatedAt: session.activatedAt,
    deactivatedBy: session.deactivator?.name ?? null,
    deactivatedAt: session.deactivatedAt,
    shift: session.shift,
    notes: session.notes,
    createdAt: session.createdAt,
  };
}
