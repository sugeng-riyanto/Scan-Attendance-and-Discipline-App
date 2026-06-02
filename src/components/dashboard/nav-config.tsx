import React from 'react'
import { Home, Activity, ScanLine, FileText, Clock, AlertTriangle, Star, TrendingUp, BarChart3, Download, CreditCard, Settings, Camera, ClipboardList, CalendarRange } from 'lucide-react'
import { AppPage } from '@/lib/stores/app-store'

export interface NavItem {
  id: AppPage; label: string; icon: React.ReactNode; roles: string[]
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { id: 'guru-jaga-monitor', label: 'Monitor Presensi', icon: <Activity className="h-5 w-5" />, roles: ['GURU_JAGA','ADMIN'] },
  { id: 'attendance-scanner', label: 'Presensi', icon: <ScanLine className="h-5 w-5" />, roles: ['ADMIN','WALI_KELAS','GURU','GURU_JAGA','VP_KESISWAAN'] },
  { id: 'attendance-records', label: 'Rekap Presensi', icon: <FileText className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU'] },
  { id: 'permissions', label: 'Izin', icon: <Clock className="h-5 w-5" />, roles: ['ADMIN','WALI_KELAS','ORANG_TUA','VP_KESISWAAN'] },
  { id: 'violations', label: 'Pelanggaran', icon: <AlertTriangle className="h-5 w-5" />, roles: ['ADMIN','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','KEPALA_SEKOLAH'] },
  { id: 'good-deeds', label: 'Kebaikan', icon: <Star className="h-5 w-5" />, roles: ['ADMIN','VP_KESISWAAN','WALI_KELAS','GURU'] },
  { id: 'discipline-pattern', label: 'Pola Disiplin', icon: <TrendingUp className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU'] },
  { id: 'statistics', label: 'Statistik', icon: <BarChart3 className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { id: 'discipline-scan', label: 'Scan Kedisiplinan', icon: <ClipboardList className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'] },
  { id: 'export', label: 'Export', icon: <Download className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU_JAGA'] },
  { id: 'id-card', label: 'ID Card', icon: <CreditCard className="h-5 w-5" />, roles: ['ADMIN','WALI_KELAS','VP_KESISWAAN','SISWA'] },
  { id: 'duty-schedule', label: 'Jadwal Guru Jaga', icon: <CalendarRange className="h-5 w-5" />, roles: ['VP_KESISWAAN'] },
  { id: 'duty-schedule', label: 'Jadwal Guru Jaga', icon: <CalendarRange className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','WALI_KELAS','GURU','GURU_JAGA'] },
  { id: 'settings', label: 'Pengaturan', icon: <Settings className="h-5 w-5" />, roles: ['ADMIN','VP_KESISWAAN'] },
  { id: 'face-capture', label: 'Capture Wajah', icon: <Camera className="h-5 w-5" />, roles: ['ADMIN'] },
  { id: 'school-documents', label: 'Dokumen Sekolah', icon: <FileText className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
]

export const MOBILE_NAV_IDS: AppPage[] = ['dashboard', 'attendance-scanner', 'id-card', 'violations', 'statistics', 'settings', 'school-documents']
