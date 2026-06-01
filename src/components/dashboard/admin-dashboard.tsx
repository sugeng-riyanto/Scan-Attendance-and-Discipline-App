'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Users, UserCheck, AlertTriangle, Star, Copy, AlertCircle, Shield, FileSpreadsheet, RefreshCw, CreditCard, ClipboardList } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/stores/app-store'
import { formatTimeWIB, getStatusColor } from '@/lib/attendance-utils'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { ScanSessionToggle } from './scan-session-toggle'
import { STATUS_COLORS } from './chart-constants'
import { StatisticsData, AttendanceRecord, BehaviorAlert } from './types'

export function AdminDashboard() {
  const today = new Date().toISOString().split('T')[0]
  const { data: stats, loading: sLoad, refetch: sRefetch } = useApiFetch<StatisticsData>(`/api/statistics?period=daily`)
  const { data: attData, loading: aLoad } = useApiFetch<{ attendances: AttendanceRecord[]; summary: any }>(`/api/attendance?date=${today}`)
  const { data: alertData, loading: alLoad } = useApiFetch<{ alerts: BehaviorAlert[] }>('/api/alerts')

  if (sLoad || aLoad) return <PageSkeleton />

  const summary = attData?.summary || { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 }
  const recentAtt = (attData?.attendances || []).slice(0, 10)
  const alerts = alertData?.alerts || []
  const statusData = [
    { name: 'Hadir', value: summary.hadir, color: STATUS_COLORS.HADIR },
    { name: 'Terlambat', value: summary.terlambat, color: STATUS_COLORS.TERLAMBAT },
    { name: 'Izin', value: summary.izin, color: STATUS_COLORS.IZIN },
    { name: 'Sakit', value: summary.sakit, color: STATUS_COLORS.SAKIT },
    { name: 'Alpha', value: summary.alpha, color: STATUS_COLORS.ALPHA },
  ].filter(d => d.value > 0)

  const topViolators = (stats?.topViolators || []).slice(0, 5)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Dashboard Admin</h2>
        <Button variant="outline" size="sm" onClick={() => { sRefetch(); toast.success('Data diperbarui') }}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><Users className="h-5 w-5 text-emerald-600" /></div>
            <div><p className="text-xs text-muted-foreground">Total Siswa</p><p className="text-2xl font-bold">{stats?.totalStudents || 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100"><UserCheck className="h-5 w-5 text-green-600" /></div>
            <div><p className="text-xs text-muted-foreground">Kehadiran Hari Ini</p><p className="text-2xl font-bold">{stats?.attendancePercentage || 0}%</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-xs text-muted-foreground">Pelanggaran Bulan Ini</p><p className="text-2xl font-bold">{stats?.totalViolations || 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100"><Star className="h-5 w-5 text-yellow-600" /></div>
            <div><p className="text-xs text-muted-foreground">Kebaikan Bulan Ini</p><p className="text-2xl font-bold">{stats?.totalGoodDeeds || 0}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Distribusi Kehadiran Hari Ini</CardTitle>
              <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(statusData.map(d => `${d.name}: ${d.value}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                <Copy className="h-3 w-3 mr-1" /> Salin
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {statusData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">Belum ada data kehadiran hari ini</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top Pelanggar</CardTitle></CardHeader>
          <CardContent>
            {topViolators.length > 0 ? (
              <div className="space-y-3">
                {topViolators.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground w-5">{i + 1}.</span>
                      <div><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.className}</p></div>
                    </div>
                    <Badge variant="destructive">{s.violationPoints} poin</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-center text-muted-foreground py-8">Tidak ada pelanggar</p>}
          </CardContent>
        </Card>
      </div>

      <Card className="border-emerald-200">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-0 justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600 shrink-0" />
              <span className="font-semibold text-sm">Scanner Presensi (/scan)</span>
            </div>
            <div className="w-full sm:w-auto">
              <ScanSessionToggle />
            </div>
          </div>
        </CardContent>
      </Card>

      <a href="/scan-discipline" className="block">
        <Card className="border-blue-200 cursor-pointer hover:bg-blue-50/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              <span className="font-semibold text-sm">Scan Kedisiplinan (/scan-discipline)</span>
            </div>
          </CardContent>
        </Card>
      </a>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Aktivitas Presensi Terkini</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="max-h-64">
            {recentAtt.length > 0 ? recentAtt.map(a => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8"><AvatarFallback className="text-xs">{a.student?.name?.charAt(0)}</AvatarFallback></Avatar>
                  <div>
                    <p className="text-sm font-medium">{a.student?.name}</p>
                    <p className="text-xs text-muted-foreground">{a.student?.class?.name} • {a.checkInTime ? formatTimeWIB(a.checkInTime) : '-'}</p>
                  </div>
                </div>
                <Badge className={getStatusColor(a.status as any)}>{a.status}</Badge>
              </div>
            )) : <p className="text-center text-muted-foreground py-4">Belum ada aktivitas hari ini</p>}
          </ScrollArea>
        </CardContent>
      </Card>

      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Peringatan Kedisiplinan</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="max-h-48">
              {alerts.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-start gap-2 py-2 border-b last:border-0">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted-foreground">{new Date((a as any).createdAt || '').toLocaleString('id-ID')}</p>
                  </div>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Aksi Cepat</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => useAppStore.getState().setActivePage('id-card')}>
              <CreditCard className="h-4 w-4 mr-1" /> Cetak Kartu ID
            </Button>
            <a href="/api/import-template?type=students" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1" /> Template Siswa</Button>
            </a>
            <a href="/api/import-template?type=users" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1" /> Template Pengguna</Button>
            </a>
            <a href="/api/import-template?type=violation-categories" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1" /> Template Kat. Pelanggaran</Button>
            </a>
            <a href="/api/import-template?type=good-deed-categories" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm"><FileSpreadsheet className="h-4 w-4 mr-1" /> Template Kat. Kebaikan</Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
