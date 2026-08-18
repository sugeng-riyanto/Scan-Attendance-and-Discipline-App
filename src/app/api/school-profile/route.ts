import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';
import { getSchoolScope } from '@/lib/school-scope';
import { logAudit } from '@/lib/audit';

// Public-facing profile of a school's landing page, editable by the school's
// own Admin/Kepala Sekolah (Settings -> Profil). Strictly school-scoped: the
// actor can only read/write their own school's profile.

const PROFILE_SELECT = {
  id: true, code: true, name: true, address: true, logo: true, themeColor: true, headerImage: true,
  description: true, vision: true, mission: true, phone: true, email: true,
  hasJhs: true, hasShs: true, jhsStart: true, jhsEnd: true, shsStart: true, shsEnd: true,
} as const;

// Defaults mirror the global dismissal config (SchoolConfig) and check-in time.
const DEFAULT_PROFILE = {
  jhsStart: '07:00', jhsEnd: '14:50', shsStart: '07:00', shsEnd: '15:30',
} as const;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Blank string -> null so empty fields clear instead of storing "". */
function clean(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function authorize(request: NextRequest): Promise<{ scope: Awaited<ReturnType<typeof getSchoolScope>>; auth: NonNullable<ReturnType<typeof getAuthUser>> } | NextResponse> {
  const auth = getAuthUser(request);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH'])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const scope = await getSchoolScope(auth);
  if (!scope.schoolId) {
    return NextResponse.json({ error: 'Akun tidak terikat ke sekolah mana pun' }, { status: 400 });
  }
  return { scope, auth };
}

export async function GET(request: NextRequest) {
  const authorized = await authorize(request);
  if (authorized instanceof NextResponse) return authorized;
  // authorize() guarantees a non-null schoolId for the actor.
  const schoolId = authorized.scope.schoolId!;
  try {
    const school = await db.school.findUnique({
      where: { id: schoolId },
      select: PROFILE_SELECT,
    });
    if (!school) return NextResponse.json({ error: 'Sekolah tidak ditemukan' }, { status: 404 });
    // Fill null schedule times with the global defaults so the settings form
    // always shows something sensible.
    return NextResponse.json({
      school: {
        ...school,
        jhsStart: school.jhsStart || DEFAULT_PROFILE.jhsStart,
        jhsEnd: school.jhsEnd || DEFAULT_PROFILE.jhsEnd,
        shsStart: school.shsStart || DEFAULT_PROFILE.shsStart,
        shsEnd: school.shsEnd || DEFAULT_PROFILE.shsEnd,
      },
    });
  } catch (error: any) {
    console.error('School profile GET error:', error);
    return NextResponse.json({ error: 'Gagal mengambil profil sekolah' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const authorized = await authorize(request);
  if (authorized instanceof NextResponse) return authorized;
  const { scope, auth } = authorized;

  try {
    // authorize() guarantees a non-null schoolId for the actor.
    const schoolId = scope.schoolId!;
    const body = await request.json();
    const { name, address, logo, headerImage, themeColor, description, vision, mission, phone, email, hasJhs, hasShs, jhsStart, jhsEnd, shsStart, shsEnd } = body;

    const times: Record<string, unknown> = { jhsStart, jhsEnd, shsStart, shsEnd };
    for (const [key, value] of Object.entries(times)) {
      if (value && !TIME_RE.test(String(value))) {
        return NextResponse.json({ error: `Format jam ${key} tidak valid (gunakan HH:mm)` }, { status: 400 });
      }
    }
    if (themeColor && !/^#[0-9a-fA-F]{3,8}$/.test(String(themeColor))) {
      return NextResponse.json({ error: 'Format warna tema tidak valid' }, { status: 400 });
    }

    // Only touch fields the client actually sends — a partial update (e.g.
    // uploading just a header image) must never wipe the other profile fields.
    const school = await db.school.update({
      where: { id: schoolId },
      data: {
        ...(name && clean(name) ? { name: clean(name)! } : {}),
        ...(address !== undefined ? { address: clean(address) } : {}),
        ...(logo !== undefined ? { logo: clean(logo) } : {}),
        ...(headerImage !== undefined ? { headerImage: clean(headerImage) } : {}),
        ...(themeColor !== undefined ? { themeColor: clean(themeColor) } : {}),
        ...(description !== undefined ? { description: clean(description) } : {}),
        ...(vision !== undefined ? { vision: clean(vision) } : {}),
        ...(mission !== undefined ? { mission: clean(mission) } : {}),
        ...(phone !== undefined ? { phone: clean(phone) } : {}),
        ...(email !== undefined ? { email: clean(email) } : {}),
        ...(hasJhs !== undefined ? { hasJhs: hasJhs !== false } : {}),
        ...(hasShs !== undefined ? { hasShs: hasShs !== false } : {}),
        ...(jhsStart !== undefined ? { jhsStart: clean(jhsStart) } : {}),
        ...(jhsEnd !== undefined ? { jhsEnd: clean(jhsEnd) } : {}),
        ...(shsStart !== undefined ? { shsStart: clean(shsStart) } : {}),
        ...(shsEnd !== undefined ? { shsEnd: clean(shsEnd) } : {}),
      },
      select: PROFILE_SELECT,
    });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    await logAudit({
      action: 'SCHOOL_PROFILE_UPDATE', category: 'SETTINGS', severity: 'INFO',
      userId: auth.userId, username: auth.username, role: auth.role, ip,
      details: `Perbarui profil sekolah ${school.name} (${school.code})`,
    });

    return NextResponse.json({ message: 'Profil sekolah diperbarui', school });
  } catch (error: any) {
    console.error('School profile PUT error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui profil sekolah' }, { status: 500 });
  }
}
