import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

interface TemplateConfig {
  columns: string[];
  exampleRows: string[][];
  filename: string;
  sheetName: string;
  colWidths: number[];
}

const TEMPLATES: Record<string, TemplateConfig> = {
  students: {
    columns: ['NISN', 'Nama Siswa', 'Kelas', 'Jenis Kelamin', 'Nama Orang Tua', 'Alamat', 'Email', 'No HP'],
    exampleRows: [
      ['0012345678', 'Ahmad Fauzi', '7A', 'Laki-laki', 'Budi Fauzi', 'Jl. Merdeka No. 10', 'ahmad@example.com', '081234567890'],
      ['0012345679', 'Siti Aminah', '7B', 'Perempuan', 'Hasan Aminah', 'Jl. Pahlawan No. 5', 'siti@example.com', '081234567891'],
    ],
    filename: 'template_import_siswa.xlsx',
    sheetName: 'Siswa',
    colWidths: [14, 20, 8, 14, 20, 25, 22, 16, 10],
  },
  users: {
    columns: ['Username', 'Nama', 'Role', 'NIP', 'Nama Kelas'],
    exampleRows: [
      ['guru01', 'Pak Hendra', 'GURU', '198501012010011001', ''],
      ['wali07a', 'Bu Sri Mulyani', 'WALI_KELAS', '198703152011012002', '7A'],
    ],
    filename: 'template_import_pengguna.xlsx',
    sheetName: 'Pengguna',
    colWidths: [16, 22, 16, 22, 14, 10],
  },
  'violation-categories': {
    columns: ['Kode', 'Nama', 'Level', 'Poin'],
    exampleRows: [
      ['PLG01', 'Terlambat masuk sekolah', 'RINGAN', '5'],
      ['PLG02', 'Tidak memakai seragam lengkap', 'SEDANG', '15'],
    ],
    filename: 'template_import_kategori_pelanggaran.xlsx',
    sheetName: 'Kategori Pelanggaran',
    colWidths: [10, 30, 12, 8, 10],
  },
  'good-deed-categories': {
    columns: ['Kode', 'Nama', 'Poin'],
    exampleRows: [
      ['KB01', 'Menjadi ketua kelas', '10'],
      ['KB02', 'Ikut serta lomba akademik', '15'],
    ],
    filename: 'template_import_kategori_kebaikan.xlsx',
    sheetName: 'Kategori Kebaikan',
    colWidths: [10, 30, 8, 10],
  },
};

/**
 * Applies yellow background styling to example rows.
 * Note: Cell styling in XLSX community edition is best-effort.
 * The "CONTOH" label column serves as a clear visual marker regardless.
 */
function applyExampleRowStyle(ws: XLSX.WorkSheet, row: number, numCols: number) {
  for (let C = 0; C < numCols; C++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: C });
    const cell = ws[cellRef];
    if (cell) {
      cell.s = {
        fill: { fgColor: { rgb: 'FFFFFF00' } },
        font: { italic: true },
      };
    }
  }
}

/**
 * Adds a "CONTOH" label cell to mark example rows.
 */
function addContohLabel(ws: XLSX.WorkSheet, col: number, row: number) {
  const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
  ws[cellRef] = {
    t: 's',
    v: 'CONTOH',
    s: {
      fill: { fgColor: { rgb: 'FFFFFF00' } },
      font: { bold: true, italic: true, color: { rgb: 'FF9C6500' } },
      alignment: { horizontal: 'center' },
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    if (!type) {
      return NextResponse.json(
        { error: 'Parameter "type" diperlukan. Gunakan: students, users, violation-categories, good-deed-categories' },
        { status: 400 }
      );
    }

    const template = TEMPLATES[type];
    if (!template) {
      return NextResponse.json(
        { error: `Tipe template "${type}" tidak valid. Tersedia: ${Object.keys(TEMPLATES).join(', ')}` },
        { status: 400 }
      );
    }

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Build data rows: header + example rows (each with a CONTOH label appended)
    const headerWithLabel = [...template.columns];
    const exampleRowsWithLabel = template.exampleRows.map((row) => [...row, 'CONTOH']);
    const data = [headerWithLabel, ...exampleRowsWithLabel];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws['!cols'] = template.colWidths.map((w) => ({ wch: w }));

    // Apply yellow background to example rows and CONTOH label styling
    for (let i = 0; i < template.exampleRows.length; i++) {
      const rowIdx = i + 1; // 0-based row index (row 0 is header)
      applyExampleRowStyle(ws, rowIdx, template.columns.length);
      addContohLabel(ws, template.columns.length, rowIdx);
    }

    // Style header row
    for (let C = 0; C < template.columns.length; C++) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: C });
      const cell = ws[cellRef];
      if (cell) {
        cell.s = {
          font: { bold: true, color: { rgb: 'FFFFFFFF' } },
          fill: { fgColor: { rgb: 'FF4472C4' } },
          alignment: { horizontal: 'center' },
        };
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, template.sheetName);

    // Generate XLSX buffer with cell styles enabled
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellStyles: true });

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${template.filename}"`,
      },
    });
  } catch (error: any) {
    console.error('Import template error:', error);
    return NextResponse.json(
      { error: 'Gagal membuat template import: ' + error.message },
      { status: 500 }
    );
  }
}
