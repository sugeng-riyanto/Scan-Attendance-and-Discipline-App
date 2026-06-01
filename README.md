# Presensi Nusantara 2

Aplikasi presensi sekolah berbasis web dengan dukungan **QR Code**, **Face Recognition**, dan **Manajemen Kedisiplinan**. Mendukung 8 level pengguna dengan hak akses berbeda.

## Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 🎯 **Presensi QR & Face** | Scan QR Code atau Face Recognition untuk absensi harian |
| 📋 **Pelanggaran & Kebaikan** | Catat poin pelanggaran dan kebaikan siswa |
| 📱 **Scan Kedisiplinan** | Halaman khusus untuk mencatat pelanggaran/kebaikan dengan QR/Nama/Wajah |
| 📊 **Statistik Lengkap** | Statistik harian, mingguan, bulanan, 3/4 bulan, 1 semester, 1 tahun |
| 🪪 **ID Card Digital** | Download ID Card siswa dalam format SVG & PDF |
| 📄 **Dokumen Sekolah** | Upload & publikasi Buku Panduan, Kalender Akademik, Surat Informasi |
| 👨‍👩‍👧‍👦 **Multi Role** | 8 role: Admin, Kepsek, VP Kesiswaan, Wali Kelas, Guru, Guru Jaga, Siswa, Orang Tua |
| 📤 **Export Data** | Export rekap ke Excel/PDF |

## Tech Stack

| Teknologi | Versi |
|-----------|-------|
| **Frontend** | Next.js 16 (App Router), React 19, Tailwind CSS v4, shadcn/ui |
| **Backend** | Next.js API Routes (REST) |
| **Database** | PostgreSQL |
| **ORM** | Prisma |
| **Auth** | JWT + HttpOnly Cookies + bcrypt |
| **Face Recognition** | @vladmandic/face-api (TensorFlow.js) |
| **QR Code** | @yudiel/react-qr-scanner + qrcode |

## Panduan Instalasi

### Prasyarat
- Node.js 18+
- PostgreSQL 14+
- NPM atau Yarn

### Langkah Instalasi

```bash
# 1. Clone repository
git clone <repo-url> presensi-nusantara2
cd presensi-nusantara2

# 2. Install dependencies
npm install

# 3. Setup database PostgreSQL
psql -U postgres -c "CREATE DATABASE presensi_nusantara;"

# 4. Copy environment variables
cp .env.example .env
# Edit .env: DATABASE_URL, JWT_SECRET, NEXT_PUBLIC_APP_URL

# 5. Jalankan migrasi database
npx prisma migrate deploy

# 6. Build & Jalankan
npm run build
npm start
```

### Setup Awal
1. Buka `http://localhost:3000`
2. Klik tombol **"Setup Database"** untuk mengisi data demo
3. Login dengan akun demo

## Akun Demo

| Role | Username | Password |
|------|----------|----------|
| 🛡️ Admin | `admin` | `admin123` |
| 📊 Kepala Sekolah | `kepsek` | `kepsek123` |
| 📋 VP Kesiswaan | `vpkes` | `vpkes123` |
| 👨‍🏫 Wali Kelas | `wali7a` | `wali123` |
| 👩‍🏫 Guru | `guru1` | `guru123` |
| 🚪 Guru Jaga | `jaga1` | `jaga123` |
| 👨‍👩‍👧 Orang Tua | `ortu1` | `ortu123` |
| 🧑‍🎓 Siswa | `siswa1` | `siswa123` |

## Role & Hak Akses

### Ringkasan Menu per Role

