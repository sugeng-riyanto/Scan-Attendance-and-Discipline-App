import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, getAuthUser } from '@/lib/auth-utils';
import { canAccessApi } from '@/lib/rbac-policy';
import { getSchoolScope } from '@/lib/school-scope';
import { generateQRString } from '@/lib/qr-utils';
import { logAudit } from '@/lib/audit';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!canAccessApi(auth.role, 'POST /api/import')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string;
    const classId = formData.get('classId') as string;
    const academicYearId = formData.get('academicYearId') as string;

    if (!file || !type) {
      return NextResponse.json({ error: 'File dan tipe import diperlukan' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'File XLSX kosong' }, { status: 400 });
    }

    let imported = 0;
    let errors: string[] = [];
    let schoolsCreated = 0;

    // Per-school isolation: imported students/classes bind to the actor's school.
    const scope = await getSchoolScope(auth);

    switch (type) {
      case 'students':
        // Isolation: an explicit target class must belong to the school this
        // actor is acting for, otherwise a school-B admin could file imported
        // students into school-A's class and inherit its roster.
        if (classId && scope.schoolId) {
          const ownedClass = await db.class.findFirst({
            where: { id: classId, schoolId: scope.schoolId },
            select: { id: true },
          });
          if (!ownedClass) {
            return NextResponse.json({ error: 'Kelas tidak ditemukan di sekolah Anda' }, { status: 404 });
          }
        }
        const result = await importStudents(rows, classId, academicYearId, scope, auth);
        imported = result.imported;
        errors = result.errors;
        schoolsCreated = result.schoolsCreated;
        break;
      case 'users':
        const userResult = await importUsers(rows, scope);
        imported = userResult.imported;
        errors = userResult.errors;
        break;
      case 'violation-categories':
        const violResult = await importViolationCategories(rows);
        imported = violResult.imported;
        errors = violResult.errors;
        break;
      case 'good-deed-categories':
        const goodResult = await importGoodDeedCategories(rows);
        imported = goodResult.imported;
        errors = goodResult.errors;
        break;
      default:
        return NextResponse.json({ error: 'Tipe import tidak valid' }, { status: 400 });
    }

    await logAudit({
      action: 'IMPORT',
      category: 'IMPORT',
      severity: 'INFO',
      userId: auth.userId,
      username: auth.username,
      role: auth.role,
      details: `Import ${type}: ${imported} data${schoolsCreated ? `, ${schoolsCreated} sekolah baru dibuat` : ''} (${errors.length} error)`,
    });

    return NextResponse.json({
      message: `Berhasil import ${imported} data${schoolsCreated ? ` · ${schoolsCreated} sekolah baru dibuat` : ''}`,
      imported,
      schoolsCreated,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Gagal mengimport data: ' + error.message }, { status: 500 });
  }
}

type ImportScope = { schoolId: string | null; isSuperAdmin: boolean; schoolWhere: Record<string, unknown> };

/**
 * Resolve the school a student row targets, based on the `Kode Sekolah` column.
 *  - Empty code  -> the actor's own school (SUPER_ADMIN falls back to the first school).
 *  - Known code  -> that school, but non-super-admins may only target their own school.
 *  - Unknown code -> ONLY SUPER_ADMIN: creates the school on the fly (fresh provisioning:
 *    school + 30-day TRIAL subscription), so a single students upload fully provisions
 *    a new school (school, classes, students, parent accounts).
 * Results are cached per upload so repeated rows never create duplicates.
 */
