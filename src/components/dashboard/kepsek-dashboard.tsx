'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UserCheck, AlertTriangle, AlertCircle, Copy } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { DisciplinePatternChart } from './discipline-pattern-chart'
import { StatisticsData, BehaviorAlert, ViolationRecord, GoodDeedRecord } from './types'

export function KepsekDashboard() {
  const { data: stats, loading } = useApiFetch<StatisticsData>('/api/statistics?period=monthly')
  const { data: alertData } = useApiFetch<{ alerts: BehaviorAlert[] }>('/api/alerts?targetRole=KEPALA_SEKOLAH')
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>('/api/violations')
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>('/api/good-deeds')
  const alerts = alertData?.alerts || []

  if (loading) return <PageSkeleton />

  const classData = (stats?.classComparison || []).map(c => ({ name: c.className, persen: c.percentage }))
  const timeData = (stats?.timeSeriesData || []).slice(-7).map(d => ({
    tanggal: d.date.slice(5), hadir: d.hadir, terlambat: d.terlambat, alpha: d.alpha
  }))

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard Kepala Sekolah</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100"><UserCheck className="h-5 w-5 text-emerald-600" /></div>
            <div><p className="text-xs text-muted-foreground">Kehadiran Keseluruhan</p><p className="text-2xl font-bold">{stats?.attendancePercentage || 0}%</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-xs text-muted-foreground">Total Pelanggaran</p><p className="text-2xl font-bold">{stats?.totalViolations || 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100"><AlertCircle className="h-5 w-5 text-orange-600" /></div>
            <div><p className="text-xs text-muted-foreground">Eskalasi Level 3-4</p><p className="text-2xl font-bold">{alerts.length}</p></div>
          </div>
        </CardContent></Card>
      </div>

      {alerts.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base text-red-700">Peringatan Eskalasi</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="max-h-48">
              {alerts.map(a => (
                <div key={a.id} className="flex items-start gap-2 py-2 border-b last:border-0">
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm">{a.message}</p>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Perbandingan Kelas</CardTitle>
              <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(classData.map(d => `${d.name}: ${d.persen}%`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                <Copy className="h-3 w-3 mr-1" /> Salin
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {classData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={classData}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                  <Bar dataKey="persen" fill="#10b981" name="Kehadiran %" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Tren Kehadiran Mingguan</CardTitle></CardHeader>
          <CardContent>
            {timeData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={timeData}><CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="tanggal" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                  <Line type="monotone" dataKey="hadir" stroke="#22c55e" name="Hadir" /><Line type="monotone" dataKey="alpha" stroke="#ef4444" name="Alpha" />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
          </CardContent>
        </Card>
      </div>

      <DisciplinePatternChart violations={violData?.violations || []} goodDeeds={goodData?.goodDeeds || []} title="Pola Kedisiplinan Sekolah" />
    </div>
  )
}
