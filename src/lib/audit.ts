import { db } from '@/lib/db'

// Immutable trail of sensitive events so Admin & Kepala Sekolah can monitor
// users and detect unusual activity (per UU PDP No. 27/2022 and the T&C the
// app declares). Severity: INFO (routine), WARNING (suspicious/failed),
// CRITICAL (breach / data exposure). `level` ties the event to a jenjang
// (JHS | SHS) when relevant.

export type AuditSeverity = 'INFO' | 'WARNING' | 'CRITICAL'

export interface AuditEntry {
  action: string
  category: string
  severity?: AuditSeverity
  level?: 'JHS' | 'SHS' | null
  schoolId?: string | null // school the event relates to (e.g. subscription renewals)
  details?: string
  userId?: string | null
  username?: string | null
  role?: string | null
  ip?: string | null
}

export async function logAudit(entry: AuditEntry) {
  try {
    await db.auditLog.create({
      data: {
        action: entry.action,
        category: entry.category,
        severity: entry.severity || 'INFO',
        level: entry.level ?? null,
        schoolId: entry.schoolId ?? null,
        details: entry.details?.slice(0, 2000) || null,
        userId: entry.userId ?? null,
        username: entry.username ?? null,
        role: entry.role ?? null,
        ip: entry.ip?.slice(0, 64) || null,
      },
    })
  } catch (err) {
    // Audit logging must never break the main flow.
    console.error('Audit log write failed:', err)
  }
}

/** Suggested solution / next step shown next to each log category. */
export const AUDIT_SOLUTIONS: Record<string, string> = {
  AUTH: 'Verifikasi identitas pengguna. Jika login gagal berulang, aktifkan autentikasi PIN atau reset kata sandi pengguna.',
  ACCOUNT: 'Konfirmasi perubahan akun bersama pemilik akun. Perubahan PIN/email/kata sandi tercatat sebagai jejak audit.',
  EXPORT: 'Data pribadi siswa hanya boleh diekspor untuk keperluan resmi. Periksa siapa yang mengakses dan pastikan izin sesuai RBAC (UU PDP).',
  IMPORT: 'Pastikan file unggahan berasal dari sumber tepercaya dan sesuai jenjang (JHS/SHS). Periksa hasil import untuk data duplikat.',
  SETTINGS: 'Perubahan konfigurasi sekolah dicatat. Tinjau perubahan mencurigakan terhadap jam kepulangan, zona waktu, atau data sekolah.',
  DATA: 'Perubahan data besar (reset/seeding) memengaruhi seluruh pengguna. Konfirmasi bahwa operasi ini memang diminta oleh Admin.',
  BREACH: 'Ikuti runbook kebocoran data: amankan sistem, investigasi, beri tahu pihak terdampak dalam 3x24 jam, laporkan ke pihak berwenang, lalu perbaiki kerentanannya.',
  SYSTEM: 'Pantau kesehatan sistem. Error berulang pada satu endpoint dapat menandakan percobaan akses tidak wajar.',
}

/** Human label per audit category. */
export const AUDIT_CATEGORY_LABELS: Record<string, string> = {
  AUTH: 'Autentikasi',
  ACCOUNT: 'Akun',
  EXPORT: 'Ekspor Data',
  IMPORT: 'Impor Data',
  SETTINGS: 'Pengaturan',
  DATA: 'Data',
  BREACH: 'Kebocoran Data',
  SYSTEM: 'Sistem',
}