async function resolveImportSchool(
  code: string,
  name: string,
  scope: ImportScope,
  cache: Map<string, { id: string } | 'invalid'>,
  auth: any
): Promise<{ schoolId: string; created: boolean } | { error: string }> {
  const normalized = code.trim().toUpperCase();
  if (cache.has(normalized)) {
    const hit = cache.get(normalized)!;
    if (hit === 'invalid') return { error: `Kode sekolah "${code}" tidak dapat digunakan` };
    return { schoolId: hit.id, created: false };
  }

  if (!normalized) {
    // Actor's own school. Only a SUPER_ADMIN outside preview mode may fall back
    // to "the first school": for anyone else a missing binding must be an error,
    // not a silent write into whichever school happens to be oldest.
    let schoolId = scope.schoolId;
    if (!schoolId && scope.isSuperAdmin) {
      const defaultSchool = await db.school.findFirst({ orderBy: { createdAt: 'asc' } });
      schoolId = defaultSchool ? defaultSchool.id : null;
    }
    if (!schoolId) {
      cache.set(normalized, 'invalid');
      return { error: 'Tidak ada sekolah untuk import siswa' };
    }
    cache.set(normalized, { id: schoolId });
    return { schoolId, created: false };
  }

  const school = await db.school.findUnique({ where: { code: normalized } });
  if (school) {
    // Isolation: a school-bound actor can only import into their own school.
    if (!scope.isSuperAdmin && scope.schoolId && school.id !== scope.schoolId) {
      cache.set(normalized, 'invalid');
      return { error: `Kode sekolah "${code}" milik sekolah lain` };
    }
    cache.set(normalized, { id: school.id });
    return { schoolId: school.id, created: false };
  }

  // Unknown code -> fresh-school provisioning is a SUPER_ADMIN capability.
  if (!scope.isSuperAdmin) {
    cache.set(normalized, 'invalid');
    return { error: `Kode sekolah "${code}" tidak ditemukan` };
  }

  const newSchool = await db.school.create({
    data: { code: normalized, name: name || `Sekolah ${normalized}`, address: null, isActive: true },
  });
  const periodStart = new Date();
  const periodEnd = new Date(Date.now() + 30 * 86400000);
  await db.subscription.create({
    data: { schoolId: newSchool.id, plan: 'YEARLY', status: 'TRIAL', periodStart, periodEnd, notes: 'Masa percobaan 30 hari' },
  });
  const ip = auth?.ip || null;
  await logAudit({
    action: 'SCHOOL_CREATE',
    category: 'SETTINGS',
    severity: 'INFO',
    userId: auth?.userId,
    username: auth?.username,
    role: auth?.role,
    ip,
    details: `Sekolah baru dibuat lewat import siswa: ${newSchool.name} (${newSchool.code})`,
  });
  cache.set(normalized, { id: newSchool.id });
  return { schoolId: newSchool.id, created: true };
}

