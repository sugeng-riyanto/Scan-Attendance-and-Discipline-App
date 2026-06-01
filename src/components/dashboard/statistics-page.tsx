'use client'

import React, { useState } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { getBehaviorLevel } from '@/lib/attendance-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Copy } from 'lucide-react'
import { Student, ClassInfo, AttendanceRecord, ViolationRecord, GoodDeedRecord, StatisticsData } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { DisciplinePatternChart } from './discipline-pattern-chart'
import { STATUS_COLORS, CHART_COLORS } from './chart-constants'
import { PieChart, Pie, Cell, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function IndividualStatistics({ student, attData, violData, goodData }: {
  student: Student | null; attData: AttendanceRecord[]; violData: ViolationRecord[]; goodData: GoodDeedRecord[]
}) {
  const authUser = useAuthStore(s => s.user)

  const attDist = attData.reduce<Record<string, number>>((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc }, {})
  const attPie = [
    { name: 'Hadir', value: attDist['HADIR'] || 0, color: STATUS_COLORS.HADIR },
    { name: 'Terlambat', value: attDist['TERLAMBAT'] || 0, color: STATUS_COLORS.TERLAMBAT },
    { name: 'Izin', value: attDist['IZIN'] || 0, color: STATUS_COLORS.IZIN },
    { name: 'Sakit', value: attDist['SAKIT'] || 0, color: STATUS_COLORS.SAKIT },
    { name: 'Alpha', value: attDist['ALPHA'] || 0, color: STATUS_COLORS.ALPHA },
  ].filter(d => d.value > 0)

  const attByDate = attData.slice(0, 30).map(a => ({
    tanggal: (a.date || '').toString().slice(5, 10),
    status: a.status === 'HADIR' ? 1 : a.status === 'TERLAMBAT' ? 0.5 : 0
  }))

  const violBreakdown = violData.reduce<Record<string, number>>((acc, v) => {
    const name = v.category?.name || 'Lainnya'; acc[name] = (acc[name] || 0) + v.points; return acc
  }, {})
  const goodBreakdown = goodData.reduce<Record<string, number>>((acc, g) => {
    const name = g.category?.name || 'Lainnya'; acc[name] = (acc[name] || 0) + g.points; return acc
  }, {})

  if (!student) return <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Data siswa belum tersedia</p></CardContent></Card>

  const bl = getBehaviorLevel(student.totalViolationPoints)

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Statistik {authUser?.role === 'SISWA' ? 'Pribadi' : `Anak (${student.name})`}</h2>

      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <Avatar className="h-14 w-14"><AvatarFallback className="bg-emerald-100 text-emerald-700 text-lg">{student.name.charAt(0)}</AvatarFallback></Avatar>
          <div>
            <p className="font-semibold text-lg">{student.name}</p>
            <p className="text-sm text-muted-foreground">{student.class?.name} • NISN: {student.nisn}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={bl.color}>{bl.label} - {bl.handler}</Badge>
              <Badge variant="destructive">{student.totalViolationPoints} poin pelanggaran</Badge>
              <Badge className="bg-yellow-100 text-yellow-800">{student.totalGoodPoints} poin kebaikan</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{attData.length}</p>
          <p className="text-xs text-muted-foreground">Total Hari Tercatat</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{attDist['HADIR'] || 0}</p>
          <p className="text-xs text-muted-foreground">Hari Hadir</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{violData.length}</p>
          <p className="text-xs text-muted-foreground">Pelanggaran</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{goodData.length}</p>
          <p className="text-xs text-muted-foreground">Kebaikan</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="attendance">
        <TabsList className="w-full">
          <TabsTrigger value="attendance" className="flex-1">Kehadiran</TabsTrigger>
          <TabsTrigger value="discipline" className="flex-1">Kedisiplinan</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance" className="space-y-4 mt-4">
          {attPie.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Distribusi Kehadiran</CardTitle>
                  <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(attPie.map(d => `${d.name}: ${d.value}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                    <Copy className="h-3 w-3 mr-1" /> Salin
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart><Pie data={attPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                    {attPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          {attByDate.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Tren Kehadiran</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={attByDate}><CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tanggal" tick={{ fontSize: 9 }} /><YAxis domain={[0, 1]} tick={false} /><Tooltip />
                    <Bar dataKey="status" fill="#10b981" name="Kehadiran" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="discipline" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Indikator Perilaku</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Level Perilaku</span>
                  <Badge className={bl.color}>{bl.label} - {bl.handler}</Badge>
                </div>
                <Progress value={Math.min((student.totalViolationPoints / 200) * 100, 100)} className="h-3" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>L1 (0-50)</span><span>L2 (51-100)</span><span>L3 (101-150)</span><span>L4 (150+)</span>
                </div>
              </div>
            </CardContent>
          </Card>
          <DisciplinePatternChart violations={violData} goodDeeds={goodData} title="Pola Kedisiplinan" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(violBreakdown).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base text-red-700">Rincian Pelanggaran</CardTitle></CardHeader>
                <CardContent>
                  {Object.entries(violBreakdown).sort(([,a],[,b]) => b-a).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{k}</span><span className="font-medium text-red-600">{v} poin</span></div>
                  ))}
                </CardContent>
              </Card>
            )}
            {Object.keys(goodBreakdown).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base text-green-700">Rincian Kebaikan</CardTitle></CardHeader>
                <CardContent>
                  {Object.entries(goodBreakdown).sort(([,a],[,b]) => b-a).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-sm py-1 border-b last:border-0"><span>{k}</span><span className="font-medium text-green-600">{v} poin</span></div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export function StatisticsPage() {
  const [period, setPeriod] = useState('monthly')
  const { classFilter, setClassFilter } = useAppStore()
  const authUser = useAuthStore(s => s.user)
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')

  const isIndividual = authUser?.role === 'SISWA' || authUser?.role === 'ORANG_TUA'

  const myClass = classesData?.classes?.find(c => c.homeroomTeacherId === authUser?.id)
  const effectiveClassFilter = authUser?.role === 'WALI_KELAS' && myClass ? myClass.id : classFilter

  const { data: stats, loading } = useApiFetch<StatisticsData>(`/api/statistics?period=${period}${effectiveClassFilter !== 'all' ? `&classId=${effectiveClassFilter}` : ''}`, [period, effectiveClassFilter])

  const { data: studentsData } = useApiFetch<{ students: Student[] }>(`/api/students?search=`)
  const myStudent = isIndividual ? studentsData?.students?.find(s =>
    authUser?.role === 'SISWA' ? s.user?.id === authUser?.id : s.parents?.some(p => p.user.id === authUser?.id)
  ) : null
  const { data: myAttData } = useApiFetch<{ attendances: AttendanceRecord[] }>(
    myStudent ? `/api/attendance?studentId=${myStudent.id}` : null, [myStudent?.id]
  )
  const { data: myViolData } = useApiFetch<{ violations: ViolationRecord[] }>(
    myStudent ? `/api/violations?studentId=${myStudent.id}` : null, [myStudent?.id]
  )
  const { data: myGoodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>(
    myStudent ? `/api/good-deeds?studentId=${myStudent.id}` : null, [myStudent?.id]
  )

  if (isIndividual) {
    return <IndividualStatistics student={myStudent || null} attData={myAttData?.attendances || []} violData={myViolData?.violations || []} goodData={myGoodData?.goodDeeds || []} />
  }

  const classes = classesData?.classes || []

  if (loading) return <PageSkeleton />

  const statusData = stats?.statusDistribution ? [
    { name: 'Hadir', value: stats.statusDistribution.HADIR, color: STATUS_COLORS.HADIR },
    { name: 'Terlambat', value: stats.statusDistribution.TERLAMBAT, color: STATUS_COLORS.TERLAMBAT },
    { name: 'Izin', value: stats.statusDistribution.IZIN, color: STATUS_COLORS.IZIN },
    { name: 'Sakit', value: stats.statusDistribution.SAKIT, color: STATUS_COLORS.SAKIT },
    { name: 'Alpha', value: stats.statusDistribution.ALPHA, color: STATUS_COLORS.ALPHA },
  ].filter(d => d.value > 0) : []

  const timeData = (stats?.timeSeriesData || []).map(d => ({
    tanggal: d.date.slice(5), hadir: d.hadir, terlambat: d.terlambat, izin: d.izin, sakit: d.sakit, alpha: d.alpha
  }))

  const classData = (stats?.classComparison || []).map(c => ({ name: c.className, persen: c.percentage, hadir: c.hadir, alpha: c.alpha }))

  const violCatData = (stats?.violationByCategory || []).map(c => ({ name: c.name, jumlah: c.count }))
  const topViolators = (stats?.topViolators || []).slice(0, 10).map(s => ({ name: s.name, kelas: s.className, poin: s.violationPoints }))
  const topGood = (stats?.topGoodStudents || []).slice(0, 10).map(s => ({ name: s.name, kelas: s.className, poin: s.goodPoints }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">Statistik</h2>
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-10 w-full sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Harian</SelectItem>
              <SelectItem value="weekly">Mingguan</SelectItem>
              <SelectItem value="monthly">Bulanan</SelectItem>
              <SelectItem value="3months">3 Bulan</SelectItem>
              <SelectItem value="4months">4 Bulan</SelectItem>
              <SelectItem value="1semester">1 Semester</SelectItem>
              <SelectItem value="1year">1 Tahun</SelectItem>
            </SelectContent>
          </Select>
          <Select value={effectiveClassFilter} onValueChange={setClassFilter} disabled={authUser?.role === 'WALI_KELAS'}>
            <SelectTrigger className="h-10 w-full sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {authUser?.role !== 'WALI_KELAS' && <SelectItem value="all">Semua Kelas</SelectItem>}
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-emerald-600">{stats?.attendancePercentage || 0}%</p><p className="text-xs text-muted-foreground">Kehadiran</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold">{stats?.totalStudents || 0}</p><p className="text-xs text-muted-foreground">Total Siswa</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-red-600">{stats?.totalViolations || 0}</p><p className="text-xs text-muted-foreground">Pelanggaran</p></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><p className="text-2xl font-bold text-yellow-600">{stats?.totalGoodDeeds || 0}</p><p className="text-xs text-muted-foreground">Kebaikan</p></CardContent></Card>
      </div>

      <Tabs defaultValue="attendance">
        <TabsList className="w-full">
          <TabsTrigger value="attendance" className="flex-1">Kehadiran</TabsTrigger>
          <TabsTrigger value="discipline" className="flex-1">Kedisiplinan</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Distribusi Status Kehadiran</CardTitle>
                <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(statusData.map(d => `${d.name}: ${d.value}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                  <Copy className="h-3 w-3 mr-1" /> Salin
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                    {statusData.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Tren Kehadiran</CardTitle></CardHeader>
            <CardContent>
              {timeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={timeData}><CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="tanggal" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                    <Legend /><Line type="monotone" dataKey="hadir" stroke={STATUS_COLORS.HADIR} name="Hadir" />
                    <Line type="monotone" dataKey="terlambat" stroke={STATUS_COLORS.TERLAMBAT} name="Terlambat" />
                    <Line type="monotone" dataKey="alpha" stroke={STATUS_COLORS.ALPHA} name="Alpha" />
                  </LineChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Perbandingan Kehadiran per Kelas</CardTitle></CardHeader>
            <CardContent>
              {classData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={classData}><CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis /><Tooltip /><Legend />
                    <Bar dataKey="persen" fill="#10b981" name="Kehadiran %" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="discipline" className="space-y-4 mt-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Distribusi Kategori Pelanggaran</CardTitle></CardHeader>
            <CardContent>
              {violCatData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart><Pie data={violCatData} dataKey="jumlah" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {violCatData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie><Tooltip /></PieChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Pelanggar</CardTitle></CardHeader>
            <CardContent>
              {topViolators.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topViolators} layout="vertical"><CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" /><YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} /><Tooltip />
                    <Bar dataKey="poin" fill="#ef4444" name="Poin Pelanggaran" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Top 10 Siswa Teladan</CardTitle></CardHeader>
            <CardContent>
              {topGood.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topGood} layout="vertical"><CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" /><YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} /><Tooltip />
                    <Bar dataKey="poin" fill="#10b981" name="Poin Kebaikan" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
