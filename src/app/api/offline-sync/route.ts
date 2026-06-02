import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';
import { getBehaviorLevel } from '@/lib/attendance-utils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SyncItem {
  action: string;   // CREATE, UPDATE, DELETE
  entity: string;   // attendance, violation, good-deed, etc.
  payload: string;  // JSON string of the data
  userId?: string;  // optional user who queued this
  tempId?: string;  // client-side temporary ID for reference
}

interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

// ─── POST: Sync offline queued data ─────────────────────────────────────────

const SYNC_ROLES = ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'];

export async function POST(request: NextRequest) {
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, SYNC_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const body = await request.json();
    const { items }: { items: SyncItem[] } = body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'No items provided for sync' },
        { status: 400 }
      );
    }

    for (const item of items) {
      try {
        // Validate required fields
        if (!item.action || !item.entity || !item.payload) {
          result.failed++;
          result.errors.push(
            `Item missing required fields (action, entity, payload)${item.tempId ? ` [tempId: ${item.tempId}]` : ''}`
          );
          continue;
        }

        // Parse the payload
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(item.payload);
        } catch {
          result.failed++;
          result.errors.push(
            `Invalid JSON payload for ${item.entity}:${item.action}${item.tempId ? ` [tempId: ${item.tempId}]` : ''}`
          );
          continue;
        }

        // Route to the appropriate handler
        await processSyncItem(item, payload);
        result.synced++;

        // Record successful sync in OfflineQueue
        await db.offlineQueue.create({
          data: {
            userId: item.userId ?? null,
            action: item.action,
            entity: item.entity,
            payload: item.payload,
            status: 'SYNCED',
            attempts: 1,
            lastAttempt: new Date(),
          },
        });
      } catch (error) {
        result.failed++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        result.errors.push(
          `Failed to sync ${item.entity}:${item.action} — ${errorMessage}${item.tempId ? ` [tempId: ${item.tempId}]` : ''}`
        );

        // Record failed sync in OfflineQueue
        try {
          await db.offlineQueue.create({
            data: {
              userId: item.userId ?? null,
              action: item.action,
              entity: item.entity,
              payload: item.payload,
              status: 'FAILED',
              attempts: 1,
              lastAttempt: new Date(),
              error: errorMessage,
            },
          });
        } catch {
          // Silently ignore if logging the failure also fails
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Offline sync error:', error);
    return NextResponse.json(
      { error: 'Failed to process offline sync', ...result },
      { status: 500 }
    );
  }
}

// ─── GET: Check sync status ─────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, SYNC_ROLES)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    const where: { userId?: string } = {};
    if (userId) {
      where.userId = userId;
    }

    // Get pending count
    const pendingCount = await db.offlineQueue.count({
      where: { ...where, status: 'PENDING' },
    });

    // Get failed count
    const failedCount = await db.offlineQueue.count({
      where: { ...where, status: 'FAILED' },
    });

    // Get synced count
    const syncedCount = await db.offlineQueue.count({
      where: { ...where, status: 'SYNCED' },
    });

    // Get last sync time (most recent synced record)
    const lastSyncedRecord = await db.offlineQueue.findFirst({
      where: { ...where, status: 'SYNCED' },
      orderBy: { lastAttempt: 'desc' },
      select: { lastAttempt: true },
    });

    // Get last attempted sync (any status)
    const lastAttemptRecord = await db.offlineQueue.findFirst({
      where: { ...where, lastAttempt: { not: null } },
      orderBy: { lastAttempt: 'desc' },
      select: { lastAttempt: true },
    });

    // Get pending items grouped by entity
    const pendingByEntity = await db.offlineQueue.groupBy({
      by: ['entity'],
      where: { ...where, status: 'PENDING' },
      _count: { entity: true },
    });

    const pendingBreakdown = pendingByEntity.reduce<
      Record<string, number>
    >((acc, item) => {
      acc[item.entity] = item._count.entity;
      return acc;
    }, {});

    return NextResponse.json({
      pendingCount,
      failedCount,
      syncedCount,
      lastSyncTime: lastSyncedRecord?.lastAttempt ?? null,
      lastAttemptTime: lastAttemptRecord?.lastAttempt ?? null,
      pendingBreakdown,
    });
  } catch (error) {
    console.error('Get sync status error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve sync status' },
      { status: 500 }
    );
  }
}

// ─── Sync Item Processors ───────────────────────────────────────────────────

async function processSyncItem(
  item: SyncItem,
  payload: Record<string, unknown>
): Promise<void> {
  const { action, entity } = item;

  switch (entity) {
    case 'attendance':
      await processAttendance(action, payload);
      break;

    case 'violation':
      await processViolation(action, payload);
      break;

    case 'good-deed':
      await processGoodDeed(action, payload);
      break;

    default:
      await processGenericEntity(action, entity, payload);
      break;
  }
}

// ─── Attendance Processor ───────────────────────────────────────────────────