| Menu | Admin | Kepsek | VP Kes | Wali Kelas | Guru | Guru Jaga | Siswa | Ortu |
|------|-------|--------|--------|-----------|------|-----------|-------|------|
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Monitor Presensi | ✅ | - | - | - | - | ✅ | - | - |
| Presensi (Scanner) | ✅ | - | ✅ | ✅ | ✅ | ✅ | - | - |
| Rekap Presensi | ✅ | ✅ | ✅ | ✅ | ✅ | - | - | - |
| Izin | - | - | ✅ | ✅ | - | - | - | ✅ |
| Pelanggaran | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | - |
| Kebaikan | ✅ | - | ✅ | ✅ | ✅ | - | - | - |
| Pola Disiplin | ✅ | ✅ | ✅ | ✅ | ✅ | - | - | - |
| Statistik | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Scan Kedisiplinan | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | - | - |
| Export | ✅ | ✅ | ✅ | ✅ | - | ✅ | - | - |
| ID Card | ✅ | - | ✅ | ✅ | - | - | ✅ | - |
| Capture Wajah | ✅ | - | - | - | - | - | - | - |
| Dokumen Sekolah | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Pengaturan | ✅ | - | ✅ | - | - | - | - | - |

## API Endpoints

Semua endpoint REST API di `/api/*` dilindungi JWT (kecuali `/api/auth` login dan `/api/setup`).

### Auth
- `POST /api/auth` — Login
- `GET /api/auth` — Cek user saat ini
- `DELETE /api/auth` — Logout

### Data Master
- `GET/POST/PUT/DELETE /api/students` — CRUD Siswa
- `GET/POST/PUT/DELETE /api/classes` — CRUD Kelas
- `GET/POST /api/academic-years` — Tahun Ajaran
- `GET/POST/PUT/DELETE /api/users` — CRUD User

### Presensi
- `GET/POST/PUT /api/attendance` — Data absensi
- `POST /api/attendance/checkin` — Check-in (publik)
- `POST /api/attendance/checkout` — Check-out (publik)

### Kedisiplinan
- `GET/POST/DELETE /api/violations` — Pelanggaran
- `GET/POST/DELETE /api/good-deeds` — Kebaikan
- `GET/POST/PUT/DELETE /api/categories` — Kategori
- `GET/POST/PUT/DELETE /api/permissions` — Izin

### Face Recognition
- `GET/POST/DELETE /api/face-references` — Referensi wajah
- `POST /api/face-verify` — Verifikasi wajah
- `GET/POST /api/face-accuracy` — Uji akurasi

### Laporan
- `GET /api/statistics` — Statistik (multi periode)
- `GET /api/export` — Export Excel
- `GET /api/export-pdf` — Export PDF

### Dokumen
- `GET/POST/PUT/DELETE /api/school-documents` — Dokumen sekolah

### Lainnya
- `GET /api/school-config` — Konfigurasi sekolah (publik)
- `GET/POST /api/scan-session` — Sesi scan
- `POST /api/public-scan` — Scan publik (kiosk)
- `POST /api/setup` — Seeder database

## Halaman Publik

| Halaman | URL | Deskripsi |
|---------|-----|-----------|
| **Login & Dashboard** | `/` | Halaman utama (login + dashboard) |
| **Scan Presensi** | `/scan` | Kiosk presensi QR/Face (publik) |
| **Scan Kedisiplinan** | `/scan-discipline` | Catat pelanggaran/kebaikan (login required) |

## Struktur Proyek

```
src/
├── app/
│   ├── api/           # REST API routes
│   ├── scan/          # Halaman scan presensi
│   ├── scan-discipline/ # Halaman scan kedisiplinan
│   └── page.tsx       # Halaman utama (login + dashboard)
├── components/
│   ├── ui/            # ShadcnUI components
│   └── dashboard/     # Dashboard feature components
├── lib/
│   ├── auth-utils.ts  # JWT, bcrypt, role checks
│   ├── db.ts          # Prisma client singleton
│   ├── qr-utils.ts    # QR code generation
│   └── stores/        # Zustand state management
└── middleware.ts       # Route protection

prisma/
└── schema.prisma      # Database schema
```

## Lisensi

Hak Cipta © 2024-2026. Digunakan untuk keperluan sekolah.
