export interface SchoolConfigType {
  school_name: string; school_address: string; school_logo: string; theme_color: string;
  timezone: string; checkin_cutoff_hour: string;
  demo_show_admin?: string; demo_show_kepsek?: string; demo_show_vpkes?: string;
  demo_show_walikelas?: string; demo_show_guru?: string; demo_show_gurujaga?: string;
  demo_show_ortu?: string; demo_show_siswa?: string;
}

export const DEFAULT_SCHOOL_CONFIG: SchoolConfigType = {
  school_name: 'Attendance Application',
  school_address: 'Jl. Pala Raya No. 51, Pamulang, Tangerang Selatan, Banten',
  school_logo: '',
  theme_color: '#10b981',
  timezone: 'Asia/Jakarta',
  checkin_cutoff_hour: '7',
  demo_show_admin: 'true', demo_show_kepsek: 'true', demo_show_vpkes: 'true',
  demo_show_walikelas: 'true', demo_show_guru: 'true', demo_show_gurujaga: 'true',
  demo_show_ortu: 'true', demo_show_siswa: 'true',
}

export interface DismissalEvent {
  id: string
  date: string // YYYY-MM-DD
  level: 'JHS' | 'SHS' | 'BOTH'
  time: string // HH:mm
  reason: string
}

export interface NationalHoliday {
  id: string
  date: string // YYYY-MM-DD
  name: string
}

// Default dismissal times: JHS 14:50, SHS 15:30 (stored in SchoolConfig keys;
// matches attendance-utils SMP 14:50 / SMA 15:30 early-departure logic)
export const DEFAULT_DISMISSAL_TIMES = { jhs: '14:50', shs: '15:30' }

// Default working days: Monday–Friday (stored in SchoolConfig key school_work_days as JSON array)
export const DEFAULT_WORK_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']

// Demo accounts for the login screen's quick-login buttons. `schoolCode`
// controls which school's landing page shows each button: '*' = every school
// (SUPER_ADMIN), otherwise only that school. The demo users live in SHB-001.
export const DEMO_CREDS = [
  { label: 'Super Admin', username: 'superadmin', password: 'superadmin123', role: 'SUPER_ADMIN', schoolCode: '*' },
  { label: 'Admin', username: 'admin', password: 'admin123', role: 'ADMIN', schoolCode: 'SHB-001' },
  { label: 'Kepsek', username: 'kepsek', password: 'kepsek123', role: 'KEPALA_SEKOLAH', schoolCode: 'SHB-001' },
  { label: 'VP Kesiswaan', username: 'vpkes', password: 'vpkes123', role: 'VP_KESISWAAN', schoolCode: 'SHB-001' },
  { label: 'Wali Kelas', username: 'wali7a', password: 'wali123', role: 'WALI_KELAS', schoolCode: 'SHB-001' },
  { label: 'Guru', username: 'guru1', password: 'guru123', role: 'GURU', schoolCode: 'SHB-001' },
  { label: 'Guru Jaga', username: 'jaga1', password: 'jaga123', role: 'GURU_JAGA', schoolCode: 'SHB-001' },
  { label: 'Orang Tua', username: 'ortu1', password: 'ortu123', role: 'ORANG_TUA', schoolCode: 'SHB-001' },
  { label: 'Siswa', username: 'siswa1', password: 'siswa123', role: 'SISWA', schoolCode: 'SHB-001' },
]
