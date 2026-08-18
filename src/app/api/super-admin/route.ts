import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { getAuthUser, requireRole, hashPassword } from '@/lib/auth-utils';
import { logAudit } from '@/lib/audit';

// SUPER_ADMIN only — multi-school management (sekolah + langganan + pengguna RBAC).
function isSuperAdmin(request: NextRequest): string | null {
  const auth = getAuthUser(request);
  if (!auth) return null;
  if (!requireRole(auth.role, ['SUPER_ADMIN'])) return 'forbidden';
  return auth.userId;
}

function cleanSchool(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

// GET /api/super-admin?resource=schools|users|subscriptions
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['SUPER_ADMIN'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const resource = searchParams.get('resource') || 'schools';      if (resource === 'schools') {
        const schools = await db.school.findMany({
        orderBy: { createdAt: 'asc' },
        include: {
          subscriptions: true,
          _count: { select: { users: true, classes: true } },
        },
      });
      return NextResponse.json({ schools });
    }

    if (resource === 'users') {
      const schoolId = searchParams.get('schoolId');
      const users = await db.user.findMany({
        where: { schoolId: schoolId || undefined },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true, username: true, name: true, role: true, schoolId: true,
          isActive: true, email: true, createdAt: true,
        },
      });
      return NextResponse.json({ users });
    }

    if (resource === 'subscriptions') {
      const subs = await db.subscription.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { school: { select: { id: true, name: true, code: true, isActive: true } } },
      });

      // Renewal summary for the Super Admin dashboard: how many renewals
      // happened in the selected calendar year + the most recent one (who/when/where).
      // `year` defaults to the current year; `availableYears` lists every year with
      // renewals (plus the current year) so the UI can offer a year picker.
      const renewals = await db.auditLog.findMany({
        where: { action: 'SUBSCRIPTION_RENEW' },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        select: { id: true, username: true, role: true, schoolId: true, createdAt: true },
      });
      const currentYear = new Date().getFullYear();
      const yearParam = parseInt(searchParams.get('year') || '', 10);
      const year = !isNaN(yearParam) && yearParam >= 2000 && yearParam <= currentYear ? yearParam : currentYear;
      // Offer every year from the earliest renewal (or 4 years back) to the current one,
      // so staff can also see years with zero renewals.
      const earliestRenewalYear = renewals.length > 0
        ? Math.min(...renewals.map(r => new Date(r.createdAt).getFullYear()))
        : currentYear;
      const minYear = Math.max(2000, Math.min(earliestRenewalYear, currentYear - 4));
      const availableYears: number[] = [];
      for (let y = currentYear; y >= minYear; y--) availableYears.push(y);
      const yearStart = new Date(year, 0, 1);
      const yearEnd = new Date(year + 1, 0, 1);
      const inYear = renewals.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return t >= yearStart.getTime() && t < yearEnd.getTime();
      });
      let last = null;
      if (inYear.length > 0) {
        const r = inYear[0];
        const school = r.schoolId
          ? await db.school.findUnique({ where: { id: r.schoolId }, select: { name: true, code: true } })
          : null;
        last = { username: r.username, role: r.role, schoolId: r.schoolId, schoolName: school?.name || null, schoolCode: school?.code || null, createdAt: r.createdAt };
      }
      return NextResponse.json({ subscriptions: subs, renewalSummary: { year, count: inYear.length, last, availableYears } });
    }

    return NextResponse.json({ error: 'Resource tidak dikenal' }, { status: 400 });
  } catch (error: any) {
    console.error('Super admin GET error:', error);
    return NextResponse.json({ error: 'Gagal mengambil data: ' + error.message }, { status: 500 });
  }
}

