'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, Star } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { DisciplinePatternChart } from './discipline-pattern-chart'
import { AttendanceRecord, ViolationRecord, GoodDeedRecord } from './types'

export function GuruDashboard() {
  const { user } = useAuthStore()
  const { setActivePage } = useAppStore()
  const today = new Date().toISOString().split('T')[0]
  const { data: attData, loading } = useApiFetch<{ attendances: AttendanceRecord[]; summary: any }>(`/api/attendance?date=${today}`)
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>('/api/violations')
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>('/api/good-deeds')

  if (loading) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard Guru</h2>
      <div className="grid grid-cols-2 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActivePage('violations')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-lg bg-red-100"><AlertTriangle className="h-6 w-6 text-red-600" /></div>
            <div><p className="text-sm font-semibold">Catat Pelanggaran</p><p className="text-xs text-muted-foreground">Rekam pelanggaran siswa</p></div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActivePage('good-deeds')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-3 rounded-lg bg-yellow-100"><Star className="h-6 w-6 text-yellow-600" /></div>
            <div><p className="text-sm font-semibold">Catat Kebaikan</p><p className="text-xs text-muted-foreground">Rekam kebaikan siswa</p></div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Kehadiran Hari Ini</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            {[
              { label: 'Hadir', value: attData?.summary?.hadir || 0, color: 'text-green-600' },
              { label: 'Terlambat', value: attData?.summary?.terlambat || 0, color: 'text-yellow-600' },
              { label: 'Izin', value: attData?.summary?.izin || 0, color: 'text-blue-600' },
              { label: 'Sakit', value: attData?.summary?.sakit || 0, color: 'text-purple-600' },
              { label: 'Alpha', value: attData?.summary?.alpha || 0, color: 'text-red-600' },
            ].map(s => (
              <div key={s.label} className="p-2 bg-gray-50 rounded"><p className={`text-xl font-bold ${s.color}`}>{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            ))}
          </div>
        </CardContent>
      </Card>

      <DisciplinePatternChart violations={violData?.violations || []} goodDeeds={goodData?.goodDeeds || []} title="Pola Kedisiplinan Siswa" />
    </div>
  )
}
