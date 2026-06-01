import * as XLSX from 'xlsx';
import { formatDateShort, formatTimeWIB } from './attendance-utils';

interface ExportColumn {
  header: string;
  key: string;
  width?: number;
}

/**
 * Export data to XLSX buffer
 */
export function exportToXLSX(
  data: Record<string, unknown>[],
  columns: ExportColumn[],
  sheetName: string = 'Data'
): Buffer {
  const wsData = [
    columns.map(col => col.header),
    ...data.map(row => columns.map(col => {
      const val = row[col.key];
      if (val instanceof Date) {
        return formatDateShort(val);
      }
      return val ?? '';
    })),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws['!cols'] = columns.map(col => ({ wch: col.width || 15 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buf;
}

/**
 * Create attendance export data
 */
export function createAttendanceExport(records: any[]): { data: Record<string, unknown>[]; columns: ExportColumn[] } {
  const columns: ExportColumn[] = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'NISN', key: 'nisn', width: 15 },
    { header: 'Nama Siswa', key: 'studentName', width: 25 },
    { header: 'Kelas', key: 'className', width: 10 },
    { header: 'Tanggal', key: 'date', width: 15 },
    { header: 'Jam Masuk', key: 'checkInTime', width: 12 },
    { header: 'Jam Keluar', key: 'checkOutTime', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Metode Masuk', key: 'checkInMethod', width: 12 },
    { header: 'Terlambat', key: 'isLateArrival', width: 10 },
    { header: 'Pulang Awal', key: 'isEarlyDeparture', width: 12 },
    { header: 'Catatan', key: 'notes', width: 20 },
  ];

  const data = records.map((r, i) => ({
    no: i + 1,
    nisn: r.student?.nisn || '',
    studentName: r.student?.name || '',
    className: r.student?.class?.name || '',
    date: r.date ? formatDateShort(r.date) : '',
    checkInTime: r.checkInTime ? formatTimeWIB(r.checkInTime) : '-',
    checkOutTime: r.checkOutTime ? formatTimeWIB(r.checkOutTime) : '-',
    status: r.status || '',
    checkInMethod: r.checkInMethod || '-',
    isLateArrival: r.isLateArrival ? 'Ya' : 'Tidak',
    isEarlyDeparture: r.isEarlyDeparture ? 'Ja' : 'Tidak',
    notes: r.notes || '-',
  }));

  return { data, columns };
}

/**
 * Create behavior/violation export data
 */
export function createViolationExport(records: any[]): { data: Record<string, unknown>[]; columns: ExportColumn[] } {
  const columns: ExportColumn[] = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'NISN', key: 'nisn', width: 15 },
    { header: 'Nama Siswa', key: 'studentName', width: 25 },
    { header: 'Kelas', key: 'className', width: 10 },
    { header: 'Kategori', key: 'categoryName', width: 20 },
    { header: 'Level', key: 'level', width: 10 },
    { header: 'Poin', key: 'points', width: 8 },
    { header: 'Tanggal', key: 'date', width: 15 },
    { header: 'Dicatat Oleh', key: 'recorderName', width: 20 },
    { header: 'Keterangan', key: 'description', width: 25 },
  ];

  const data = records.map((r, i) => ({
    no: i + 1,
    nisn: r.student?.nisn || '',
    studentName: r.student?.name || '',
    className: r.student?.class?.name || '',
    categoryName: r.category?.name || '',
    level: r.category?.level || '',
    points: r.points || 0,
    date: r.date ? formatDateShort(r.date) : '',
    recorderName: r.recorder?.name || '',
    description: r.description || '-',
  }));

  return { data, columns };
}

/**
 * Create good deed export data
 */
export function createGoodDeedExport(records: any[]): { data: Record<string, unknown>[]; columns: ExportColumn[] } {
  const columns: ExportColumn[] = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'NISN', key: 'nisn', width: 15 },
    { header: 'Nama Siswa', key: 'studentName', width: 25 },
    { header: 'Kelas', key: 'className', width: 10 },
    { header: 'Kategori', key: 'categoryName', width: 20 },
    { header: 'Poin', key: 'points', width: 8 },
    { header: 'Tanggal', key: 'date', width: 15 },
    { header: 'Dicatat Oleh', key: 'recorderName', width: 20 },
    { header: 'Keterangan', key: 'description', width: 25 },
  ];

  const data = records.map((r, i) => ({
    no: i + 1,
    nisn: r.student?.nisn || '',
    studentName: r.student?.name || '',
    className: r.student?.class?.name || '',
    categoryName: r.category?.name || '',
    points: r.points || 0,
    date: r.date ? formatDateShort(r.date) : '',
    recorderName: r.recorder?.name || '',
    description: r.description || '-',
  }));

  return { data, columns };
}