// POST /api/super-admin — { resource, action, ...payload }
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['SUPER_ADMIN'])) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const resource = body.resource;
    const action = body.action || 'create';
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    // ---- Schools ----
    if (resource === 'schools') {
      if (action === 'create' || action === 'update') {
        const { id, code, name, address, domain, logo, headerImage, themeColor, description, vision, mission, phone, email, hasJhs, hasShs, jhsStart, jhsEnd, shsStart, shsEnd, templateFromSchoolId } = body;
        if (!code || !name) return NextResponse.json({ error: 'Kode dan nama sekolah wajib diisi' }, { status: 400 });
        const existing = await db.school.findUnique({ where: { code } });
        if (action === 'create' && existing) {
          return NextResponse.json({ error: `Kode sekolah "${code}" sudah dipakai` }, { status: 409 });
        }
        // A school's dedicated subdomain (hostname routing) is unique too.
        const domainValue = domain ? String(domain).trim().toLowerCase() : null;
        if (domainValue) {
          const domainTaken = await db.school.findUnique({ where: { domain: domainValue } });
          if (domainTaken && domainTaken.id !== id) {
            return NextResponse.json({ error: `Domain "${domainValue}" sudah dipakai sekolah lain` }, { status: 409 });
          }
        }
        // Validate schedule times (HH:mm) and theme color before saving.
        const times: Record<string, unknown> = { jhsStart, jhsEnd, shsStart, shsEnd };
        for (const [key, value] of Object.entries(times)) {
          if (value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) {
            return NextResponse.json({ error: `Format jam ${key} tidak valid (gunakan HH:mm)` }, { status: 400 });
          }
        }
        if (themeColor && !/^#[0-9a-fA-F]{3,8}$/.test(String(themeColor))) {
          return NextResponse.json({ error: 'Format warna tema tidak valid' }, { status: 400 });
        }
        // Only touch fields the client actually sends, so a partial update
        // never wipes the school's other profile data.
        const data: Prisma.SchoolUncheckedCreateInput = { code, name };
        if (address !== undefined) data.address = cleanSchool(address);
        if (domain !== undefined) data.domain = domainValue;
        if (logo !== undefined) data.logo = cleanSchool(logo);
        if (headerImage !== undefined) data.headerImage = cleanSchool(headerImage);
        if (themeColor !== undefined) data.themeColor = cleanSchool(themeColor);
        if (description !== undefined) data.description = cleanSchool(description);
        if (vision !== undefined) data.vision = cleanSchool(vision);
        if (mission !== undefined) data.mission = cleanSchool(mission);
        if (phone !== undefined) data.phone = cleanSchool(phone);
        if (email !== undefined) data.email = cleanSchool(email);
        if (hasJhs !== undefined) data.hasJhs = hasJhs !== false;
        if (hasShs !== undefined) data.hasShs = hasShs !== false;
        if (jhsStart !== undefined) data.jhsStart = cleanSchool(jhsStart);
        if (jhsEnd !== undefined) data.jhsEnd = cleanSchool(jhsEnd);
        if (shsStart !== undefined) data.shsStart = cleanSchool(shsStart);
        if (shsEnd !== undefined) data.shsEnd = cleanSchool(shsEnd);
        const school = action === 'create'
          ? await db.school.create({ data })
          : await db.school.update({ where: { id }, data });
        let template: { classesCopied: number; violationCategories: number; goodDeedCategories: number; templateName?: string } | null = null;
        if (action === 'create') {
          // New school gets a TRIAL subscription by default
          const periodStart = new Date();
          const periodEnd = new Date();
          periodEnd.setDate(periodEnd.getDate() + 30);
          await db.subscription.create({
            data: { schoolId: school.id, plan: 'YEARLY', status: 'TRIAL', periodStart, periodEnd, notes: 'Masa percobaan 30 hari' },
          });

          // Copy-as-template: clone the source school's classes (per-school
          // data) into the new school. Violation/good-deed categories are
          // GLOBAL (no schoolId) — every school already shares the same set,
          // so nothing to clone there; we only report their counts.
          if (templateFromSchoolId) {
            const src = await db.school.findUnique({ where: { id: templateFromSchoolId }, select: { id: true, name: true } });
            if (!src) return NextResponse.json({ error: 'Sekolah template tidak ditemukan' }, { status: 400 });
            const srcClasses = await db.class.findMany({
              where: { schoolId: templateFromSchoolId },
              select: { name: true, level: true, academicYearId: true },
            });
            const seen = new Set<string>();
            const rows: Prisma.ClassCreateManyInput[] = [];
            for (const c of srcClasses) {
              const key = `${c.name}|${c.level}`;
              if (seen.has(key)) continue;
              seen.add(key);
              rows.push({ name: c.name, level: c.level, academicYearId: c.academicYearId, schoolId: school.id });
            }
            if (rows.length) await db.class.createMany({ data: rows });
            const [vCount, gCount] = await Promise.all([
              db.violationCategory.count(),
              db.goodDeedCategory.count(),
            ]);
            template = { classesCopied: rows.length, violationCategories: vCount, goodDeedCategories: gCount, templateName: src.name };
          }
        }
        const auditDetails = action === 'create'
          ? `Sekolah baru: ${name} (${code})` + (template ? ` — disalin dari template "${template.templateName}": ${template.classesCopied} kelas` : '')
          : `Perbarui sekolah: ${name} (${code})`;
        await logAudit({ action: action === 'create' ? 'SCHOOL_CREATE' : 'SCHOOL_UPDATE', category: 'SETTINGS', severity: 'INFO', userId: auth.userId, username: auth.username, role: auth.role, ip, details: auditDetails });
        return NextResponse.json({ message: action === 'create' ? 'Sekolah dibuat' : 'Sekolah diperbarui', school, template });
      }
      if (action === 'delete') {
        const { id } = body;
        // Clean up dependent records first (schoolId columns are SetNull by
        // default, so a bare school.delete would orphan students/classes/users).
        const school = await db.school.findUnique({ where: { id }, select: { code: true, name: true } });
        const studentIds = await db.student.findMany({ where: { schoolId: id }, select: { id: true } });
        await db.attendance.deleteMany({ where: { studentId: { in: studentIds.map(s => s.id) } } });
        await db.violation.deleteMany({ where: { studentId: { in: studentIds.map(s => s.id) } } });
        await db.goodDeed.deleteMany({ where: { studentId: { in: studentIds.map(s => s.id) } } });
        await db.permission.deleteMany({ where: { studentId: { in: studentIds.map(s => s.id) } } });
        await db.behaviorAlert.deleteMany({ where: { studentId: { in: studentIds.map(s => s.id) } } });
        await db.faceReference.deleteMany({ where: { studentId: { in: studentIds.map(s => s.id) } } });
        await db.parent.deleteMany({ where: { studentId: { in: studentIds.map(s => s.id) } } });
        await db.student.deleteMany({ where: { schoolId: id } });
        await db.class.deleteMany({ where: { schoolId: id } });
        // Users bound to the school (Admin/Kepsek/Guru/...): remove dependent
        // records then the user itself. SUPER_ADMIN users are never school-bound.
        const schoolUsers = await db.user.findMany({ where: { schoolId: id }, select: { id: true } });
        for (const u of schoolUsers) {
          await db.teacher.deleteMany({ where: { userId: u.id } });
          await db.parent.deleteMany({ where: { userId: u.id } });
          await db.student.deleteMany({ where: { userId: u.id } });
        }
        await db.user.deleteMany({ where: { schoolId: id } });
        await db.school.delete({ where: { id } });
        await logAudit({ action: 'SCHOOL_DELETE', category: 'SETTINGS', severity: 'WARNING', userId: auth.userId, username: auth.username, role: auth.role, ip, details: `Hapus sekolah ${school?.code || id} (${school?.name || ''}) + seluruh datanya` });
        return NextResponse.json({ message: 'Sekolah dan seluruh datanya dihapus' });
      }
      if (action === 'toggle') {
        const { id, isActive } = body;
        await db.school.update({ where: { id }, data: { isActive: !!isActive } });
        return NextResponse.json({ message: isActive ? 'Sekolah diaktifkan' : 'Sekolah dinonaktifkan' });
      }
    }

    // ---- Users (per-school RBAC) ----
    if (resource === 'users') {
      const VALID_ROLES = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA', 'ORANG_TUA', 'SISWA'];
      if (action === 'create' || action === 'update') {
        const { id, username, password, name, role, schoolId, email } = body;
        if (!username || !name || !role) return NextResponse.json({ error: 'Username, nama, dan role wajib diisi' }, { status: 400 });
        if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: `Role "${role}" tidak valid` }, { status: 400 });
        if (role === 'SUPER_ADMIN') {
          return NextResponse.json({ error: 'Akun SUPER_ADMIN tidak dapat dibuat di sini — gunakan seeder/DB' }, { status: 400 });
        }
        if (action === 'create' && !schoolId) return NextResponse.json({ error: 'Pilih sekolah untuk pengguna baru' }, { status: 400 });
        if (action === 'create') {
          const existing = await db.user.findUnique({ where: { username } });
          if (existing) return NextResponse.json({ error: `Username "${username}" sudah dipakai` }, { status: 409 });
          await db.user.create({
            data: {
              username, name, role, schoolId: schoolId || null, email: email || null,
              password: hashPassword(password || username + '123'),
            },
          });
          await logAudit({ action: 'USER_CREATE', category: 'ACCOUNT', severity: 'INFO', userId: auth.userId, username: auth.username, role: auth.role, ip, details: `Pengguna baru ${username} (${role})` });
          return NextResponse.json({ message: 'Pengguna dibuat' });
        }
        await db.user.update({
          where: { id },
          data: { username, name, role, schoolId: schoolId || null, email: email || null, ...(password ? { password: hashPassword(password) } : {}) },
        });
        await logAudit({ action: 'USER_UPDATE', category: 'ACCOUNT', severity: 'INFO', userId: auth.userId, username: auth.username, role: auth.role, ip, details: `Perbarui pengguna ${username}` });
        return NextResponse.json({ message: 'Pengguna diperbarui' });
      }
      if (action === 'delete') {
        const { id } = body;
        const target = await db.user.findUnique({ where: { id } });
        if (target?.role === 'SUPER_ADMIN') return NextResponse.json({ error: 'Tidak dapat menghapus akun SUPER_ADMIN' }, { status: 400 });
        // Remove dependent records first (Teacher/Student/Parent reference User).
        await db.teacher.deleteMany({ where: { userId: id } });
        await db.parent.deleteMany({ where: { userId: id } });
        const student = await db.student.findUnique({ where: { userId: id } });
        if (student) {
          await db.faceReference.deleteMany({ where: { studentId: student.id } });
          await db.attendance.deleteMany({ where: { studentId: student.id } });
          await db.violation.deleteMany({ where: { studentId: student.id } });
          await db.goodDeed.deleteMany({ where: { studentId: student.id } });
          await db.permission.deleteMany({ where: { studentId: student.id } });
          await db.behaviorAlert.deleteMany({ where: { studentId: student.id } });
          await db.student.delete({ where: { id: student.id } });
        }
        await db.user.delete({ where: { id } });
        await logAudit({ action: 'USER_DELETE', category: 'ACCOUNT', severity: 'WARNING', userId: auth.userId, username: auth.username, role: auth.role, ip, details: `Hapus pengguna ${target?.username || id}` });
        return NextResponse.json({ message: 'Pengguna dihapus' });
      }
      if (action === 'toggle') {
        const { id, isActive } = body;
        const target = await db.user.findUnique({ where: { id } });
        if (target?.role === 'SUPER_ADMIN') return NextResponse.json({ error: 'Tidak dapat menonaktifkan akun SUPER_ADMIN' }, { status: 400 });
        await db.user.update({ where: { id }, data: { isActive: !!isActive } });
        return NextResponse.json({ message: isActive ? 'Pengguna diaktifkan' : 'Pengguna dinonaktifkan' });
      }
    }

    // ---- Subscriptions (langganan yearly) ----
    if (resource === 'subscriptions') {
      if (action === 'upsert') {
        const { schoolId, status, periodStart, periodEnd, price, notes } = body;
        if (!schoolId) return NextResponse.json({ error: 'Pilih sekolah' }, { status: 400 });
        const data: any = { status: status || 'ACTIVE', plan: 'YEARLY', notes: notes || null };
        if (price !== undefined && price !== null) data.price = Number(price) || 0;
        if (periodStart) data.periodStart = new Date(periodStart);
        if (periodEnd) data.periodEnd = new Date(periodEnd);
        const sub = await db.subscription.upsert({ where: { schoolId }, update: data, create: { schoolId, ...data } });
        await logAudit({ action: 'SUBSCRIPTION_UPDATE', category: 'SETTINGS', severity: status === 'ACTIVE' ? 'INFO' : 'WARNING', userId: auth.userId, username: auth.username, role: auth.role, ip, schoolId, details: `Langganan sekolah ${sub.id}: ${status}` });
        return NextResponse.json({ message: 'Langganan diperbarui', subscription: sub });
      }
      if (action === 'renew') {
        // Quick 1-year renewal straight from the Sekolah table: extends from
        // the current periodEnd (or from now if it already lapsed), ACTIVE.
        const { schoolId } = body;
        if (!schoolId) return NextResponse.json({ error: 'Pilih sekolah' }, { status: 400 });
        const existing = await db.subscription.findUnique({ where: { schoolId } });
        const now = new Date();
        const base = existing?.periodEnd && existing.periodEnd > now ? existing.periodEnd : now;
        const periodEnd = new Date(base);
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        const sub = await db.subscription.upsert({
          where: { schoolId },
          update: { status: 'ACTIVE', periodStart: existing?.periodStart ?? now, periodEnd, notes: 'Langganan diperpanjang 1 tahun' },
          create: { schoolId, plan: 'YEARLY', status: 'ACTIVE', periodStart: now, periodEnd, notes: 'Langganan diperpanjang 1 tahun' },
        });
        await logAudit({ action: 'SUBSCRIPTION_RENEW', category: 'SETTINGS', severity: 'INFO', userId: auth.userId, username: auth.username, role: auth.role, ip, schoolId, details: `Perpanjang langganan sekolah ${schoolId} hingga ${periodEnd.toISOString().slice(0, 10)}` });
        return NextResponse.json({ message: 'Langganan diperpanjang 1 tahun', subscription: sub });
      }
      if (action === 'activate' || action === 'deactivate') {
        const { schoolId } = body;
        const status = action === 'activate' ? 'ACTIVE' : 'INACTIVE';
        let data: any = { status };
        if (action === 'activate') {
          const periodStart = new Date();
          const periodEnd = new Date();
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          data.periodStart = periodStart;
          data.periodEnd = periodEnd;
        }
        const sub = await db.subscription.upsert({ where: { schoolId }, update: data, create: { schoolId, status, plan: 'YEARLY' } });
        await logAudit({ action: action === 'activate' ? 'SUBSCRIPTION_ACTIVATE' : 'SUBSCRIPTION_DEACTIVATE', category: 'SETTINGS', severity: action === 'activate' ? 'INFO' : 'WARNING', userId: auth.userId, username: auth.username, role: auth.role, ip, schoolId, details: `Langganan ${status} untuk sekolah ${schoolId}` });
        return NextResponse.json({ message: status === 'ACTIVE' ? 'Langganan diaktifkan (1 tahun)' : 'Langganan dinonaktifkan', subscription: sub });
      }
    }

    return NextResponse.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
  } catch (error: any) {
    console.error('Super admin POST error:', error);
    return NextResponse.json({ error: 'Gagal memproses: ' + error.message }, { status: 500 });
  }
}