async function importStudents(rows: Record<string, any>[], classId?: string, academicYearId?: string, scope?: ImportScope, auth?: any) {
  let imported = 0;
  let schoolsCreated = 0;
  const errors: string[] = [];
  const schoolCache = new Map<string, { id: string } | 'invalid'>();

  // Get active academic year if not provided
  let activeYear = academicYearId;
  if (!activeYear) {
    const year = await db.academicYear.findFirst({ where: { isActive: true } });
    if (year) activeYear = year.id;
    else {
      errors.push('Tidak ada tahun ajaran aktif');
      return { imported, errors, schoolsCreated };
    }
  }

  for (const row of rows) {
    try {
      const nisn = String(row['NISN'] || row['nisn'] || '').trim();
      const name = String(row['Nama Siswa'] || row['Nama'] || row['nama'] || '').trim();
      const className = String(row['Kelas'] || row['kelas'] || '').trim();
      // Jenjang (JHS/SHS) — when present, it drives the class level so the
      // database adapts (JHS -> SMP, SHS -> SMA) regardless of class naming.
      const jenjang = String(row['Jenjang'] || row['jenjang'] || '').trim().toUpperCase();
      const gender = String(row['Jenis Kelamin'] || row['Gender'] || row['gender'] || '').trim();
      const parentName = String(row['Nama Orang Tua'] || row['Orang Tua'] || row['ortu'] || '').trim();
      const address = String(row['Alamat'] || row['alamat'] || '').trim();
      const email = String(row['Email'] || row['email'] || '').trim();
      const phone = String(row['No HP'] || row['Phone'] || row['phone'] || '').trim();
      // Multi-tenant provisioning: Kode Sekolah (kosong = sekolah pengimpor);
      // kode yang belum ada otomatis membuat sekolah baru (khusus SUPER_ADMIN).
      const schoolCode = String(row['Kode Sekolah'] || row['Kode'] || '').trim();
      const schoolName = String(row['Nama Sekolah'] || row['Nama Sekolah Baru'] || '').trim();

      if (!nisn || !name) {
        errors.push(`Baris dilewati: NISN atau Nama kosong`);
        continue;
      }

      // Resolve the target school (may create it for a fresh school code).
      const resolved = await resolveImportSchool(schoolCode, schoolName, scope!, schoolCache, auth);
      if ('error' in resolved) {
        errors.push(`${name}: ${resolved.error}`);
        continue;
      }
      const schoolId = resolved.schoolId;
      if (resolved.created) schoolsCreated++;

      // Find or create class
      let studentClassId = classId;
      if (!studentClassId && className) {
        const existingClass = await db.class.findFirst({
          where: { name: className, academicYearId: activeYear, schoolId }
        });
        if (existingClass) {
          studentClassId = existingClass.id;
        } else {
          // Auto-create class. Prefer the explicit Jenjang column (JHS/SHS);
          // fall back to the leading digits of the class name (<=9 -> SMP).
          let level = 'SMP';
          if (jenjang === 'JHS') level = 'SMP';
          else if (jenjang === 'SHS') level = 'SMA';
          else {
            const digits = className.match(/^\d+/)?.[0];
            level = digits ? (parseInt(digits) <= 9 ? 'SMP' : 'SMA') : 'SMP';
          }
          const newClass = await db.class.create({
            data: {
              name: className,
              level,
              schoolId,
              academicYearId: activeYear!,
            }
          });
          studentClassId = newClass.id;
        }
      }

      if (!studentClassId) {
        errors.push(`${name}: Kelas tidak ditemukan`);
        continue;
      }

      // Check if student already exists
      const existing = await db.student.findUnique({ where: { nisn } });
      if (existing) {
        // Never let an import mutate a student from another school.
        if (existing.schoolId !== schoolId) {
          errors.push(`${name}: NISN sudah terdaftar di sekolah lain`);
          continue;
        }
        // Update existing student
        await db.student.update({
          where: { nisn },
          data: { name, classId: studentClassId, gender, address, email, phone },
        });
        imported++;
        continue;
      }

      // Create user account for student
      const hashedPw = await hashPassword(nisn);
      const user = await db.user.create({
        data: {
          username: nisn,
          password: hashedPw,
          name,
          role: 'SISWA',
          schoolId,
        }
      });

      // Create student
      const qrCode = generateQRString(nisn);
      await db.student.create({
        data: {
          nisn,
          name,
          schoolId,
          classId: studentClassId,
          academicYearId: activeYear!,
          userId: user.id,
          qrCode,
          gender,
          address,
          email,
          phone,
          status: 'AKTIF',
        }
      });

      // Create parent if name provided
      if (parentName) {
        const parentUsername = `ortu_${nisn}`;
        const existingParentUser = await db.user.findUnique({ where: { username: parentUsername } });
        if (!existingParentUser) {
          const parentPw = await hashPassword('ortu123');
          const parentUser = await db.user.create({
            data: {
              username: parentUsername,
              password: parentPw,
              name: parentName,
              role: 'ORANG_TUA',
              schoolId,
            }
          });

          const student = await db.student.findUnique({ where: { nisn } });
          if (student) {
            await db.parent.create({
              data: {
                userId: parentUser.id,
                studentId: student.id,
                relationship: 'Orang Tua',
              }
            });
          }
        }
      }

      imported++;
    } catch (err: any) {
      errors.push(`Error baris: ${err.message}`);
    }
  }

  return { imported, errors, schoolsCreated };
}

