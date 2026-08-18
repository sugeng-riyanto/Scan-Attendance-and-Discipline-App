import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Public (no-auth) school directory for the landing/login page: lets a visitor
 * pick which school they belong to before logging in, and supplies that
 * school's branding (name, address, logo, accent color).
 *
 *   GET /api/schools/public            -> all active schools
 *   GET /api/schools/public?code=X     -> one active school by code (or null)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');

    if (code) {
      const school = await db.school.findFirst({
        where: { code: code.trim().toUpperCase(), isActive: true },
        select: { id: true, code: true, name: true, address: true, logo: true, themeColor: true, headerImage: true, domain: true, description: true, vision: true, mission: true, phone: true, email: true, hasJhs: true, hasShs: true, jhsStart: true, jhsEnd: true, shsStart: true, shsEnd: true, subscriptions: { select: { status: true, plan: true } } },
      });
      return NextResponse.json({ school: school ?? null });
    }

    const schools = await db.school.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      select: { id: true, code: true, name: true, address: true, logo: true, themeColor: true, headerImage: true, domain: true, description: true, vision: true, mission: true, phone: true, email: true, hasJhs: true, hasShs: true, jhsStart: true, jhsEnd: true, shsStart: true, shsEnd: true, subscriptions: { select: { status: true, plan: true } } },
    });
    return NextResponse.json({ schools });
  } catch (error: any) {
    console.error('Public schools error:', error);
    return NextResponse.json({ error: 'Gagal mengambil daftar sekolah' }, { status: 500 });
  }
}
