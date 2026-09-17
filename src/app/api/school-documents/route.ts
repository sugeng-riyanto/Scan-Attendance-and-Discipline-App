import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-utils';
import { canAccessApi } from '@/lib/rbac-policy';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const where: any = {};
    if (type) where.type = type;

    // Anyone in the school may read the library; only the document managers see
    // unpublished drafts, which is the same right that lets them write one.
    const isAdminOrVpkes = canAccessApi(auth.role, 'POST /api/school-documents');
    if (!isAdminOrVpkes) where.isPublished = true;

    const documents = await db.schoolDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ documents });
  } catch (error) {
    console.error('Get school documents error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data dokumen' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'POST /api/school-documents')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { type, title, description, url, isPublished, period } = body;

    if (!type || !title || !url) {
      return NextResponse.json({ error: 'Type, title, dan url wajib diisi' }, { status: 400 });
    }

    const validTypes = ['HANDBOOK', 'CALENDAR', 'INFORMATION'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Tipe dokumen tidak valid' }, { status: 400 });
    }

    if (type === 'INFORMATION' && period && !['WEEKLY', 'MONTHLY'].includes(period)) {
      return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
    }

    const document = await db.schoolDocument.create({
      data: {
        type,
        title,
        description: description || null,
        url,
        isPublished: isPublished ?? false,
        createdBy: auth.userId,
        period: type === 'INFORMATION' ? (period || null) : null,
      },
    });

    return NextResponse.json({ document }, { status: 201 });
  } catch (error) {
    console.error('Create school document error:', error);
    return NextResponse.json({ error: 'Gagal membuat dokumen' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'PUT /api/school-documents')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const existing = await db.schoolDocument.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });

    const body = await request.json();
    const { type, title, description, url, isPublished, period } = body;

    const data: any = {};
    if (type !== undefined) {
      const validTypes = ['HANDBOOK', 'CALENDAR', 'INFORMATION'];
      if (!validTypes.includes(type)) {
        return NextResponse.json({ error: 'Tipe dokumen tidak valid' }, { status: 400 });
      }
      data.type = type;
    }
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (url !== undefined) data.url = url;
    if (isPublished !== undefined) data.isPublished = isPublished;
    if (period !== undefined) data.period = period;

    const document = await db.schoolDocument.update({
      where: { id },
      data,
    });

    return NextResponse.json({ document });
  } catch (error) {
    console.error('Update school document error:', error);
    return NextResponse.json({ error: 'Gagal memperbarui dokumen' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'DELETE /api/school-documents')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    const existing = await db.schoolDocument.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Dokumen tidak ditemukan' }, { status: 404 });

    await db.schoolDocument.delete({ where: { id } });
    return NextResponse.json({ message: 'Dokumen berhasil dihapus' });
  } catch (error) {
    console.error('Delete school document error:', error);
    return NextResponse.json({ error: 'Gagal menghapus dokumen' }, { status: 500 });
  }
}
