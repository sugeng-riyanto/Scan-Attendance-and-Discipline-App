'use client'

import React from 'react'
import { AuthUser } from '@/lib/stores/auth-store'
import { roleLabels } from '@/lib/attendance-utils'
import { ScrollText, ShieldCheck, Lock, KeyRound, AlertTriangle, FileText } from 'lucide-react'

const ROLE_DATA_NOTE: Record<string, string> = {
  ADMIN: 'Sebagai Admin, Anda mengelola data master, akun pengguna, dan seluruh laporan. Akses Anda mencakup data siswa, guru, dan orang tua.',
  KEPALA_SEKOLAH: 'Sebagai Kepala Sekolah, Anda hanya melihat rekap dan statistik untuk pengambilan keputusan. Data detail siswa tidak Anda kelola.',
  VP_KESISWAAN: 'Sebagai Wakil Kepala Sekolah Bidang Kesiswaan, Anda menangani catatan pelanggaran, pola disiplin, dan jadwal guru jaga.',
  WALI_KELAS: 'Sebagai Wali Kelas, Anda mengelola presensi, izin, dan catatan perilaku siswa pada kelas yang Anda bimbing.',
  GURU: 'Sebagai Guru, Anda mencatat presensi dan perilaku siswa pada jam mengajar Anda.',
  GURU_JAGA: 'Sebagai Guru Jaga, Anda menjalankan sesi pemindaian presensi dan memantau kedatangan siswa.',
  ORANG_TUA: 'Sebagai Orang Tua, Anda hanya melihat data anak Anda sendiri, termasuk izin dan kehadiran.',
  SISWA: 'Sebagai Siswa, Anda hanya melihat data kehadiran dan perilaku Anda sendiri.',
}

export function TermsPage({ user, publicView }: { user: AuthUser; publicView?: boolean }) {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
          <ScrollText className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Terms and Conditions of Use</h2>
          <p className="text-xs text-muted-foreground">
            {publicView
              ? 'Applies to: All users (Administrator, Teacher, Parent, and Student)'
              : `Applies to: ${roleLabels[user.role] || user.role}`}
          </p>
        </div>
      </div>

      {/* Role-specific note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
        <p className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          {publicView
            ? 'Setiap pengguna hanya dapat melihat dan mengelola data sesuai perannya. Data siswa adalah data anak yang dilindungi undang-undang dan hanya diproses untuk kepentingan pendidikan.'
            : (ROLE_DATA_NOTE[user.role] || 'Akses Anda dibatasi sesuai peran yang ditetapkan sekolah.')}
        </p>
      </div>

      <section className="rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><FileText className="h-4 w-4" /> 1. Dasar Hukum</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          Aplikasi ini mengikuti <strong>Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi</strong> (UU PDP)
          dan <strong>Undang-Undang Nomor 35 Tahun 2014 tentang Perlindungan Anak</strong>, yaitu perubahan atas
          Undang-Undang Nomor 23 Tahun 2002 tentang Perlindungan Anak.
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2">
          Data siswa adalah data anak yang dilindungi secara khusus. Pemrosesan data anak hanya dilakukan dengan
          persetujuan orang tua atau wali, dan hanya untuk kepentingan pendidikan serta kedisiplinan di sekolah.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><KeyRound className="h-4 w-4" /> 2. Data yang Dikumpulkan</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          Sekolah hanya mengumpulkan data yang diperlukan, antara lain: identitas siswa (nama, NISN, kelas),
          data kehadiran, catatan pelanggaran dan kebaikan, foto wajah untuk verifikasi kehadiran, serta lokasi
          saat pemindaian. Prinsip yang digunakan adalah <strong>data minimal</strong>: tidak ada data yang
          dikumpulkan tanpa keperluan yang jelas.
        </p>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><Lock className="h-4 w-4" /> 3. Cara Data Dikelola</h3>
        <ul className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed list-disc pl-5 space-y-1.5">
          <li>Data disimpan pada server milik sekolah dan dijaga dengan kata sandi serta pembatasan akses.</li>
          <li>Setiap pengguna hanya dapat melihat data sesuai perannya (Admin, Kepala Sekolah, Guru, dan lainnya).</li>
          <li>Kata sandi akun disimpan dalam bentuk terenkripsi dan tidak dapat dibaca siapa pun.</li>
          <li>Foto wajah hanya digunakan untuk verifikasi kehadiran dan tidak disebarluaskan.</li>
          <li>Data tidak dijual, ditukarkan, atau diserahkan kepada pihak lain tanpa persetujuan, kecuali diwajibkan hukum.</li>
        </ul>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm dark:bg-gray-900 dark:border-gray-800">
        <h3 className="font-semibold mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> 4. Hak Anda</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          Anda berhak meminta informasi tentang data yang tersimpan, memperbaiki data yang keliru, dan meminta
          penghapusan data sesuai ketentuan. Untuk data siswa, hak tersebut dijalankan oleh orang tua atau wali
          melalui pihak sekolah.
        </p>
      </section>

      <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/40">
        <h3 className="font-semibold mb-2 flex items-center gap-2 text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> 5. Jika Terjadi Kebocoran Data</h3>
        <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed">
          Apabila terjadi kebocoran data, sekolah akan bertindak dengan langkah berikut:
        </p>
        <ul className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed list-disc pl-5 mt-2 space-y-1.5">
          <li>Mengamankan sistem secepatnya agar kebocoran tidak meluas.</li>
          <li>Menyelidiki penyebab dan menilai data yang terdampak.</li>
          <li>Memberi tahu pengguna, orang tua, atau wali yang terdampak paling lambat 3×24 jam, serta melaporkan kepada lembaga yang berwenang sesuai UU PDP.</li>
          <li>Memperbaiki kelemahan agar kejadian serupa tidak terulang.</li>
        </ul>
        <p className="text-sm text-amber-900 dark:text-amber-200 leading-relaxed mt-2">
          Pengguna juga wajib menjaga kerahasiaan akunnya. Setiap aktivitas yang dilakukan dengan akun Anda
          menjadi tanggung jawab Anda.
        </p>
      </section>

      <p className="text-xs text-muted-foreground">
        Ketentuan ini dapat diperbarui sewaktu-waktu. Perubahan akan diumumkan melalui aplikasi ini.
      </p>
    </div>
  )
}
