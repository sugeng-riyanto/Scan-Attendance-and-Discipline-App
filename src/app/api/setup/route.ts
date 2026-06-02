import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth-utils';
import { generateQRString } from '@/lib/qr-utils';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';

    // If force, delete all existing data first (order matters for FK constraints)
    if (force) {
      // Use raw SQL to bypass Prisma order issues
      await db.$executeRawUnsafe(`DELETE FROM "DutySubstitute"`);
      await db.$executeRawUnsafe(`DELETE FROM "Attendance"`);
      await db.$executeRawUnsafe(`DELETE FROM "Violation"`);
      await db.$executeRawUnsafe(`DELETE FROM "GoodDeed"`);
      await db.$executeRawUnsafe(`DELETE FROM "BehaviorAlert"`);
      await db.$executeRawUnsafe(`DELETE FROM "Permission"`);
      await db.$executeRawUnsafe(`DELETE FROM "FaceReference"`);
      await db.$executeRawUnsafe(`DELETE FROM "DutySchedule"`);
      await db.$executeRawUnsafe(`DELETE FROM "Parent"`);
      await db.$executeRawUnsafe(`DELETE FROM "Student"`);
      await db.$executeRawUnsafe(`DELETE FROM "Teacher"`);
      await db.$executeRawUnsafe(`DELETE FROM "Class"`);
      await db.$executeRawUnsafe(`DELETE FROM "AcademicYear"`);
      await db.$executeRawUnsafe(`DELETE FROM "ViolationCategory"`);
      await db.$executeRawUnsafe(`DELETE FROM "GoodDeedCategory"`);
      await db.$executeRawUnsafe(`DELETE FROM "GeofenceConfig"`);
      await db.$executeRawUnsafe(`DELETE FROM "ScanSession"`);
      await db.$executeRawUnsafe(`DELETE FROM "SchoolConfig"`);
      await db.$executeRawUnsafe(`DELETE FROM "SchoolDocument"`);
      await db.$executeRawUnsafe(`DELETE FROM "User"`);
    } else {
      // Check if already seeded
      const existingUsers = await db.user.count();
      if (existingUsers > 0) {
        return NextResponse.json({ message: 'Database already seeded. Gunakan ?force=true untuk re-seed.', skipped: true });
      }
    }

    // 1. Create Academic Year
    const academicYear = await db.academicYear.create({
      data: {
        name: '2024/2025',
        startDate: new Date('2024-07-15'),
        endDate: new Date('2025-06-30'),
        isActive: true,
      },
    });

    // 2. Create Users
    const users = [
      { username: 'admin', password: 'admin123', name: 'Administrator', role: 'ADMIN' },
      { username: 'kepsek', password: 'kepsek123', name: 'Dr. Budi Santoso, M.Pd.', role: 'KEPALA_SEKOLAH' },
      { username: 'vpkes', password: 'vpkes123', name: 'Siti Rahayu, S.Pd.', role: 'VP_KESISWAAN' },
      { username: 'wali7a', password: 'wali123', name: 'Andi Prasetyo, S.Pd.', role: 'WALI_KELAS' },
      { username: 'wali8a', password: 'wali123', name: 'Dewi Lestari, S.Pd.', role: 'WALI_KELAS' },
      { username: 'guru1', password: 'guru123', name: 'Rina Wati, M.Pd.', role: 'GURU' },
      { username: 'guru2', password: 'guru123', name: 'Ahmad Fauzi, S.Pd.', role: 'GURU' },
      { username: 'jaga1', password: 'jaga123', name: 'Bambang Supriyadi, S.Pd.', role: 'GURU_JAGA' },
      { username: 'jaga2', password: 'jaga123', name: 'Nur Hidayah, M.Pd.', role: 'GURU_JAGA' },
      { username: 'ortu1', password: 'ortu123', name: 'Hendra Gunawan', role: 'ORANG_TUA' },
      { username: 'ortu2', password: 'ortu123', name: 'Sri Mulyani', role: 'ORANG_TUA' },
      { username: 'siswa1', password: 'siswa123', name: 'Rizky Pratama', role: 'SISWA' },
      { username: 'siswa2', password: 'siswa123', name: 'Anisa Putri', role: 'SISWA' },
    ];

    const createdUsers: any[] = [];
    for (const u of users) {
      const user = await db.user.create({
        data: {
          username: u.username,
          password: hashPassword(u.password),
          name: u.name,
          role: u.role,
        },
      });
      createdUsers.push(user);
    }

    // 3. Create Teachers
    const teacherUsers = createdUsers.filter(u =>
      ['WALI_KELAS', 'GURU', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'GURU_JAGA'].includes(u.role)
    );
    for (const tu of teacherUsers) {
      await db.teacher.create({
        data: {
          userId: tu.id,
          nip: `NIP${String(Date.now()).slice(-8)}${Math.random().toString(36).slice(2, 5)}`,
          subjects: JSON.stringify(['Matematika', 'Bahasa Indonesia', 'IPA', 'IPS']),
        },
      });
    }

    // 4. Create Classes
    const classDefs = [
      { name: '7A', level: 'VII', homeroomIdx: 3 },
      { name: '7B', level: 'VII', homeroomIdx: -1 },
      { name: '8A', level: 'VIII', homeroomIdx: 4 },
      { name: '8B', level: 'VIII', homeroomIdx: -1 },
      { name: '9A', level: 'IX', homeroomIdx: -1 },
      { name: '9B', level: 'IX', homeroomIdx: -1 },
      { name: '10 IPA 1', level: 'X', homeroomIdx: -1 },
      { name: '10 IPA 2', level: 'X', homeroomIdx: -1 },
      { name: '11 IPS 1', level: 'XI', homeroomIdx: -1 },
      { name: '12 IPA 1', level: 'XII', homeroomIdx: -1 },
    ];

    const createdClasses: any[] = [];
    for (const cd of classDefs) {
      const cls = await db.class.create({
        data: {
          name: cd.name,
          level: cd.level,
          academicYearId: academicYear.id,
          homeroomTeacherId: cd.homeroomIdx >= 0 ? createdUsers[cd.homeroomIdx]?.id : null,
        },
      });
      createdClasses.push(cls);
    }

    // 5. Create Students
    const studentNames = [
      { name: 'Rizky Pratama', gender: 'L', nisn: '0012345001', classIdx: 0, userIdx: 11 },
      { name: 'Anisa Putri', gender: 'P', nisn: '0012345002', classIdx: 0, userIdx: 12 },
      { name: 'Bima Ardiansyah', gender: 'L', nisn: '0012345003', classIdx: 0, userIdx: -1 },
      { name: 'Citra Dewi', gender: 'P', nisn: '0012345004', classIdx: 0, userIdx: -1 },
      { name: 'Dimas Saputra', gender: 'L', nisn: '0012345005', classIdx: 1, userIdx: -1 },
      { name: 'Eka Rahmawati', gender: 'P', nisn: '0012345006', classIdx: 1, userIdx: -1 },
      { name: 'Fajar Nugroho', gender: 'L', nisn: '0012345007', classIdx: 2, userIdx: -1 },
      { name: 'Gita Permata', gender: 'P', nisn: '0012345008', classIdx: 2, userIdx: -1 },
      { name: 'Hadi Kurniawan', gender: 'L', nisn: '0012345009', classIdx: 3, userIdx: -1 },
      { name: 'Indah Sari', gender: 'P', nisn: '0012345010', classIdx: 3, userIdx: -1 },
      { name: 'Joko Widodo', gender: 'L', nisn: '0012345011', classIdx: 4, userIdx: -1 },
      { name: 'Kartika Sari', gender: 'P', nisn: '0012345012', classIdx: 4, userIdx: -1 },
      { name: 'Lukman Hakim', gender: 'L', nisn: '0012345013', classIdx: 5, userIdx: -1 },
      { name: 'Maya Anggraini', gender: 'P', nisn: '0012345014', classIdx: 5, userIdx: -1 },
      { name: 'Naufal Rizki', gender: 'L', nisn: '0012345015', classIdx: 6, userIdx: -1 },
      { name: 'Oktavia Putri', gender: 'P', nisn: '0012345016', classIdx: 6, userIdx: -1 },
      { name: 'Panji Aditya', gender: 'L', nisn: '0012345017', classIdx: 7, userIdx: -1 },
      { name: 'Qori Amalia', gender: 'P', nisn: '0012345018', classIdx: 7, userIdx: -1 },
      { name: 'Rafi Alamsyah', gender: 'L', nisn: '0012345019', classIdx: 8, userIdx: -1 },
      { name: 'Sinta Maharani', gender: 'P', nisn: '0012345020', classIdx: 8, userIdx: -1 },
      { name: 'Taufik Hidayat', gender: 'L', nisn: '0012345021', classIdx: 9, userIdx: -1 },
      { name: 'Umi Kalsum', gender: 'P', nisn: '0012345022', classIdx: 9, userIdx: -1 },
      { name: 'Vino Anggara', gender: 'L', nisn: '0012345023', classIdx: 0, userIdx: -1 },
      { name: 'Wulan Dari', gender: 'P', nisn: '0012345024', classIdx: 1, userIdx: -1 },
    ];

    const createdStudents: any[] = [];
    for (const sn of studentNames) {
      let userId = sn.userIdx >= 0 ? createdUsers[sn.userIdx]?.id : undefined;
      if (!userId) {
        const newU = await db.user.create({
          data: {
            username: `student_${sn.nisn}`,
            password: hashPassword('siswa123'),
            name: sn.name,
            role: 'SISWA',
          },
        });
        userId = newU.id;
      }

      const student = await db.student.create({
        data: {
          nisn: sn.nisn,
          name: sn.name,
          classId: createdClasses[sn.classIdx].id,
          academicYearId: academicYear.id,
          userId: userId,
          qrCode: generateQRString(sn.nisn),
          gender: sn.gender,
        },
      });
      createdStudents.push(student);
    }

    // 6. Create Parents
    const parentUser1 = createdUsers.find(u => u.username === 'ortu1');
    const parentUser2 = createdUsers.find(u => u.username === 'ortu2');
    if (parentUser1 && createdStudents[0]) {
      await db.parent.create({
        data: {
          userId: parentUser1.id,
          studentId: createdStudents[0].id,
          relationship: 'Ayah',
        },
      });
    }
    if (parentUser2 && createdStudents[1]) {
      await db.parent.create({
        data: {
          userId: parentUser2.id,
          studentId: createdStudents[1].id,
          relationship: 'Ibu',
        },
      });
    }
    // Create more parent links
    for (let i = 2; i < Math.min(8, createdStudents.length); i++) {
      const pu = await db.user.create({
        data: {
          username: `parent_${i}`,
          password: hashPassword('ortu123'),
          name: `Orang Tua ${createdStudents[i].name}`,
          role: 'ORANG_TUA',
        },
      });
      await db.parent.create({
        data: {
          userId: pu.id,
          studentId: createdStudents[i].id,
          relationship: i % 2 === 0 ? 'Ayah' : 'Ibu',
        },
      });
    }

    // 7. Create Violation Categories
    const violationCategories = [
      { name: 'Terlambat masuk sekolah', code: 'TRLM', level: 'RINGAN', defaultPoints: 5, description: 'Datang terlambat ke sekolah setelah jam 07:00' },
      { name: 'Seragam tidak lengkap', code: 'SRGM', level: 'RINGAN', defaultPoints: 5, description: 'Tidak memakai seragam lengkap' },
      { name: 'Tidak memakai dasi', code: 'DASI', level: 'RINGAN', defaultPoints: 3, description: 'Tidak memakai dasi saat di sekolah' },
      { name: 'Tidak memakai topi', code: 'TOPD', level: 'RINGAN', defaultPoints: 3, description: 'Tidak memakai topi saat upacara' },
      { name: 'Rambut tidak rapi', code: 'RAMB', level: 'RINGAN', defaultPoints: 5, description: 'Rambut panjang/tidak rapi' },
      { name: 'Membolos', code: 'MBLS', level: 'SEDANG', defaultPoints: 15, description: 'Tidak hadir tanpa keterangan' },
      { name: 'Berkata kasar', code: 'KASR', level: 'SEDANG', defaultPoints: 15, description: 'Mengucapkan kata-kata tidak sopan' },
      { name: 'Berkelahi', code: 'KLRH', level: 'BERAT', defaultPoints: 30, description: 'Terlibat perkelahian di sekolah' },
      { name: 'Merusak fasilitas sekolah', code: 'RSK', level: 'BERAT', defaultPoints: 25, description: 'Merusak fasilitas atau properti sekolah' },
      { name: 'Menyontek saat ujian', code: 'CNTK', level: 'BERAT', defaultPoints: 30, description: 'Menyontek saat ujian/ulangan' },
      { name: 'Membawa benda terlarang', code: 'BDBR', level: 'BERAT', defaultPoints: 35, description: 'Membawa benda yang dilarang di sekolah' },
      { name: 'Memalsukan tanda tangan', code: 'PSK', level: 'BERAT', defaultPoints: 25, description: 'Memalsukan tanda tangan orang tua/wali' },
    ];

    for (const vc of violationCategories) {
      await db.violationCategory.create({ data: vc });
    }

    // 8. Create Good Deed Categories
    const goodDeedCategories = [
      { name: 'Tolong-menolong', code: 'TLONG', defaultPoints: 5, description: 'Membantu teman atau guru' },
      { name: 'Prestasi akademik', code: 'PRAK', defaultPoints: 20, description: 'Meraih prestasi di bidang akademik' },
      { name: 'Prestasi non-akademik', code: 'PRNA', defaultPoints: 15, description: 'Meraih prestasi di bidang non-akademik' },
      { name: 'Kebersihan', code: 'BRSH', defaultPoints: 5, description: 'Ikut menjaga kebersihan sekolah' },
      { name: 'Kedisiplinan', code: 'DSPL', defaultPoints: 10, description: 'Menunjukkan kedisiplinan yang baik' },
      { name: 'Keteladanan', code: 'KTEL', defaultPoints: 10, description: 'Menjadi teladan bagi teman-teman' },
      { name: 'Kepedulian', code: 'KPDN', defaultPoints: 5, description: 'Menunjukkan kepedulian terhadap sesama' },
      { name: 'Aktif di kegiatan sekolah', code: 'AKTF', defaultPoints: 10, description: 'Aktif berpartisipasi dalam kegiatan sekolah' },
    ];

    for (const gdc of goodDeedCategories) {
      await db.goodDeedCategory.create({ data: gdc });
    }

    // 9. Create Sample Attendance Data (last 30 school days)
    const now = new Date();
    const adminUser = createdUsers[0];
    const guruUser = createdUsers.find(u => u.role === 'GURU');
    let attCount = 0;

    for (let dayOffset = 0; dayOffset < 45; dayOffset++) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);
      if (date.getDay() === 0 || date.getDay() === 6) continue; // Skip weekends
      if (attCount >= 600) break; // Max 600 records

      for (const student of createdStudents) {
        const random = Math.random();
        let status = 'HADIR';
        let checkInTime: Date | null = null;
        let checkOutTime: Date | null = null;
        let isLateArrival = false;

        if (random > 0.93) {
          status = 'ALPHA';
        } else if (random > 0.86) {
          status = 'SAKIT';
        } else if (random > 0.79) {
          status = 'IZIN';
        } else if (random > 0.62) {
          status = 'TERLAMBAT';
          checkInTime = new Date(date);
          checkInTime.setHours(7, Math.floor(Math.random() * 25) + 5, 0);
          isLateArrival = true;
        } else {
          checkInTime = new Date(date);
          checkInTime.setHours(6, Math.floor(Math.random() * 45) + 15, 0);
        }

        if (status === 'HADIR' || status === 'TERLAMBAT') {
          checkOutTime = new Date(date);
          checkOutTime.setHours(14, 30 + Math.floor(Math.random() * 40), 0);
        }

        await db.attendance.create({
          data: {
            studentId: student.id,
            date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
            checkInTime, checkOutTime, status,
            checkInMethod: checkInTime ? 'QR' : null,
            checkOutMethod: checkOutTime ? 'QR' : null,
            isLateArrival, isEarlyDeparture: false, verifiedByFace: false,
          },
        });
        attCount++;
      }
    }
    console.log('Attendance created:', attCount);

    // 10. Create Sample Violations & Good Deeds
    const vCategories = await db.violationCategory.findMany();
    const gCategories = await db.goodDeedCategory.findMany();

    for (const student of createdStudents) {
      // Random violations (0-5 per student)
      const numV = Math.floor(Math.random() * 5);
      let totalPoints = 0;
      for (let v = 0; v < numV; v++) {
        const cat = vCategories[Math.floor(Math.random() * vCategories.length)];
        const vDate = new Date(now);
        vDate.setDate(vDate.getDate() - Math.floor(Math.random() * 40));
        totalPoints += cat.defaultPoints;
        await db.violation.create({
          data: {
            studentId: student.id, categoryId: cat.id, points: cat.defaultPoints,
            description: `Pelanggaran ${cat.name}`, date: vDate,
            recordedBy: guruUser?.id || adminUser.id,
          },
        });
      }

      // Random good deeds (0-4 per student)
      const numG = Math.floor(Math.random() * 4);
      let goodPoints = 0;
      for (let g = 0; g < numG; g++) {
        const cat = gCategories[Math.floor(Math.random() * gCategories.length)];
        const gDate = new Date(now);
        gDate.setDate(gDate.getDate() - Math.floor(Math.random() * 40));
        goodPoints += cat.defaultPoints;
        await db.goodDeed.create({
          data: {
            studentId: student.id, categoryId: cat.id, points: cat.defaultPoints,
            description: `Kebaikan ${cat.name}`, date: gDate,
            recordedBy: guruUser?.id || adminUser.id,
          },
        });
      }

      // Update student points
      await db.student.update({
        where: { id: student.id },
        data: {
          totalViolationPoints: totalPoints,
          totalGoodPoints: goodPoints,
        },
      });

      // Create alerts for high-point students
      if (totalPoints > 50) {
        const alertType = totalPoints > 150 ? 'LEVEL_4' : totalPoints > 100 ? 'LEVEL_3' : 'LEVEL_2';
        const targetRole = totalPoints > 150 ? 'ORANG_TUA' : totalPoints > 100 ? 'KEPALA_SEKOLAH' : 'VP_KESISWAAN';
        const message = totalPoints > 150
          ? `${student.name} telah melampaui 150 poin pelanggaran. Pemanggilan orang tua diperlukan.`
          : totalPoints > 100
          ? `${student.name} telah melampaui 100 poin pelanggaran. Perlu ditangani Kepala Sekolah.`
          : `${student.name} telah melampaui 50 poin pelanggaran. Perlu ditangani Wakasek Kesiswaan.`;

        await db.behaviorAlert.create({
          data: {
            studentId: student.id,
            alertType,
            message,
            threshold: totalPoints > 150 ? 150 : totalPoints > 100 ? 100 : 50,
            targetRole,
          },
        });
      }
    }

    // 11. Create Default Geofence
    await db.geofenceConfig.create({
      data: {
        name: 'Area Sekolah Utama',
        centerLat: -6.2088,
        centerLng: 106.8456,
        radiusMeters: 200,
        isActive: true,
        isDefault: true,
      },
    });

    // 11b. Create Duty Schedules for Guru Jaga (weekly recurring)
    const jagaUsers = createdUsers.filter(u => u.role === 'GURU_JAGA');
    const locations = ['Gerbang Utama', 'Lapangan', 'Koridor Barat', 'Kantin', 'Parkiran'];
    const sampleTasks = [
      { label: 'Mengecek kebersihan lingkungan', isRequired: true },
      { label: 'Mengawasi siswa saat istirahat', isRequired: true },
      { label: 'Mencatat kehadiran guru', isRequired: false },
    ];
    for (let day = 1; day <= 5; day++) {
      for (let i = 0; i < jagaUsers.length; i++) {
        try {
          await db.dutySchedule.create({
            data: {
              dayOfWeek: day,
              startTime: i === 0 ? '06:00' : '10:00',
              endTime: i === 0 ? '10:00' : '14:00',
              teacherId: jagaUsers[i].id,
              location: locations[i % locations.length],
              tasks: sampleTasks,
              isActive: true,
            },
          });
        } catch (e) { /* skip */ }
      }
    }

    // 12. Create Sample Permissions
    const parentUser = createdUsers.find(u => u.role === 'ORANG_TUA');
    if (parentUser && createdStudents[0]) {
      await db.permission.create({
        data: {
          studentId: createdStudents[0].id,
          type: 'LATE_ARRIVAL',
          reason: 'Kendaraan mogok di jalan',
          requestedBy: parentUser.id,
          approvedBy: adminUser.id,
          status: 'APPROVED',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 0),
        },
      });
    }
    // Create a PENDING permission for WALI_KELAS to approve
    const ortuUser2 = createdUsers.find(u => u.username === 'ortu2');
    if (ortuUser2 && createdStudents[1]) {
      await db.permission.create({
        data: {
          studentId: createdStudents[1].id,
          type: 'ABSENCE',
          reason: 'Sakit demam, perlu istirahat',
          requestedBy: ortuUser2.id,
          status: 'PENDING',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0),
          endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 0),
        },
      });
    }
    // Create another PENDING permission for class 7A student
    if (createdStudents.length > 2) {
      await db.permission.create({
        data: {
          studentId: createdStudents[2].id,
          type: 'EARLY_DEPARTURE',
          reason: 'Periksa dokter gigi jam 13:00',
          requestedBy: parentUser?.id || adminUser.id,
          status: 'PENDING',
          date: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          startTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0),
          endTime: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 13, 0),
        },
      });
    }

    // 13. Welcome message configs & timezone
    const welcomeConfigs = [
      { key: 'welcome_text', value: 'Selamat datang, {name}! Semoga harimu menyenangkan.', description: 'Template pesan welcome saat check-in' },
      { key: 'welcome_voice_enabled', value: 'true', description: 'Aktifkan suara welcome' },
      { key: 'welcome_voice_lang', value: 'id-ID', description: 'Bahasa suara welcome' },
      { key: 'welcome_voice_rate', value: '1', description: 'Kecepatan suara (0.5-2.0)' },
      { key: 'welcome_late_text', value: '{name}, Anda terlambat hari ini. Semoga besok lebih tepat waktu.', description: 'Template pesan saat terlambat' },
      { key: 'welcome_checkout_text', value: 'Selamat pulang, {name}! Hati-hati di jalan.', description: 'Template pesan saat check-out' },
      { key: 'timezone', value: 'Asia/Jakarta', description: 'Zona waktu default (UTC+7)' },
      { key: 'checkin_cutoff_hour', value: '7', description: 'Jam batas check-in (07:00)' },
      { key: 'school_name', value: 'SMP-SMA Nusantara', description: 'Nama sekolah' },
      { key: 'school_address', value: 'Jl. Pendidikan No. 1, Indonesia', description: 'Alamat sekolah' },
      { key: 'theme_color', value: '#10b981', description: 'Warna tema aplikasi' },
      { key: 'demo_show_admin', value: 'true', description: 'Tampilkan demo login Admin' },
      { key: 'demo_show_kepsek', value: 'true', description: 'Tampilkan demo login Kepsek' },
      { key: 'demo_show_vpkes', value: 'true', description: 'Tampilkan demo login VP Kesiswaan' },
      { key: 'demo_show_walikelas', value: 'true', description: 'Tampilkan demo login Wali Kelas' },
      { key: 'demo_show_guru', value: 'true', description: 'Tampilkan demo login Guru' },
      { key: 'demo_show_gurujaga', value: 'true', description: 'Tampilkan demo login Guru Jaga' },
      { key: 'demo_show_ortu', value: 'true', description: 'Tampilkan demo login Orang Tua' },
      { key: 'demo_show_siswa', value: 'true', description: 'Tampilkan demo login Siswa' },
    ];
    for (const wc of welcomeConfigs) {
      await db.schoolConfig.create({ data: wc });
    }

    return NextResponse.json({
      message: 'Database seeded successfully',
      data: {
        academicYear: academicYear.name,
        users: createdUsers.length,
        classes: createdClasses.length,
        students: createdStudents.length,
        violationCategories: violationCategories.length,
        goodDeedCategories: goodDeedCategories.length,
        welcomeConfigs: welcomeConfigs.length,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Failed to seed database', details: String(error) }, { status: 500 });
  }
}
