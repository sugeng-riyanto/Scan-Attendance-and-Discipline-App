import { db } from '@/lib/db';
import { cookies } from 'next/headers';
import type { JwtPayload } from '@/lib/auth-utils';

/**
 * Preview mode for SUPER_ADMIN: the `preview_school_id` cookie selects which
 * school's data the super admin sees, letting them preview the app exactly as
 * a user of that school would — without changing accounts. Only honored for
 * SUPER_ADMIN (role gates still pass; data is scoped to the previewed school),
 * and the value is validated against an existing school before it is applied.
 */
export async function getPreviewSchoolId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get('preview_school_id')?.value;
    if (!raw) return null;
    const school = await db.school.findUnique({ where: { id: raw }, select: { id: true } });
    return school ? school.id : null;
  } catch {
    return null;
  }
}

/**
 * Per-school data isolation (multi-tenant).
 *
 * SUPER_ADMIN manages all schools -> no restriction, EXCEPT when preview mode
 * is active (see getPreviewSchoolId): then data is scoped to the previewed
 * school so the super admin sees exactly what that school's users see.
 * Every other role is bound to the school of their user account: they can
 * only read/write students, classes, attendance, violations, etc. that belong
 * to their own school.
 *
 * Returns Prisma-friendly `where` fragments to spread into queries:
 *   - `schoolWhere`    -> `{ schoolId }` (Student, Class and anything with a
 *                         direct `schoolId` column)
 *   - `studentWhere`   -> `{ student: { schoolId } }` (Attendance, Violation,
 *                         GoodDeed, Permission, BehaviorAlert, FaceReference
 *                         which reference a Student)
 */
export interface SchoolScope {
  schoolId: string | null;
  isSuperAdmin: boolean;
  /** Restriction for entities that have their own schoolId column. */
  schoolWhere: Record<string, unknown>;
  /** Restriction for entities that reach a school through `student.schoolId`. */
  studentWhere: Record<string, unknown>;
}

export async function getSchoolScope(auth: JwtPayload | null): Promise<SchoolScope> {
  if (!auth) {
    return { schoolId: null, isSuperAdmin: false, schoolWhere: {}, studentWhere: {} };
  }
  if (auth.role === 'SUPER_ADMIN') {
    const previewSchoolId = await getPreviewSchoolId();
    if (previewSchoolId) {
      return {
        schoolId: previewSchoolId,
        isSuperAdmin: true,
        schoolWhere: { schoolId: previewSchoolId },
        studentWhere: { student: { schoolId: previewSchoolId } },
      };
    }
    return { schoolId: null, isSuperAdmin: true, schoolWhere: {}, studentWhere: {} };
  }

  let schoolId: string | null = null;
  try {
    const user = await db.user.findUnique({ where: { id: auth.userId }, select: { schoolId: true } });
    schoolId = user?.schoolId ?? null;
  } catch {
    schoolId = null;
  }

  // A non-super-admin with no school binding must NOT see everything:
  // deny by default (`id: null` matches nothing) instead of an unrestricted {}.
  return {
    schoolId,
    isSuperAdmin: false,
    schoolWhere: schoolId ? { schoolId } : { id: null },
    studentWhere: schoolId ? { student: { schoolId } } : { student: { id: null } },
  };
}
