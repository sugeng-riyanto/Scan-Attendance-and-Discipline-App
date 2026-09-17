import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-utils';
import { canAccessApi } from '@/lib/rbac-policy';

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'GET /api/geofence')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const geofences = await db.geofenceConfig.findMany({
      orderBy: { isDefault: 'desc' },
    });
    return NextResponse.json({ geofences });
  } catch (error) {
    console.error('Get geofences error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data geofence' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'POST /api/geofence')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { name, centerLat, centerLng, radiusMeters, isDefault } = await request.json();

    if (!name || centerLat == null || centerLng == null || !radiusMeters) {
      return NextResponse.json({ error: 'Data tidak lengkap' }, { status: 400 });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await db.geofenceConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const geofence = await db.geofenceConfig.create({
      data: { name, centerLat, centerLng, radiusMeters, isDefault: !!isDefault },
    });

    return NextResponse.json({ geofence }, { status: 201 });
  } catch (error) {
    console.error('Create geofence error:', error);
    return NextResponse.json({ error: 'Gagal membuat geofence' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'PUT /api/geofence')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { id, ...data } = await request.json();
    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    if (data.isDefault) {
      await db.geofenceConfig.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const geofence = await db.geofenceConfig.update({
      where: { id },
      data,
    });

    return NextResponse.json({ geofence });
  } catch (error) {
    console.error('Update geofence error:', error);
    return NextResponse.json({ error: 'Gagal mengupdate geofence' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'DELETE /api/geofence')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID diperlukan' }, { status: 400 });

    await db.geofenceConfig.delete({ where: { id } });
    return NextResponse.json({ message: 'Geofence dihapus' });
  } catch (error) {
    console.error('Delete geofence error:', error);
    return NextResponse.json({ error: 'Gagal menghapus geofence' }, { status: 500 });
  }
}
