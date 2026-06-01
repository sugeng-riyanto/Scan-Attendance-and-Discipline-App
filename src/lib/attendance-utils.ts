// Attendance utility functions for Indonesian school system
// Time rules: Before 07:00 WIB = On Time (Hadir), After 07:00 = Late (Terlambat)
// Dismissal: SMP at 14:50, SMA at 15:30

export const CHECKIN_CUTOFF_HOUR = 7;
export const CHECKIN_CUTOFF_MINUTE = 0;
export const SMP_DISMISSAL_HOUR = 14;
export const SMP_DISMISSAL_MINUTE = 50;
export const SMA_DISMISSAL_HOUR = 15;
export const SMA_DISMISSAL_MINUTE = 30;

export type AttendanceStatus = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPHA';
export type SchoolLevel = 'SMP' | 'SMA';

/**
 * Determine attendance status based on check-in time
 */
export function determineCheckInStatus(checkInTime: Date): AttendanceStatus {
  const hour = checkInTime.getHours();
  const minute = checkInTime.getMinutes();

  if (hour < CHECKIN_CUTOFF_HOUR || (hour === CHECKIN_CUTOFF_HOUR && minute === 0)) {
    return 'HADIR';
  }
  return 'TERLAMBAT';
}

/**
 * Check if check-in time is late
 */
export function isLate(checkInTime: Date): boolean {
  const hour = checkInTime.getHours();
  const minute = checkInTime.getMinutes();
  return hour > CHECKIN_CUTOFF_HOUR || (hour === CHECKIN_CUTOFF_HOUR && minute > 0);
}

/**
 * Get dismissal time for a school level
 */
export function getDismissalTime(level: SchoolLevel, date: Date): Date {
  const d = new Date(date);
  if (level === 'SMP') {
    d.setHours(SMP_DISMISSAL_HOUR, SMP_DISMISSAL_MINUTE, 0, 0);
  } else {
    d.setHours(SMA_DISMISSAL_HOUR, SMA_DISMISSAL_MINUTE, 0, 0);
  }
  return d;
}

/**
 * Check if checkout is early departure
 */
export function isEarlyDeparture(checkOutTime: Date, level: SchoolLevel): boolean {
  const dismissalTime = getDismissalTime(level, checkOutTime);
  return checkOutTime < dismissalTime;
}

/**
 * Format time to HH:mm WIB
 */
export function formatTimeWIB(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
}

/**
 * Format date to Indonesian format
 */
export function formatDateID(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format date to short Indonesian format
 */
export function formatDateShort(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Get behavior escalation level based on violation points
 */
export function getBehaviorLevel(points: number): { level: number; label: string; handler: string; color: string } {
  if (points <= 50) {
    return { level: 1, label: 'Level 1', handler: 'Wali Kelas', color: 'text-green-600' };
  } else if (points <= 100) {
    return { level: 2, label: 'Level 2', handler: 'Wakasek Kesiswaan', color: 'text-yellow-600' };
  } else if (points <= 150) {
    return { level: 3, label: 'Level 3', handler: 'Kepala Sekolah', color: 'text-orange-600' };
  } else {
    return { level: 4, label: 'Level 4', handler: 'Pemanggilan Ortu', color: 'text-red-600' };
  }
}

/**
 * Get status badge color
 */
export function getStatusColor(status: AttendanceStatus): string {
  switch (status) {
    case 'HADIR': return 'bg-green-100 text-green-800';
    case 'TERLAMBAT': return 'bg-yellow-100 text-yellow-800';
    case 'IZIN': return 'bg-blue-100 text-blue-800';
    case 'SAKIT': return 'bg-purple-100 text-purple-800';
    case 'ALPHA': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get violation level color
 */
export function getViolationLevelColor(level: string): string {
  switch (level) {
    case 'RINGAN': return 'bg-green-100 text-green-800';
    case 'SEDANG': return 'bg-yellow-100 text-yellow-800';
    case 'BERAT': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Role display names in Indonesian
 */
export const roleLabels: Record<string, string> = {
  ADMIN: 'Administrator',
  KEPALA_SEKOLAH: 'Kepala Sekolah',
  VP_KESISWAAN: 'Wakasek Kesiswaan',
  WALI_KELAS: 'Wali Kelas',
  GURU: 'Guru',
  GURU_JAGA: 'Guru Jaga',
  ORANG_TUA: 'Orang Tua',
  SISWA: 'Siswa',
};

/**
 * Permission type labels
 */
export const permissionTypeLabels: Record<string, string> = {
  LATE_ARRIVAL: 'Izin Datang Terlambat',
  EARLY_DEPARTURE: 'Izin Pulang Awal',
  ABSENCE: 'Izin Tidak Hadir',
};

/**
 * Permission status labels
 */
export const permissionStatusLabels: Record<string, string> = {
  PENDING: 'Menunggu',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};
