export interface SchoolConfigType {
  school_name: string; school_address: string; school_logo: string; theme_color: string;
  timezone: string; checkin_cutoff_hour: string;
  demo_show_admin?: string; demo_show_kepsek?: string; demo_show_vpkes?: string;
  demo_show_walikelas?: string; demo_show_guru?: string; demo_show_gurujaga?: string;
  demo_show_ortu?: string; demo_show_siswa?: string;
}

export const DEFAULT_SCHOOL_CONFIG: SchoolConfigType = {
  school_name: 'SMP-SMA Nusantara',
  school_address: 'Jl. Pendidikan No. 1, Indonesia',
  school_logo: '',
  theme_color: '#10b981',
  timezone: 'Asia/Jakarta',
  checkin_cutoff_hour: '7',
  demo_show_admin: 'true', demo_show_kepsek: 'true', demo_show_vpkes: 'true',
  demo_show_walikelas: 'true', demo_show_guru: 'true', demo_show_gurujaga: 'true',
  demo_show_ortu: 'true', demo_show_siswa: 'true',
}

export const DEMO_CREDS = [
  { label: 'Admin', username: 'admin', password: 'admin123', role: 'ADMIN' },
  { label: 'Kepsek', username: 'kepsek', password: 'kepsek123', role: 'KEPALA_SEKOLAH' },
  { label: 'VP Kesiswaan', username: 'vpkes', password: 'vpkes123', role: 'VP_KESISWAAN' },
  { label: 'Wali Kelas', username: 'wali7a', password: 'wali123', role: 'WALI_KELAS' },
  { label: 'Guru', username: 'guru1', password: 'guru123', role: 'GURU' },
  { label: 'Guru Jaga', username: 'jaga1', password: 'jaga123', role: 'GURU_JAGA' },
  { label: 'Orang Tua', username: 'ortu1', password: 'ortu123', role: 'ORANG_TUA' },
  { label: 'Siswa', username: 'siswa1', password: 'siswa123', role: 'SISWA' },
]
