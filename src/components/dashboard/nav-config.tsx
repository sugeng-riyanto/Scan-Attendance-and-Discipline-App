import React from 'react'
import { Home, Activity, ScanLine, FileText, Clock, AlertTriangle, Star, TrendingUp, BarChart3, Download, CreditCard, Settings, Camera, ClipboardList, CalendarRange, BookOpen, ScrollText, ScrollText as LogsIcon, ShieldAlert, Building2 } from 'lucide-react'
import { AppPage } from '@/lib/stores/app-store'

export interface NavItem {
  id: AppPage; label: string; icon: React.ReactNode; roles: string[]
}

export const NAV_ITEMS: NavItem[] = [
  // SUPER_ADMIN (multi-school) — access all roles + super admin menu.
  { id: 'super-admin', label: 'Super Admin', icon: <Building2 className="h-5 w-5" />, roles: ['SUPER_ADMIN'] },
  { id: 'dashboard', label: 'Dashboard', icon: <Home className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { id: 'guru-jaga-monitor', label: 'Live Attendance Monitor', icon: <Activity className="h-5 w-5" />, roles: ['GURU_JAGA','ADMIN'] },
  { id: 'attendance-scanner', label: 'Attendance Input', icon: <ScanLine className="h-5 w-5" />, roles: ['ADMIN','WALI_KELAS','GURU','GURU_JAGA','VP_KESISWAAN'] },
  { id: 'attendance-records', label: 'Attendance Summary', icon: <FileText className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU'] },
  { id: 'permissions', label: 'Leave Requests', icon: <Clock className="h-5 w-5" />, roles: ['ADMIN','WALI_KELAS','ORANG_TUA','VP_KESISWAAN'] },
  { id: 'violations', label: 'Discipline Incidents', icon: <AlertTriangle className="h-5 w-5" />, roles: ['ADMIN','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','KEPALA_SEKOLAH'] },
  { id: 'good-deeds', label: 'Merit Points', icon: <Star className="h-5 w-5" />, roles: ['ADMIN','VP_KESISWAAN','WALI_KELAS','GURU'] },
  { id: 'discipline-pattern', label: 'Discipline Trends', icon: <TrendingUp className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU'] },
  { id: 'statistics', label: 'Analytics', icon: <BarChart3 className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { id: 'discipline-scan', label: 'Behavior Scan', icon: <ClipboardList className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'] },
  { id: 'export', label: 'Reports & Export', icon: <Download className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU_JAGA'] },
  { id: 'id-card', label: 'Student ID Cards', icon: <CreditCard className="h-5 w-5" />, roles: ['ADMIN','WALI_KELAS','VP_KESISWAAN','SISWA'] },
  { id: 'duty-schedule', label: 'Teacher Duty Roster', icon: <CalendarRange className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA'] },
  // Settings is available to EVERY role (RBAC) — admin-only data tabs are
  // gated inside the Settings page itself.
  { id: 'settings', label: 'Settings', icon: <Settings className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { id: 'face-capture', label: 'Face Registration', icon: <Camera className="h-5 w-5" />, roles: ['ADMIN'] },
  { id: 'audit-logs', label: 'Activity Log', icon: <LogsIcon className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH'] },
  { id: 'data-rights', label: 'Data Rights', icon: <FileText className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH'] },
  { id: 'security', label: 'Data Security', icon: <ShieldAlert className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH'] },
  { id: 'school-documents', label: 'Document Library', icon: <FileText className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { id: 'guide', label: 'User Guide', icon: <BookOpen className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
  { id: 'terms', label: 'Terms & Conditions', icon: <ScrollText className="h-5 w-5" />, roles: ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA','ORANG_TUA','SISWA'] },
]

export const MOBILE_NAV_IDS: AppPage[] = ['dashboard', 'attendance-scanner', 'id-card', 'violations', 'statistics', 'settings', 'school-documents', 'super-admin']
