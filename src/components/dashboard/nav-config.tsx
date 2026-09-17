import React from 'react'
import { Home, Activity, ScanLine, FileText, Clock, AlertTriangle, Star, TrendingUp, BarChart3, Download, CreditCard, Settings, Camera, ClipboardList, CalendarRange, BookOpen, ScrollText, ScrollText as LogsIcon, ShieldAlert, Building2 } from 'lucide-react'
import { AppPage } from '@/lib/stores/app-store'
import { MENU, type MenuPage, type Role } from '@/lib/rbac-policy'

/**
 * The menu itself — which pages exist, in what order, and for which roles —
 * lives in the policy (src/lib/rbac-policy.ts `MENU`). This file holds only the
 * presentation, and the `Record<MenuPage, …>` below makes a missing label or a
 * menu entry added without one a type error.
 */
const NAV_PRESENTATION: Record<MenuPage, { label: string; icon: React.ReactNode }> = {
  'super-admin': { label: 'Super Admin', icon: <Building2 className="h-5 w-5" /> },
  dashboard: { label: 'Dashboard', icon: <Home className="h-5 w-5" /> },
  'guru-jaga-monitor': { label: 'Live Attendance Monitor', icon: <Activity className="h-5 w-5" /> },
  'attendance-scanner': { label: 'Attendance Input', icon: <ScanLine className="h-5 w-5" /> },
  'attendance-records': { label: 'Attendance Summary', icon: <FileText className="h-5 w-5" /> },
  permissions: { label: 'Leave Requests', icon: <Clock className="h-5 w-5" /> },
  violations: { label: 'Discipline Incidents', icon: <AlertTriangle className="h-5 w-5" /> },
  'good-deeds': { label: 'Merit Points', icon: <Star className="h-5 w-5" /> },
  'discipline-pattern': { label: 'Discipline Trends', icon: <TrendingUp className="h-5 w-5" /> },
  statistics: { label: 'Analytics', icon: <BarChart3 className="h-5 w-5" /> },
  'discipline-scan': { label: 'Behavior Scan', icon: <ClipboardList className="h-5 w-5" /> },
  export: { label: 'Reports & Export', icon: <Download className="h-5 w-5" /> },
  'id-card': { label: 'Student ID Cards', icon: <CreditCard className="h-5 w-5" /> },
  'duty-schedule': { label: 'Teacher Duty Roster', icon: <CalendarRange className="h-5 w-5" /> },
  settings: { label: 'Settings', icon: <Settings className="h-5 w-5" /> },
  'face-capture': { label: 'Face Registration', icon: <Camera className="h-5 w-5" /> },
  'audit-logs': { label: 'Activity Log', icon: <LogsIcon className="h-5 w-5" /> },
  'data-rights': { label: 'Data Rights', icon: <FileText className="h-5 w-5" /> },
  security: { label: 'Data Security', icon: <ShieldAlert className="h-5 w-5" /> },
  'school-documents': { label: 'Document Library', icon: <FileText className="h-5 w-5" /> },
  guide: { label: 'User Guide', icon: <BookOpen className="h-5 w-5" /> },
  terms: { label: 'Terms & Conditions', icon: <ScrollText className="h-5 w-5" /> },
}

export interface NavItem {
  id: AppPage; label: string; icon: React.ReactNode; roles: readonly Role[]
}

/** Settings is available to EVERY role (RBAC) — its admin-only tabs are gated inside the page. */
export const NAV_ITEMS: NavItem[] = MENU.map(({ id, roles }) => ({
  id,
  roles,
  ...NAV_PRESENTATION[id],
}))

export const MOBILE_NAV_IDS: AppPage[] = ['dashboard', 'attendance-scanner', 'id-card', 'violations', 'statistics', 'settings', 'school-documents', 'super-admin']