async function importUsers(rows: Record<string, any>[], scope: ImportScope) {
  let imported = 0;
  const actorSchoolId = scope.schoolId;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const username = String(row['Username'] || row['username'] || '').trim();
      const name = String(row['Nama'] || row['nama'] || '').trim();
      const role = String(row['Role'] || row['role'] || '').trim().toUpperCase().replace(/ /g, '_');
      const nip = String(row['NIP'] || row['nip'] || '').trim();
      const className = String(row['Nama Kelas'] || row['Kelas'] || '').trim();
      // Multi-tenant: Kode Sekolah (kosong = sekolah default / milik pengimpor).
      const schoolCode = String(row['Kode Sekolah'] || row['Kode'] || '').trim();

      if (!username || !name || !role) {
        errors.push('Baris dilewati: Username, Nama, atau Role kosong');
        continue;
      }

      // Validate role
      const validRoles = ['KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'ADMIN', 'GURU_JAGA', 'ORANG_TUA', 'SISWA'];
      const normalizedRole = validRoles.find(r => r === role || r.replace('_', ' ') === role);
      if (!normalizedRole) {
        errors.push(`${name}: Role "${role}" tidak valid`);
        continue;
      }
      if (normalizedRole === 'SUPER_ADMIN') {
        errors.push(`${name}: Role SUPER_ADMIN tidak dapat diimpor`);
        continue;
      }

      // Resolve school (multi-tenant). Empty school code -> the actor's school
      // (SUPER_ADMIN outside preview falls back to the first school by creation
      // order) so plain uploads keep working and never cross schools.
      let schoolId: string | null = null;
      if (schoolCode) {
        const school = await db.school.findUnique({ where: { code: schoolCode } });
        if (!school) {
          errors.push(`${name}: Kode sekolah "${schoolCode}" tidak ditemukan`);
          continue;
        }
        // Isolation, as in the student importer: a school-bound actor — including
        // a SUPER_ADMIN previewing a school — can only import into that school.
        if (scope.schoolId && school.id !== scope.schoolId) {
          errors.push(`${name}: Kode sekolah "${schoolCode}" milik sekolah lain`);
          continue;
        }
        schoolId = school.id;
      } else {
        schoolId = actorSchoolId ?? null;
        if (!schoolId && scope.isSuperAdmin) {
          const defaultSchool = await db.school.findFirst({ orderBy: { createdAt: 'asc' } });
          schoolId = defaultSchool ? defaultSchool.id : null;
        }
        if (!schoolId) {
          errors.push(`${name}: Akun ini tidak terhubung ke sekolah mana pun`);
          continue;
        }
      }

      // Check if user exists
      const existing = await db.user.findUnique({ where: { username } });
      if (existing) {
        // An import must not rewrite an account outside the actor's school: this
        // branch sets `role` and `schoolId` from a spreadsheet, so without the
        // check a bulk upload could re-role or re-home another tenant's user.
        if (scope.schoolId && existing.schoolId !== scope.schoolId) {
          errors.push(`${name}: Username "${username}" milik sekolah lain`);
          continue;
        }
        await db.user.update({
          where: { username },
          data: { name, role: normalizedRole, schoolId },
        });
        imported++;
        continue;
      }

      // Create user
      const hashedPw = await hashPassword(username + '123');
      const user = await db.user.create({
        data: {
          username,
          password: hashedPw,
          name,
          role: normalizedRole,
          schoolId,
        }
      });

      // Create teacher record for WALI_KELAS and GURU
      if (['WALI_KELAS', 'GURU'].includes(normalizedRole)) {
        await db.teacher.create({
          data: {
            userId: user.id,
            nip: nip || null,
          }
        });

        // If WALI_KELAS and className provided, assign as homeroom
        if (normalizedRole === 'WALI_KELAS' && className) {
          const cls = await db.class.findFirst({ where: { name: className } });
          if (cls) {
            await db.class.update({
              where: { id: cls.id },
              data: { homeroomTeacherId: user.id },
            });
          }
        }
      }

      imported++;
    } catch (err: any) {
      errors.push(`Error: ${err.message}`);
    }
  }

  return { imported, errors };
}

async function importViolationCategories(rows: Record<string, any>[]) {
  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const code = String(row['Kode'] || row['Code'] || row['code'] || '').trim();
      const name = String(row['Nama'] || row['Name'] || row['name'] || '').trim();
      const level = String(row['Level'] || row['level'] || 'RINGAN').trim().toUpperCase();
      const points = parseInt(String(row['Poin'] || row['Points'] || row['points'] || '10'));

      if (!code || !name) {
        errors.push('Baris dilewati: Kode atau Nama kosong');
        continue;
      }

      const validLevels = ['RINGAN', 'SEDANG', 'BERAT'];
      const normalizedLevel = validLevels.find(l => l === level) || 'RINGAN';

      await db.violationCategory.upsert({
        where: { code },
        update: { name, level: normalizedLevel, defaultPoints: points },
        create: { code, name, level: normalizedLevel, defaultPoints: points },
      });

      imported++;
    } catch (err: any) {
      errors.push(`Error: ${err.message}`);
    }
  }

  return { imported, errors };
}

async function importGoodDeedCategories(rows: Record<string, any>[]) {
  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const code = String(row['Kode'] || row['Code'] || row['code'] || '').trim();
      const name = String(row['Nama'] || row['Name'] || row['name'] || '').trim();
      const points = parseInt(String(row['Poin'] || row['Points'] || row['points'] || '10'));

      if (!code || !name) {
        errors.push('Baris dilewati: Kode atau Nama kosong');
        continue;
      }

      await db.goodDeedCategory.upsert({
        where: { code },
        update: { name, defaultPoints: points },
        create: { code, name, defaultPoints: points },
      });

      imported++;
    } catch (err: any) {
      errors.push(`Error: ${err.message}`);
    }
  }

  return { imported, errors };
}
