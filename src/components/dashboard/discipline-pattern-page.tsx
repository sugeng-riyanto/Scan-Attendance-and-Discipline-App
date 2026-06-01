'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, Copy, Star } from 'lucide-react'
import { ClassInfo, ViolationRecord, GoodDeedRecord } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { CHART_COLORS } from './chart-constants'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export function DisciplinePatternPage() {
  const { user } = useAuthStore()
  const { classFilter, setClassFilter } = useAppStore()
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  const classes = classesData?.classes || []

  const violUrl = classFilter !== 'all' ? `/api/violations?classId=${classFilter}` : '/api/violations'
  const goodUrl = classFilter !== 'all' ? `/api/good-deeds?classId=${classFilter}` : '/api/good-deeds'
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>(violUrl, [classFilter])
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>(goodUrl, [classFilter])
  const violations = (violData?.violations || []).filter(v => v.date >= startDate && v.date <= endDate)
  const goodDeeds = (goodData?.goodDeeds || []).filter(g => g.date >= startDate && g.date <= endDate)

  const canSeeAll = user?.role === 'ADMIN' || user?.role === 'VP_KESISWAAN' || user?.role === 'KEPALA_SEKOLAH'

  const studentPoints: Record<string, { name: string; points: number; good: number }> = {}
  violations.forEach(v => {
    const sid = v.studentId
    if (!studentPoints[sid]) studentPoints[sid] = { name: v.student?.name || 'Unknown', points: 0, good: 0 }
    studentPoints[sid].points += v.points
  })
  goodDeeds.forEach(g => {
    const sid = g.studentId
    if (!studentPoints[sid]) studentPoints[sid] = { name: g.student?.name || 'Unknown', points: 0, good: 0 }
    studentPoints[sid].good += g.points
  })
  const histData = Object.values(studentPoints).sort((a, b) => b.points - a.points).slice(0, 15).map(s => ({
    name: s.name.length > 10 ? s.name.slice(0, 10) + '…' : s.name, pelanggaran: s.points, kebaikan: s.good
  }))

  const violByDate = violations.reduce<Record<string, number>>((acc, v) => {
    const d = v.date?.toString().slice(0, 10) || ''
    acc[d] = (acc[d] || 0) + v.points
    return acc
  }, {})
  const goodByDate = goodDeeds.reduce<Record<string, number>>((acc, g) => {
    const d = g.date?.toString().slice(0, 10) || ''
    acc[d] = (acc[d] || 0) + g.points
    return acc
  }, {})
  const allDates = [...new Set([...Object.keys(violByDate), ...Object.keys(goodByDate)])].sort().slice(-30)
  const trendData = allDates.map(d => ({
    tanggal: d.slice(5), pelanggaran: violByDate[d] || 0, kebaikan: goodByDate[d] || 0
  }))

  const violByCategory: Record<string, number> = {}
  violations.forEach(v => { const name = v.category?.name || 'Lainnya'; violByCategory[name] = (violByCategory[name] || 0) + v.points })
  const categoryPie = Object.entries(violByCategory).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)

  const violByLevel: Record<string, number> = { RINGAN: 0, SEDANG: 0, BERAT: 0 }
  violations.forEach(v => { const lvl = (v.category?.level || 'RINGAN') as keyof typeof violByLevel; if (lvl in violByLevel) violByLevel[lvl] += v.points })
  const levelPie = [
    { name: 'Ringan', value: violByLevel.RINGAN, color: '#22c55e' },
    { name: 'Sedang', value: violByLevel.SEDANG, color: '#eab308' },
    { name: 'Berat', value: violByLevel.BERAT, color: '#ef4444' },
  ].filter(d => d.value > 0)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Pola Disiplin</h2>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {canSeeAll && (
              <div><Label>Kelas</Label>
                <Select value={classFilter} onValueChange={setClassFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Kelas</SelectItem>
                    {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Dari Tanggal</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><Label>Sampai Tanggal</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <AlertTriangle className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-600">{violations.length}</p><p className="text-xs text-muted-foreground">Pelanggaran</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Star className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-yellow-600">{goodDeeds.length}</p><p className="text-xs text-muted-foreground">Kebaikan</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{violations.reduce((s, v) => s + v.points, 0)}</p><p className="text-xs text-muted-foreground">Total Poin Pelanggaran</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{goodDeeds.reduce((s, g) => s + g.points, 0)}</p><p className="text-xs text-muted-foreground">Total Poin Kebaikan</p>
        </CardContent></Card>
      </div>

      {histData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Distribusi Poin per Siswa (Top 15)</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(histData.map(d => `${d.name}: Pelanggaran ${d.pelanggaran}, Kebaikan ${d.kebaikan}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                <Copy className="h-3 w-3 mr-1" /> Salin
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={histData} layout="vertical"><CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" /><YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={80} />
                <Tooltip />
                <Bar dataKey="pelanggaran" fill="#ef4444" name="Pelanggaran" />
                <Bar dataKey="kebaikan" fill="#10b981" name="Kebaikan" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {trendData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tren Pelanggaran & Kebaikan</CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(trendData.map(d => `${d.tanggal}: Pelanggaran ${d.pelanggaran}, Kebaikan ${d.kebaikan}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                <Copy className="h-3 w-3 mr-1" /> Salin
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}><CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                <Line type="monotone" dataKey="pelanggaran" stroke="#ef4444" name="Pelanggaran" />
                <Line type="monotone" dataKey="kebaikan" stroke="#10b981" name="Kebaikan" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categoryPie.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pelanggaran per Kategori</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(categoryPie.map(d => `${d.name}: ${d.value}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                  <Copy className="h-3 w-3 mr-1" /> Salin
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={categoryPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {categoryPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {levelPie.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pelanggaran per Level</CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { navigator.clipboard.writeText(levelPie.map(d => `${d.name}: ${d.value}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                  <Copy className="h-3 w-3 mr-1" /> Salin
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={levelPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                  {levelPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
