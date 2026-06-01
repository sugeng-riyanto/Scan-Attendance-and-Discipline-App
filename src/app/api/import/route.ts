import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, getAuthUser, requireRole } from '@/lib/auth-utils';
import { generateQRString } from '@/lib/qr-utils';
import * as XLSX from 'xlsx';

export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'VP_KESISWAAN'])) {
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

    switch (type) {
      case 'students':
        const result = await importStudents(rows, classId, academicYearId);
        imported = result.imported;
        errors = result.errors;
        break;
      case 'users':
        const userResult = await importUsers(rows);
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

    return NextResponse.json({
      message: `Berhasil import ${imported} data`,
      imported,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({ error: 'Gagal mengimport data: ' + error.message }, { status: 500 });
  }
}

async function importStudents(rows: Record<string, any>[], classId?: string, academicYearId?: string) {
  let imported = 0;
  const errors: string[] = [];

  // Get active academic year if not provided
  let activeYear = academicYearId;
  if (!activeYear) {
    const year = await db.academicYear.findFirst({ where: { isActive: true } });
    if (year) activeYear = year.id;
    else {
      errors.push('Tidak ada tahun ajaran aktif');
      return { imported, errors };
    }
  }

  for (const row of rows) {
    try {
      const nisn = String(row['NISN'] || row['nisn'] || '').trim();
      const name = String(row['Nama Siswa'] || row['Nama'] || row['nama'] || '').trim();
      const className = String(row['Kelas'] || row['kelas'] || '').trim();
      const gender = String(row['Jenis Kelamin'] || row['Gender'] || row['gender'] || '').trim();
      const parentName = String(row['Nama Orang Tua'] || row['Orang Tua'] || row['ortu'] || '').trim();
      const address = String(row['Alamat'] || row['alamat'] || '').trim();
      const email = String(row['Email'] || row['email'] || '').trim();
      const phone = String(row['No HP'] || row['Phone'] || row['phone'] || '').trim();

      if (!nisn || !name) {
        errors.push(`Baris dilewati: NISN atau Nama kosong`);
        continue;
      }

      // Find or create class
      let studentClassId = classId;
      if (!studentClassId && className) {
        const existingClass = await db.class.findFirst({
          where: { name: className, academicYearId: activeYear }
        });
        if (existingClass) {
          studentClassId = existingClass.id;
        } else {
          // Auto-create class
          const level = className.match(/^\d+/)?.[0] || '7';
          const newClass = await db.class.create({
            data: {
              name: className,
              level: parseInt(level) <= 9 ? 'SMP' : 'SMA',
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
        }
      });

      // Create student
      const qrCode = generateQRString(nisn);
      await db.student.create({
        data: {
          nisn,
          name,
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

  return { imported, errors };
}

async function importUsers(rows: Record<string, any>[]) {
  let imported = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const username = String(row['Username'] || row['username'] || '').trim();
      const name = String(row['Nama'] || row['nama'] || '').trim();
      const role = String(row['Role'] || row['role'] || '').trim().toUpperCase().replace(/ /g, '_');
      const nip = String(row['NIP'] || row['nip'] || '').trim();
      const className = String(row['Nama Kelas'] || row['Kelas'] || '').trim();

      if (!username || !name || !role) {
        errors.push('Baris dilewati: Username, Nama, atau Role kosong');
        continue;
      }

      // Validate role
      const validRoles = ['KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'ADMIN'];
      const normalizedRole = validRoles.find(r => r === role || r.replace('_', ' ') === role);
      if (!normalizedRole) {
        errors.push(`${name}: Role "${role}" tidak valid`);
        continue;
      }

      // Check if user exists
      const existing = await db.user.findUnique({ where: { username } });
      if (existing) {
        await db.user.update({
          where: { username },
          data: { name, role: normalizedRole },
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
