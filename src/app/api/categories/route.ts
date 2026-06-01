import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA', 'SISWA', 'ORANG_TUA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // 'violation' or 'good-deed' or 'all'

    const result: any = {};

    if (type === 'all' || type === 'violation') {
      result.violationCategories = await db.violationCategory.findMany({
        where: { isActive: true },
        orderBy: { level: 'asc' },
      });
    }

    if (type === 'all' || type === 'good-deed') {
      result.goodDeedCategories = await db.goodDeedCategory.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Get categories error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data kategori' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { type, name, code, level, defaultPoints, description } = body;

    if (!type || !name || !code) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    let category;
    if (type === 'violation') {
      category = await db.violationCategory.create({
        data: { name, code, level: level || 'RINGAN', defaultPoints: defaultPoints || 5, description },
      });
    } else {
      category = await db.goodDeedCategory.create({
        data: { name, code, defaultPoints: defaultPoints || 5, description },
      });
    }

    return NextResponse.json({ category }, { status: 201 });
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Kode kategori sudah ada' }, { status: 409 });
    }
    console.error('Create category error:', error);
    return NextResponse.json({ error: 'Gagal membuat kategori' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { type, id, ...data } = body;

    if (!type || !id) return NextResponse.json({ error: 'Type dan ID diperlukan' }, { status: 400 });

    let category;
    if (type === 'violation') {
      category = await db.violationCategory.update({ where: { id }, data });
    } else {
      category = await db.goodDeedCategory.update({ where: { id }, data });
    }

    return NextResponse.json({ category });
  } catch (error) {
    console.error('Update category error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate kategori' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const id = searchParams.get('id');

    if (!type || !id) return NextResponse.json({ error: 'Type dan ID diperlukan' }, { status: 400 });

    // Soft delete
    if (type === 'violation') {
      await db.violationCategory.update({ where: { id }, data: { isActive: false } });
    } else {
      await db.goodDeedCategory.update({ where: { id }, data: { isActive: false } });
    }

    return NextResponse.json({ message: 'Kategori dinonaktifkan' });
  } catch (error) {
    console.error('Delete category error:', error);
    return NextResponse.json({ error: 'Gagal menghapus kategori' }, { status: 500 });
  }
}
