import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireRole } from '@/lib/auth-utils';

// PDF-like HTML report generation (returns HTML that can be printed to PDF client-side)
// This approach avoids server-side PDF dependencies
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthUser(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!requireRole(auth.role, ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA'])) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'attendance'; // attendance, violations, good-deeds, discipline-pattern
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const classId = searchParams.get('classId');
    const format = searchParams.get('format') || 'pdf'; // pdf or html

    const now = new Date();
    const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Get school config
    const configs = await db.schoolConfig.findMany();
    const configMap: Record<string, string> = {};
    configs.forEach(c => { configMap[c.key] = c.value; });

    const schoolName = configMap.school_name || 'SMP-SMA Nusantara';
    const schoolAddress = configMap.school_address || 'Jl. Pendidikan No. 1, Indonesia';
    const themeColor = configMap.theme_color || '#10b981';

    const studentWhere: any = {};
    if (classId && classId !== 'all') studentWhere.classId = classId;

    let title = '';
    let htmlContent = '';

    switch (type) {
      case 'attendance': {
        title = 'Laporan Kehadiran';
        const attendances = await db.attendance.findMany({
          where: { date: { gte: start, lt: end }, student: studentWhere },
          include: { student: { include: { class: true } } },
          orderBy: { date: 'desc' },
        });

        // Summary statistics
        const totalRecords = attendances.length;
        const hadir = attendances.filter(a => a.status === 'HADIR').length;
        const terlambat = attendances.filter(a => a.status === 'TERLAMBAT').length;
        const izin = attendances.filter(a => a.status === 'IZIN').length;
        const sakit = attendances.filter(a => a.status === 'SAKIT').length;
        const alpha = attendances.filter(a => a.status === 'ALPHA').length;
        const attendanceRate = totalRecords > 0 ? Math.round(((hadir + terlambat) / totalRecords) * 100) : 0;

        // Group by class
        const byClass: Record<string, { total: number; hadir: number; terlambat: number; izin: number; sakit: number; alpha: number }> = {};
        attendances.forEach(a => {
          const cn = a.student?.class?.name || 'N/A';
          if (!byClass[cn]) byClass[cn] = { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 };
          byClass[cn].total++;
          if (a.status === 'HADIR') byClass[cn].hadir++;
          else if (a.status === 'TERLAMBAT') byClass[cn].terlambat++;
          else if (a.status === 'IZIN') byClass[cn].izin++;
          else if (a.status === 'SAKIT') byClass[cn].sakit++;
          else if (a.status === 'ALPHA') byClass[cn].alpha++;
        });

        htmlContent = `
          <div class="summary-cards">
            <div class="summary-card" style="border-left: 4px solid ${themeColor};">
              <div class="summary-value">${attendanceRate}%</div>
              <div class="summary-label">Tingkat Kehadiran</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #22c55e;">
              <div class="summary-value">${hadir}</div>
              <div class="summary-label">Hadir</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #eab308;">
              <div class="summary-value">${terlambat}</div>
              <div class="summary-label">Terlambat</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #3b82f6;">
              <div class="summary-value">${izin}</div>
              <div class="summary-label">Izin</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #a855f7;">
              <div class="summary-value">${sakit}</div>
              <div class="summary-label">Sakit</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #ef4444;">
              <div class="summary-value">${alpha}</div>
              <div class="summary-label">Alpha</div>
            </div>
          </div>

          <h3>Ringkasan per Kelas</h3>
          <table>
            <thead>
              <tr><th>Kelas</th><th>Total</th><th>Hadir</th><th>Terlambat</th><th>Izin</th><th>Sakit</th><th>Alpha</th><th>%</th></tr>
            </thead>
            <tbody>
              ${Object.entries(byClass).map(([cn, d]) => `
                <tr>
                  <td>${cn}</td><td>${d.total}</td><td>${d.hadir}</td><td>${d.terlambat}</td>
                  <td>${d.izin}</td><td>${d.sakit}</td><td>${d.alpha}</td>
                  <td>${d.total > 0 ? Math.round(((d.hadir + d.terlambat) / d.total) * 100) : 0}%</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <h3>Detail Kehadiran</h3>
          <table>
            <thead>
              <tr><th>No</th><th>NISN</th><th>Nama</th><th>Kelas</th><th>Tanggal</th><th>Masuk</th><th>Keluar</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${attendances.slice(0, 200).map((a, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${a.student?.nisn || ''}</td>
                  <td>${a.student?.name || ''}</td>
                  <td>${a.student?.class?.name || ''}</td>
                  <td>${a.date ? new Date(a.date).toLocaleDateString('id-ID') : ''}</td>
                  <td>${a.checkInTime ? new Date(a.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td>${a.checkOutTime ? new Date(a.checkOutTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                  <td><span class="status-${a.status.toLowerCase()}">${a.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        break;
      }

      case 'violations': {
        title = 'Laporan Pelanggaran';
        const violations = await db.violation.findMany({
          where: { date: { gte: start, lt: end }, student: studentWhere },
          include: { student: { include: { class: true } }, category: true, recorder: { select: { name: true } } },
          orderBy: { date: 'desc' },
        });

        const totalPoints = violations.reduce((sum, v) => sum + v.points, 0);
        const byLevel = { RINGAN: 0, SEDANG: 0, BERAT: 0 };
        violations.forEach(v => { if (byLevel[v.category?.level as keyof typeof byLevel] !== undefined) byLevel[v.category?.level as keyof typeof byLevel]++; });

        htmlContent = `
          <div class="summary-cards">
            <div class="summary-card" style="border-left: 4px solid #ef4444;">
              <div class="summary-value">${violations.length}</div>
              <div class="summary-label">Total Pelanggaran</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #f59e0b;">
              <div class="summary-value">${totalPoints}</div>
              <div class="summary-label">Total Poin</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #22c55e;">
              <div class="summary-value">${byLevel.RINGAN}</div>
              <div class="summary-label">Ringan</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #eab308;">
              <div class="summary-value">${byLevel.SEDANG}</div>
              <div class="summary-label">Sedang</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #ef4444;">
              <div class="summary-value">${byLevel.BERAT}</div>
              <div class="summary-label">Berat</div>
            </div>
          </div>

          <h3>Detail Pelanggaran</h3>
          <table>
            <thead>
              <tr><th>No</th><th>NISN</th><th>Nama</th><th>Kelas</th><th>Kategori</th><th>Level</th><th>Poin</th><th>Tanggal</th><th>Keterangan</th></tr>
            </thead>
            <tbody>
              ${violations.slice(0, 200).map((v, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td>${v.student?.nisn || ''}</td>
                  <td>${v.student?.name || ''}</td>
                  <td>${v.student?.class?.name || ''}</td>
                  <td>${v.category?.name || ''}</td>
                  <td><span class="level-${(v.category?.level || '').toLowerCase()}">${v.category?.level || ''}</span></td>
                  <td>${v.points}</td>
                  <td>${v.date ? new Date(v.date).toLocaleDateString('id-ID') : ''}</td>
                  <td>${v.description || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
        break;
      }

      case 'discipline-pattern': {
        title = 'Pola Kedisiplinan';
        const students = await db.student.findMany({
          where: { totalViolationPoints: { gt: 0 }, ...studentWhere },
          include: { class: true },
          orderBy: { totalViolationPoints: 'desc' },
          take: 50,
        });

        htmlContent = `
          <div class="summary-cards">
            <div class="summary-card" style="border-left: 4px solid #ef4444;">
              <div class="summary-value">${students.length}</div>
              <div class="summary-label">Siswa dengan Pelanggaran</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #22c55e;">
              <div class="summary-value">${students.filter(s => s.totalViolationPoints <= 50).length}</div>
              <div class="summary-label">Level 1 (Wali Kelas)</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #eab308;">
              <div class="summary-value">${students.filter(s => s.totalViolationPoints > 50 && s.totalViolationPoints <= 100).length}</div>
              <div class="summary-label">Level 2 (Wakasek)</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #f97316;">
              <div class="summary-value">${students.filter(s => s.totalViolationPoints > 100 && s.totalViolationPoints <= 150).length}</div>
              <div class="summary-label">Level 3 (Kepsek)</div>
            </div>
            <div class="summary-card" style="border-left: 4px solid #ef4444;">
              <div class="summary-value">${students.filter(s => s.totalViolationPoints > 150).length}</div>
              <div class="summary-label">Level 4 (Pemanggilan Ortu)</div>
            </div>
          </div>

          <h3>Daftar Siswa Pelanggar</h3>
          <table>
            <thead>
              <tr><th>No</th><th>NISN</th><th>Nama</th><th>Kelas</th><th>Poin Pelanggaran</th><th>Poin Kebaikan</th><th>Level</th></tr>
            </thead>
            <tbody>
              ${students.map((s, i) => {
                const level = s.totalViolationPoints <= 50 ? 'Level 1' : s.totalViolationPoints <= 100 ? 'Level 2' : s.totalViolationPoints <= 150 ? 'Level 3' : 'Level 4';
                const handler = s.totalViolationPoints <= 50 ? 'Wali Kelas' : s.totalViolationPoints <= 100 ? 'Wakasek' : s.totalViolationPoints <= 150 ? 'Kepsek' : 'Pemanggilan Ortu';
                return `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${s.nisn}</td>
                    <td>${s.name}</td>
                    <td>${s.class?.name || ''}</td>
                    <td>${s.totalViolationPoints}</td>
                    <td>${s.totalGoodPoints}</td>
                    <td>${level} (${handler})</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `;
        break;
      }

      default: {
        title = 'Laporan';
        htmlContent = '<p>Tipe laporan tidak valid</p>';
      }
    }

    const startDateStr = start.toLocaleDateString('id-ID');
    const endDateStr = end.toLocaleDateString('id-ID');
    const printDate = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${schoolName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; padding: 20px; font-size: 12px; }
    .header { display: flex; align-items: center; gap: 16px; padding-bottom: 16px; border-bottom: 3px solid ${themeColor}; margin-bottom: 20px; }
    .header img { height: 60px; width: 60px; object-fit: contain; }
    .header h1 { font-size: 18px; color: ${themeColor}; }
    .header p { font-size: 12px; color: #666; }
    .title-section { text-align: center; margin-bottom: 20px; }
    .title-section h2 { font-size: 16px; color: #333; }
    .title-section p { font-size: 11px; color: #666; }
    .summary-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 20px; }
    .summary-card { background: #f8f9fa; padding: 12px; border-radius: 6px; }
    .summary-value { font-size: 20px; font-weight: bold; color: #333; }
    .summary-label { font-size: 10px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10px; }
    th, td { padding: 6px 8px; text-align: left; border: 1px solid #ddd; }
    th { background: ${themeColor}; color: white; font-weight: 600; }
    tr:nth-child(even) { background: #f8f9fa; }
    .status-hadir { color: #22c55e; font-weight: 600; }
    .status-terlambat { color: #eab308; font-weight: 600; }
    .status-izin { color: #3b82f6; font-weight: 600; }
    .status-sakit { color: #a855f7; font-weight: 600; }
    .status-alpha { color: #ef4444; font-weight: 600; }
    .level-ringan { color: #22c55e; }
    .level-sedang { color: #eab308; }
    .level-berat { color: #ef4444; font-weight: 600; }
    .footer { text-align: center; padding-top: 16px; border-top: 1px solid #ddd; color: #999; font-size: 10px; }
    h3 { font-size: 13px; margin: 16px 0 8px; color: #444; }
    @media print { body { padding: 0; } .summary-cards { grid-template-columns: repeat(3, 1fr); } }
  </style>
</head>
<body>
  <div class="header">
    ${configMap.school_logo ? `<img src="${configMap.school_logo}" alt="Logo" />` : '<div style="width:60px;height:60px;background:' + themeColor + ';border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:bold;">S</div>'}
    <div>
      <h1>${schoolName}</h1>
      <p>${schoolAddress}</p>
    </div>
  </div>
  <div class="title-section">
    <h2>${title}</h2>
    <p>Periode: ${startDateStr} - ${endDateStr}</p>
  </div>
  ${htmlContent}
  <div class="footer">
    <p>Dicetak pada: ${printDate} | ${schoolName} - Sistem Presensi & Kedisiplinan</p>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Export PDF error:', error);
    return NextResponse.json({ error: 'Gagal membuat laporan' }, { status: 500 });
  }
}
