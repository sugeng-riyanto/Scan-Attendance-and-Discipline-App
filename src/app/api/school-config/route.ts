import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      const config = await db.schoolConfig.findUnique({ where: { key } });
      return NextResponse.json({ config });
    }

    const configs = await db.schoolConfig.findMany({ orderBy: { key: 'asc' } });
    return NextResponse.json({ configs });
  } catch (error) {
    return NextResponse.json({ error: 'Gagal mengambil konfigurasi' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { key, value, description } = await request.json();
    const config = await db.schoolConfig.upsert({
      where: { key },
      update: { value, description },
      create: { key, value, description },
    });
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: 'Gagal menyimpan konfigurasi' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { key, value, description } = await request.json();
    const config = await db.schoolConfig.update({
      where: { key },
      data: { value, description },
    });
    return NextResponse.json({ config });
  } catch (error) {
    return NextResponse.json({ error: 'Gagal memperbarui konfigurasi' }, { status: 500 });
  }
}
