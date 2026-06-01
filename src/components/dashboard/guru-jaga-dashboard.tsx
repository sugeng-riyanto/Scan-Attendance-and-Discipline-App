'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { Users, UserCheck, Timer, UserX, Clock, Copy, FileSpreadsheet, FileDown, Shield, RefreshCw } from 'lucide-react'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { useSchoolConfig } from './hooks/use-school-config'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { ScanSessionToggle } from './scan-session-toggle'
import { STATUS_COLORS } from './chart-constants'
import { ClassInfo, Student, AttendanceRecord } from './types'
import { formatTimeWIB } from '@/lib/attendance-utils'

export function GuruJagaDashboard() {
  const schoolConfig = useSchoolConfig()
  const today = new Date().toISOString().split('T')[0]
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  const { data: attData, loading: attLoad, refetch: attRefetch } = useApiFetch<{ attendances: AttendanceRecord[]; summary: any }>(`/api/attendance?date=${today}`)
  const { data: dutyData } = useApiFetch<{ schedules: any[] }>('/api/duty-schedule')
  const { data: studentsData } = useApiFetch<{ students: Student[] }>('/api/students')
  const [shift, setShift] = useState<'PAGI' | 'SORE'>('PAGI')
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(() => { attRefetch() }, 30000)
    return () => clearInterval(interval)
  }, [autoRefresh, attRefetch])

  const tz = schoolConfig.timezone || 'Asia/Jakarta'
  const formatTZ = (iso: string) => {
    if (!iso) return '-'
    try { return new Date(iso).toLocaleTimeString('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit' }) } catch { return formatTimeWIB(iso) }
  }
  const nowStr = new Date().toLocaleTimeString('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const dateStr = new Date().toLocaleDateString('id-ID', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const classes = classesData?.classes || []
  const attendances = attData?.attendances || []
  const students = studentsData?.students || []
  const summary = attData?.summary || { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 }
  const dutySchedules = dutyData?.schedules || []

  const classBreakdown = classes.map(c => {
    const classStudents = students.filter(s => s.classId === c.id)
    const classAtt = attendances.filter(a => a.student?.classId === c.id)
    const checkedIn = classAtt.filter(a => a.status === 'HADIR' || a.status === 'TERLAMBAT').length
    const late = classAtt.filter(a => a.status === 'TERLAMBAT').length
    const hadir = classAtt.filter(a => a.status === 'HADIR').length
    const izin = classAtt.filter(a => a.status === 'IZIN').length
    const sakit = classAtt.filter(a => a.status === 'SAKIT').length
    const alpha = classAtt.filter(a => a.status === 'ALPHA').length
    const notYet = classStudents.length - classAtt.length
    const pct = classStudents.length > 0 ? Math.round((checkedIn / classStudents.length) * 100) : 0
    return { id: c.id, name: c.name, total: classStudents.length, checkedIn, hadir, late, izin, sakit, alpha, notYet: Math.max(0, notYet), pct }
  })

  const histData = classBreakdown.map(c => ({ name: c.name, persen: c.pct }))

  const timeDist: Record<string, number> = {}
  attendances.forEach(a => {
    if (a.checkInTime) {
      try {
        const h = new Date(a.checkInTime).toLocaleTimeString('id-ID', { timeZone: tz, hour: '2-digit', hour12: false })
        timeDist[h] = (timeDist[h] || 0) + 1
      } catch {}
    }
  })
  const timeSeriesData = Object.entries(timeDist).sort(([a], [b]) => a.localeCompare(b)).map(([h, c]) => ({ jam: `${h}:00`, jumlah: c }))

  const statusPie = [
    { name: 'Hadir', value: summary.hadir || 0, color: STATUS_COLORS.HADIR },
    { name: 'Terlambat', value: summary.terlambat || 0, color: STATUS_COLORS.TERLAMBAT },
    { name: 'Alpha', value: summary.alpha || 0, color: STATUS_COLORS.ALPHA },
    { name: 'Izin', value: summary.izin || 0, color: STATUS_COLORS.IZIN },
    { name: 'Sakit', value: summary.sakit || 0, color: STATUS_COLORS.SAKIT },
  ].filter(d => d.value > 0)

  const handleExportXlsx = async () => {
    try {
      const params = new URLSearchParams({ type: 'attendance', startDate: today, endDate: today })
      const res = await fetch(`/api/export?${params.toString()}`)
      if (!res.ok) throw new Error('Gagal export')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `presensi_${today}.xlsx`; a.click()
      URL.revokeObjectURL(url)
      toast.success('File XLSX berhasil diunduh')
    } catch (err: any) { toast.error(err.message) }
  }

  const handleExportPdf = () => {
    window.open(`/api/export-pdf?type=attendance&startDate=${today}&endDate=${today}`, '_blank')
  }

  if (attLoad) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Monitor Presensi</h2>
          <p className="text-sm text-muted-foreground">{dateStr} • {nowStr} ({tz})</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={shift} onValueChange={v => setShift(v as 'PAGI' | 'SORE')}>
            <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PAGI">Pagi</SelectItem>
              <SelectItem value="SORE">Sore</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { attRefetch(); toast.success('Data diperbarui') }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Switch checked={autoRefresh} onCheckedChange={setAutoRefresh} />
            <span className="text-xs text-muted-foreground">Auto 30s</span>
          </div>
        </div>
      </div>

      {dutySchedules.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              <span className="font-semibold text-sm">Guru Jaga Hari Ini</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {dutySchedules.map((d: any, i: number) => (
                <Badge key={i} className="bg-emerald-100 text-emerald-800">{d.teacher?.name || d.name || '-'} ({d.shift || 'Pagi'})</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-emerald-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-emerald-600" />
              <span className="font-semibold text-sm">Scanner Presensi (/scan)</span>
            </div>
            <div className="flex items-center gap-2">
              <ScanSessionToggle />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 text-gray-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{summary.total}</p><p className="text-xs text-muted-foreground">Total Siswa</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <UserCheck className="h-5 w-5 text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-green-600">{summary.hadir}</p><p className="text-xs text-muted-foreground">Hadir</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Timer className="h-5 w-5 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-yellow-600">{summary.terlambat}</p><p className="text-xs text-muted-foreground">Terlambat</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <UserX className="h-5 w-5 text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-red-600">{summary.alpha}</p><p className="text-xs text-muted-foreground">Alpha</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Clock className="h-5 w-5 text-blue-500 mx-auto mb-1" />
          <p className="text-2xl font-bold text-blue-600">{(summary.izin || 0) + (summary.sakit || 0)}</p><p className="text-xs text-muted-foreground">Izin/Sakit</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Progres Kehadiran Keseluruhan</CardTitle>
            <span className="text-sm font-semibold text-emerald-600">{summary.total > 0 ? Math.round(((summary.hadir + summary.terlambat) / summary.total) * 100) : 0}%</span>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={summary.total > 0 ? ((summary.hadir + summary.terlambat) / summary.total) * 100 : 0} className="h-3" />
          <p className="text-xs text-muted-foreground mt-1">{summary.hadir + summary.terlambat} dari {summary.total} siswa sudah presensi</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Progres per Kelas</CardTitle>
            <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(classBreakdown.map(c => `${c.name}: ${c.checkedIn}/${c.total} (${c.pct}%) - Hadir:${c.hadir} Terlambat:${c.late} Alpha:${c.alpha}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
              <Copy className="h-3 w-3 mr-1" /> Salin
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {classBreakdown.map(c => (
              <div key={c.id} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.checkedIn}/{c.total} ({c.pct}%)</span>
                </div>
                <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-green-500 rounded-l-full" style={{ width: `${c.total > 0 ? (c.hadir / c.total) * 100 : 0}%` }} title={`Hadir: ${c.hadir}`} />
                  <div className="bg-yellow-400" style={{ width: `${c.total > 0 ? (c.late / c.total) * 100 : 0}%` }} title={`Terlambat: ${c.late}`} />
                  <div className="bg-red-500" style={{ width: `${c.total > 0 ? (c.alpha / c.total) * 100 : 0}%` }} title={`Alpha: ${c.alpha}`} />
                  <div className="bg-blue-400" style={{ width: `${c.total > 0 ? (c.izin / c.total) * 100 : 0}%` }} title={`Izin: ${c.izin}`} />
                  <div className="bg-purple-400" style={{ width: `${c.total > 0 ? (c.sakit / c.total) * 100 : 0}%` }} title={`Sakit: ${c.sakit}`} />
                  <div className="bg-gray-200 rounded-r-full" style={{ width: `${c.total > 0 ? (c.notYet / c.total) * 100 : 0}%` }} title={`Belum: ${c.notYet}`} />
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="text-green-600">Hadir: {c.hadir}</span>
                  <span className="text-yellow-600">Terlambat: {c.late}</span>
                  <span className="text-red-600">Alpha: {c.alpha}</span>
                  <span className="text-gray-500">Belum: {c.notYet}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-2">
        <CardHeader className="pb-2"><CardTitle className="text-base">Grafik Kehadiran</CardTitle></CardHeader>
        <CardContent className="p-4">
          <Tabs defaultValue="histogram" className="w-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="histogram">Kehadiran %</TabsTrigger>
              <TabsTrigger value="distribution">Distribusi Status</TabsTrigger>
              <TabsTrigger value="detail">Detail per Kelas</TabsTrigger>
            </TabsList>
            <TabsContent value="histogram" className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Kehadiran per Kelas (%)</p>
                <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(histData.map(d => `${d.name}: ${d.persen}%`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                  <Copy className="h-3 w-3 mr-1" /> Salin
                </Button>
              </div>
              {histData.length > 0 ? (
                <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={histData}><CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="persen" fill="#10b981" name="Kehadiran %" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </TabsContent>
            <TabsContent value="distribution" className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Distribusi Status</p>
                <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(statusPie.map(d => `${d.name}: ${d.value}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                  <Copy className="h-3 w-3 mr-1" /> Salin
                </Button>
              </div>
              {statusPie.length > 0 ? (
                <div style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={statusPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {statusPie.map((d, i) => <Cell key={i} fill={d.color} />)}
                  </Pie><Tooltip /><Legend /></PieChart>
                </ResponsiveContainer>
                </div>
              ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
            </TabsContent>
            <TabsContent value="detail" className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Detail Kehadiran per Kelas</p>
                <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(classBreakdown.map(c => `${c.name}: Hadir ${c.hadir}, Terlambat ${c.late}, Alpha ${c.alpha}, Belum ${c.notYet} (${c.pct}%)`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                  <Copy className="h-3 w-3 mr-1" /> Salin
                </Button>
              </div>
              <ScrollArea className="max-h-[280px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Kelas</TableHead>
                      <TableHead className="text-xs text-center">Hadir</TableHead>
                      <TableHead className="text-xs text-center">Terlambat</TableHead>
                      <TableHead className="text-xs text-center">Alpha</TableHead>
                      <TableHead className="text-xs text-center">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {classBreakdown.map(c => (
                      <TableRow key={c.id}>
                        <TableCell className="text-xs font-medium">{c.name}</TableCell>
                        <TableCell className="text-xs text-center text-green-600">{c.hadir}</TableCell>
                        <TableCell className="text-xs text-center text-yellow-600">{c.late}</TableCell>
                        <TableCell className="text-xs text-center text-red-600">{c.alpha}</TableCell>
                        <TableCell className="text-xs text-center font-semibold">{c.pct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {timeSeriesData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Distribusi Waktu Check-in</CardTitle>
              <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { navigator.clipboard.writeText(timeSeriesData.map(d => `${d.jam}: ${d.jumlah}`).join('\n')); toast.success('Data disalin ke clipboard') }}>
                <Copy className="h-3 w-3 mr-1" /> Salin
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={timeSeriesData}><CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="jam" tick={{ fontSize: 10 }} /><YAxis /><Tooltip />
                <Line type="monotone" dataKey="jumlah" stroke="#10b981" name="Jumlah Check-in" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 flex gap-3 flex-wrap">
          <Button variant="outline" onClick={handleExportXlsx}>
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Export XLSX
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            <FileDown className="h-4 w-4 mr-2" /> Export PDF
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