async function processAttendance(
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (action) {
    case 'CREATE': {
      const {
        studentId,
        date,
        status,
        checkInTime,
        checkOutTime,
        checkInMethod,
        checkOutMethod,
        notes,
        permissionId,
        isLateArrival,
        isEarlyDeparture,
        verifiedByFace,
        checkInLat,
        checkInLng,
        checkInAccuracy,
        checkOutLat,
        checkOutLng,
        checkOutAccuracy,
        geoVerified,
        deviceInfo,
      } = payload as Record<string, unknown>;

      if (!studentId || !date || !status) {
        throw new Error('Missing required fields: studentId, date, status');
      }

      // Check for duplicate attendance on same date
      const d = new Date(date as string);
      const dayStart = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate()
      );
      const dayEnd = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate() + 1
      );

      const existing = await db.attendance.findFirst({
        where: {
          studentId: studentId as string,
          date: { gte: dayStart, lt: dayEnd },
        },
      });

      if (existing) {
        // If record already exists, update it instead
        await db.attendance.update({
          where: { id: existing.id },
          data: buildAttendanceUpdateData(payload),
        });
        return;
      }

      await db.attendance.create({
        data: {
          studentId: studentId as string,
          date: dayStart,
          checkInTime: checkInTime ? new Date(checkInTime as string) : null,
          checkOutTime: checkOutTime
            ? new Date(checkOutTime as string)
            : null,
          status: status as string,
          checkInMethod: (checkInMethod as string) ?? null,
          checkOutMethod: (checkOutMethod as string) ?? null,
          isLateArrival: (isLateArrival as boolean) ?? status === 'TERLAMBAT',
          isEarlyDeparture: (isEarlyDeparture as boolean) ?? false,
          permissionId: (permissionId as string) ?? null,
          verifiedByFace: (verifiedByFace as boolean) ?? false,
          notes: (notes as string) ?? null,
          checkInLat: (checkInLat as number) ?? null,
          checkInLng: (checkInLng as number) ?? null,
          checkInAccuracy: (checkInAccuracy as number) ?? null,
          checkOutLat: (checkOutLat as number) ?? null,
          checkOutLng: (checkOutLng as number) ?? null,
          checkOutAccuracy: (checkOutAccuracy as number) ?? null,
          geoVerified: (geoVerified as boolean) ?? false,
          deviceInfo: (deviceInfo as string) ?? null,
        },
      });
      break;
    }

    case 'UPDATE': {
      const { id } = payload as Record<string, unknown>;

      if (!id) {
        throw new Error('Missing required field: id');
      }

      // Verify the record exists
      const existing = await db.attendance.findUnique({
        where: { id: id as string },
      });

      if (!existing) {
        throw new Error(`Attendance record not found: ${id}`);
      }

      await db.attendance.update({
        where: { id: id as string },
        data: buildAttendanceUpdateData(payload),
      });
      break;
    }

    default:
      throw new Error(`Unsupported action for attendance: ${action}`);
  }
}

function buildAttendanceUpdateData(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const data: Record<string, unknown> = {};

  const updatableFields = [
    'status',
    'checkInMethod',
    'checkOutMethod',
    'isLateArrival',
    'isEarlyDeparture',
    'verifiedByFace',
    'notes',
    'checkInLat',
    'checkInLng',
    'checkInAccuracy',
    'checkOutLat',
    'checkOutLng',
    'checkOutAccuracy',
    'geoVerified',
    'deviceInfo',
    'permissionId',
  ];

  for (const field of updatableFields) {
    if (payload[field] !== undefined) {
      data[field] = payload[field];
    }
  }

  // Handle date fields separately
  if (payload.checkInTime !== undefined) {
    data.checkInTime = payload.checkInTime
      ? new Date(payload.checkInTime as string)
      : null;
  }
  if (payload.checkOutTime !== undefined) {
    data.checkOutTime = payload.checkOutTime
      ? new Date(payload.checkOutTime as string)
      : null;
  }

  return data;
}

// ─── Violation Processor ────────────────────────────────────────────────────

