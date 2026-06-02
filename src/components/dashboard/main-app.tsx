'use client'

import React from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { SchoolConfigType } from '@/lib/types'
import { Sidebar } from './sidebar'
import { HeaderBar } from './header-bar'
import { BottomNav } from './bottom-nav'
import { AdminDashboard } from './admin-dashboard'
import { KepsekDashboard } from './kepsek-dashboard'
import { VPKesDashboard } from './vpkes-dashboard'
import { WaliKelasDashboard } from './walikelas-dashboard'
import { GuruDashboard } from './guru-dashboard'
import { GuruJagaDashboard } from './guru-jaga-dashboard'
import { OrtuDashboard } from './ortu-dashboard'
import { SiswaDashboard } from './siswa-dashboard'
import { AttendanceScannerPage } from './attendance-scanner'
import { AttendanceRecordsPage } from './attendance-records'
import { PermissionsPage } from './permissions-page'
import { ViolationsPage } from './violations-page'
import { GoodDeedsPage } from './good-deeds-page'
import { StudentProfilePage } from './student-profile'
import { DisciplinePatternPage } from './discipline-pattern-page'
import { IdCardPage } from './id-card-page'
import { StatisticsPage } from './statistics-page'
import { ExportPage } from './export-page'
import { SettingsPage } from './settings-page'
import { FaceCapturePage } from './face-capture-page'
import { SchoolDocumentsPage } from './school-documents-page'
import DutyScheduleManager from './duty-schedule-manager'
import { DutyScheduleWidget } from './duty-schedule-widget'
import { ErrorBoundary } from './error-boundary'

export function MainApp({ schoolConfig, themeColor }: { schoolConfig: SchoolConfigType; themeColor: string }) {
  const { user } = useAuthStore()
  const { activePage, sidebarOpen, setSidebarOpen } = useAppStore()

  if (!user) return null

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        switch (user.role) {
          case 'ADMIN': return <AdminDashboard />
          case 'KEPALA_SEKOLAH': return <KepsekDashboard />
          case 'VP_KESISWAAN': return <VPKesDashboard />
          case 'WALI_KELAS': return <WaliKelasDashboard />
          case 'GURU': return <GuruDashboard />
          case 'GURU_JAGA': return <GuruJagaDashboard />
          case 'ORANG_TUA': return <OrtuDashboard />
          case 'SISWA': return <SiswaDashboard />
          default: return <AdminDashboard />
        }
      case 'guru-jaga-monitor': return <GuruJagaDashboard />
      case 'attendance-scanner': return <AttendanceScannerPage />
      case 'attendance-records': return <AttendanceRecordsPage />
      case 'permissions': return <PermissionsPage />
      case 'violations': return <ViolationsPage />
      case 'good-deeds': return <GoodDeedsPage />
      case 'student-profile': return <StudentProfilePage />
      case 'discipline-pattern': return <DisciplinePatternPage />
      case 'id-card': return <IdCardPage />
      case 'statistics': return <StatisticsPage />
      case 'export': return <ExportPage />
      case 'settings': return <SettingsPage themeColor={themeColor} />
      case 'face-capture': return <FaceCapturePage />
      case 'school-documents': return <SchoolDocumentsPage />
      case 'duty-schedule':
        if (user.role === 'VP_KESISWAAN') return <DutyScheduleManager />
        return <DutyScheduleWidget userId={user.id} role={user.role} />
      default: return <AdminDashboard />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SonnerToaster />
      <Sidebar schoolConfig={schoolConfig} themeColor={themeColor} />
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="lg:pl-64">
        <HeaderBar schoolConfig={schoolConfig} themeColor={themeColor} />
        <main className="p-4 pb-20 lg:pb-4 min-h-[calc(100vh-3.5rem)]">
          <ErrorBoundary key={activePage}>
            {renderPage()}
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav themeColor={themeColor} />
      <Button variant="outline" size="icon"
        className="fixed bottom-20 left-4 z-30 lg:hidden rounded-full shadow-lg bg-white"
        onClick={() => setSidebarOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
    </div>
  )
}
