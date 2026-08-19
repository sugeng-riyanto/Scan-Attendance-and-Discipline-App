'use client'

import React from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { Button } from '@/components/ui/button'
import { Menu } from 'lucide-react'
import { toast } from 'sonner'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { useSocketEvent } from '@/lib/socket-client'
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
import { TermsPage } from './terms-page'
import { GuidePage } from './guide-page'
import { AuditLogsPage } from './audit-logs-page'
import { SecurityPage } from './security-page'
import { DataRightsPage } from './data-rights-page'
import { SuperAdminPage } from './super-admin-page'
import DutyScheduleManager from './duty-schedule-manager'
import { DutyScheduleWidget } from './duty-schedule-widget'
import { ErrorBoundary } from './error-boundary'
import { SubscriptionBanner } from './subscription-banner'
import { PreviewBanner } from './preview-banner'
import { TermsReAcceptBanner } from './terms-re-accept-banner'

export function MainApp({ schoolConfig, themeColor }: { schoolConfig: SchoolConfigType; themeColor: string }) {
  const { user } = useAuthStore()
  const { activePage, sidebarOpen, setSidebarOpen } = useAppStore()

  // The /api/setup reseed broadcasts 'data:reset'; every dashboard refetches
  // via useApiFetch — surface it so staff know the data was just replaced.
  useSocketEvent('data:reset', () => {
    toast.info('Database di-reset — menampilkan data terbaru', { id: 'data-reset' })
  })

  // Automatic subscription reminders: the server's periodic checker broadcasts
  // 'subscription:alert' (schools expiring ≤30 days + locked). The Super Admin
  // sees a summary; a school's own Admin/Kepala Sekolah sees its own alert.
  useSocketEvent('subscription:alert', (data: any) => {
    const u = useAuthStore.getState().user
    if (!u) return
    const expiring: { schoolId: string; name: string; periodEnd?: string | null }[] = data?.expiring || []
    const locked: { schoolId: string; name: string }[] = data?.locked || []
    if (u.role === 'SUPER_ADMIN') {
      const total = expiring.length + locked.length
      if (!total) return
      const parts: string[] = []
      if (expiring.length) parts.push(`${expiring.length} sekolah akan kedaluwarsa ≤30 hari`)
      if (locked.length) parts.push(`${locked.length} sekolah terkunci (login diblokir)`)
      toast.warning(`Pengingat langganan: ${parts.join(', ')}.`, {
        id: 'subscription-alert',
        duration: 15000,
        action: { label: 'Lihat', onClick: () => useAppStore.getState().setActivePage('super-admin') },
      })
    } else if (u.school?.id && (u.role === 'ADMIN' || u.role === 'KEPALA_SEKOLAH')) {
      const schoolId = u.school.id
      const hitLocked = locked.find(x => x.schoolId === schoolId)
      const hitExpiring = expiring.find(x => x.schoolId === schoolId)
      if (!hitLocked && !hitExpiring) return
      toast.warning(hitLocked
        ? `Langganan ${hitLocked.name} nonaktif/kedaluwarsa — login sekolah diblokir. Segera perpanjang.`
        : `Langganan ${hitExpiring?.name} akan kedaluwarsa ${hitExpiring?.periodEnd ? new Date(hitExpiring.periodEnd).toLocaleDateString('id-ID') : 'segera'}. Segera perpanjang.`,
        { id: `subscription-alert-${schoolId}`, duration: 15000 })
    }
  })

  if (!user) return null

  const renderPage = () => {
    switch (activePage) {
      case 'super-admin':
        if (user.role === 'SUPER_ADMIN') return <SuperAdminPage themeColor={themeColor} />
        return <AdminDashboard />
      case 'dashboard':
        switch (user.role) {
          case 'SUPER_ADMIN':
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
      case 'terms': return <TermsPage user={user} />
      case 'guide': return <GuidePage user={user} />
      case 'audit-logs':
        if (user.role === 'ADMIN' || user.role === 'KEPALA_SEKOLAH') return <AuditLogsPage />
        return <AdminDashboard />
      case 'data-rights':
        if (user.role === 'ADMIN' || user.role === 'KEPALA_SEKOLAH') return <DataRightsPage />
        return <AdminDashboard />
      case 'security':
        if (user.role === 'ADMIN' || user.role === 'KEPALA_SEKOLAH') return <SecurityPage />
        return <AdminDashboard />
      case 'duty-schedule':
        if (user.role === 'VP_KESISWAAN') return <DutyScheduleManager />
        return <DutyScheduleWidget userId={user.id} role={user.role} />
      default: return <AdminDashboard />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <SonnerToaster />
      <Sidebar schoolConfig={schoolConfig} themeColor={themeColor} />
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <div className="lg:pl-64">
        <HeaderBar schoolConfig={schoolConfig} themeColor={themeColor} />
        {(user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' || user?.role === 'KEPALA_SEKOLAH') && <SubscriptionBanner />}
        <PreviewBanner />
        <TermsReAcceptBanner themeColor={themeColor} />
        <main className="p-4 pb-20 lg:pb-4 min-h-[calc(100vh-3.5rem)]">
          <ErrorBoundary key={activePage}>
            {renderPage()}
          </ErrorBoundary>
        </main>
      </div>

      <BottomNav themeColor={themeColor} />
      <Button variant="outline" size="icon"
        className="fixed bottom-20 left-4 z-30 lg:hidden rounded-full shadow-lg bg-white dark:bg-gray-800"
        onClick={() => setSidebarOpen(true)}>
        <Menu className="h-5 w-5" />
      </Button>
    </div>
  )
}