async function processViolation(
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (action) {
    case 'CREATE': {
      const {
        studentId,
        categoryId,
        points,
        description,
        date,
        recordedBy,
      } = payload as Record<string, unknown>;

      if (!studentId || !categoryId || !date || !recordedBy) {
        throw new Error(
          'Missing required fields: studentId, categoryId, date, recordedBy'
        );
      }

      // Get category for default points
      const category = await db.violationCategory.findUnique({
        where: { id: categoryId as string },
      });
      const pointValue =
        (points as number) ?? category?.defaultPoints ?? 5;

      const violation = await db.violation.create({
        data: {
          studentId: studentId as string,
          categoryId: categoryId as string,
          points: pointValue,
          description: (description as string) ?? null,
          date: new Date(date as string),
          recordedBy: recordedBy as string,
        },
      });

      // Update student total violation points + behavior escalation
      const student = await db.student.findUnique({
        where: { id: studentId as string },
      });
      if (student) {
        const newTotal = student.totalViolationPoints + pointValue;
        await db.student.update({
          where: { id: studentId as string },
          data: { totalViolationPoints: newTotal },
        });

        // Check for escalation
        const prevLevel = getBehaviorLevel(student.totalViolationPoints);
        const newLevel = getBehaviorLevel(newTotal);

        if (newLevel.level > prevLevel.level) {
          const alertTargets: { alertType: string; targetRole: string }[] =
            [];
          if (newTotal > 150) {
            alertTargets.push({
              alertType: 'LEVEL_4',
              targetRole: 'ORANG_TUA',
            });
          } else if (newTotal > 100) {
            alertTargets.push({
              alertType: 'LEVEL_3',
              targetRole: 'KEPALA_SEKOLAH',
            });
          } else if (newTotal > 50) {
            alertTargets.push({
              alertType: 'LEVEL_2',
              targetRole: 'VP_KESISWAAN',
            });
          }

          for (const at of alertTargets) {
            await db.behaviorAlert.create({
              data: {
                studentId: studentId as string,
                alertType: at.alertType,
                message: `${student.name} telah melampaui ${newTotal > 150 ? 150 : newTotal > 100 ? 100 : 50} poin pelanggaran (total: ${newTotal}). ${newLevel.handler} perlu menindaklanjuti.`,
                threshold: newTotal > 150 ? 150 : newTotal > 100 ? 100 : 50,
                targetRole: at.targetRole,
              },
            });
          }
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported action for violation: ${action}`);
  }
}

// ─── Good Deed Processor ────────────────────────────────────────────────────

async function processGoodDeed(
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  switch (action) {
    case 'CREATE': {
      const {
        studentId,
        categoryId,
        points,
        description,
        date,
        recordedBy,
      } = payload as Record<string, unknown>;

      if (!studentId || !categoryId || !date || !recordedBy) {
        throw new Error(
          'Missing required fields: studentId, categoryId, date, recordedBy'
        );
      }

      // Get category for default points
      const category = await db.goodDeedCategory.findUnique({
        where: { id: categoryId as string },
      });
      const pointValue =
        (points as number) ?? category?.defaultPoints ?? 5;

      await db.goodDeed.create({
        data: {
          studentId: studentId as string,
          categoryId: categoryId as string,
          points: pointValue,
          description: (description as string) ?? null,
          date: new Date(date as string),
          recordedBy: recordedBy as string,
        },
      });

      // Update student total good points
      await db.student.update({
        where: { id: studentId as string },
        data: { totalGoodPoints: { increment: pointValue } },
      });
      break;
    }

    default:
      throw new Error(`Unsupported action for good-deed: ${action}`);
  }
}

// ─── Generic Entity Processor ───────────────────────────────────────────────

async function processGenericEntity(
  action: string,
  entity: string,
  payload: Record<string, unknown>
): Promise<void> {
  // Map entity names to their Prisma model names
  const entityModelMap: Record<string, string> = {
    permission: 'permission',
    'behavior-alert': 'behaviorAlert',
    'scan-session': 'scanSession',
  };

  const modelName = entityModelMap[entity];

  if (!modelName) {
    throw new Error(
      `Unknown entity type: ${entity}. No handler available for sync.`
    );
  }

  const { id, ...data } = payload;

  switch (action) {
    case 'CREATE': {
      // Use dynamic model access via Prisma
      const model = (db as Record<string, Record<string, (...args: unknown[]) => unknown>>)[
        modelName
      ];
      if (!model || typeof model.create !== 'function') {
        throw new Error(`Model ${modelName} does not support create`);
      }

      // Convert date strings to Date objects for known date fields
      const processedData = convertDateFields(data);
      await model.create({ data: processedData });
      break;
    }

    case 'UPDATE': {
      if (!id) {
        throw new Error('Missing required field: id for UPDATE action');
      }

      const model = (db as Record<string, Record<string, (...args: unknown[]) => unknown>>)[
        modelName
      ];
      if (!model || typeof model.update !== 'function') {
        throw new Error(`Model ${modelName} does not support update`);
      }

      const processedData = convertDateFields(data);
      await model.update({
        where: { id: id as string },
        data: processedData,
      });
      break;
    }

    case 'DELETE': {
      if (!id) {
        throw new Error('Missing required field: id for DELETE action');
      }

      const model = (db as Record<string, Record<string, (...args: unknown[]) => unknown>>)[
        modelName
      ];
      if (!model || typeof model.delete !== 'function') {
        throw new Error(`Model ${modelName} does not support delete`);
      }

      await model.delete({ where: { id: id as string } });
      break;
    }

    default:
      throw new Error(
        `Unsupported action: ${action} for entity: ${entity}`
      );
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Convert ISO date strings to Date objects for known date fields.
 * This handles the common case where JSON payloads contain date strings
 * that need to be Date objects for Prisma.
 */
function convertDateFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const dateFieldPatterns = ['date', 'Date', 'Time', 'time', 'At', 'CreatedAt', 'UpdatedAt'];
  const processed = { ...data };

  for (const [key, value] of Object.entries(processed)) {
    if (
      typeof value === 'string' &&
      dateFieldPatterns.some((pattern) => key.includes(pattern))
    ) {
      // Validate it looks like an ISO date string
      const parsed = Date.parse(value);
      if (!isNaN(parsed)) {
        processed[key] = new Date(value);
      }
    }
  }

  return processed;
}
