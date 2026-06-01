# Presensi Nusantara 2 - User Manual

## Untuk Admin
### Setup Awal
1. Buka website → klik **"Setup Database"** (isi data demo)
2. Login dengan `admin` / `admin123`
3. Atur konfigurasi sekolah di **Settings → School Config**
4. Tambah tahun ajaran di **Settings → Academic Years**
5. Import data siswa di menu **Import Data** (download template CSV)

### Manajemen User
- **Menu Settings → Users**: Tambah/edit user guru, wali kelas, dll.
- Setiap user login dengan username (NIP/NISN) + password default

### Aktivasi Presensi
- **Menu Scan Session**: Klik **"Aktifkan Presensi"** untuk mulai sesi
- Pilih mode: **QR** (scan kode) atau **Face** (wajah)

## Untuk Wali Kelas
### Data Siswa
- Lihat & edit profil siswa di kelas masing-masing
- Cetak **Kartu ID** untuk dibagikan ke siswa (berisi QR code + foto)

### Presensi
- Lihat rekap kehadiran siswa per hari/bulan
- Ekspor ke Excel/PDF

### Pelanggaran & Kebaikan
- Catat pelanggaran dan kebaikan siswa
- Download surat peringatan (PDF)

## Untuk Guru / Guru Jaga
### Presensi Harian
- Buka **Scan Session** → arahkan kamera ke QR code siswa
- Atau gunakan mode **Face Recognition** (wajah terdeteksi otomatis)

### Pencatatan
- **Guru**: Catat pelanggaran & kebaikan siswa
- **Guru Jaga**: Catat pelanggaran & kebaikan (monitor harian)

## Untuk Siswa
### Scan Presensi
1. Datang ke lobby sekolah
2. Tap **"Mulai Presensi"** di layar kios
3. Scan QR Code di kartu ID ATAU tap **"Presensi Wajah"**
4. Tunggu konfirmasi suara

### Cek Data Sendiri
- Login dengan username (NISN) + password
- Lihat kehadiran, pelanggaran, kebaikan sendiri

## Untuk Orang Tua
- Login untuk pantau kehadiran anak
- Lihat rekap presensi, pelanggaran, kebaikan
- Ajukan izin ketidakhadiran

## Tips Operasional

### Kios Scan (di lobby)
- Gunakan monitor minimal 15" + webcam HD
- Jarak ideal kamera-wajah: 30-80 cm
- Pencahayaan cukup (tidak backlight)
- Browser: Chrome/Chromium (disarankan)

### QR Code
- Cetak kartu ID ukuran **A6 (105×148mm)** atau **KTP (86×54mm)**
- Gunakan kertas PVC/art carton 260gsm
- Laminasi untuk ketahanan

### Troubleshooting
| Masalah | Solusi |
|---------|--------|
| Kamera tidak muncul | Izin kamera di browser → Setelan → Kamera → Izinkan |
| QR tidak terbaca | Bersihkan kartu, jaga jarak 15-30cm |
| Face tidak cocok | Pencahayaan kurang / perubahan drastis penampilan |
| Login gagal | Cek Caps Lock, reset password di Settings → Users |
| Laporan kosong | Pilih periode dengan benar di filter tanggal |

### Untuk Cetak Kartu ID
1. Buka **ID Card → Generate** (pilih kelas/siswa)
2. Set layout **6×4 per halaman** (A4)
3. Cetak menggunakan kertas **Photo Paper / PVC Sheet**
4. Potong dan laminasi

## Role & Dashboard

| Role | Dashboard Utama |
|------|----------------|
| Admin | Semua fitur, Settings, Users, Import |
| Kepala Sekolah | Statistik, Laporan, Monitoring |
| VP Kesiswaan | Pelanggaran, Kebaikan, Izin, Laporan |
| Wali Kelas | Siswa per kelas, Presensi, Pelanggaran |
| Guru | Presensi harian, Pelanggaran |
| Guru Jaga | Monitor harian, Pelanggaran |
| Siswa | Data diri, Presensi sendiri |
| Orang Tua | Pantau anak, Izin |
