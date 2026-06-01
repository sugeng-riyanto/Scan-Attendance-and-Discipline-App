'use client'

import React, { useState } from 'react'
import { useAppStore } from '@/lib/stores/app-store'
import { formatTimeWIB, formatDateShort, getStatusColor } from '@/lib/attendance-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { ClassInfo, AttendanceRecord } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'

export function AttendanceRecordsPage() {
  const { classFilter, setClassFilter, statusFilter, setStatusFilter } = useAppStore()
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [page, setPage] = useState(0)
  const pageSize = 20

  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  const params = new URLSearchParams()
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  if (classFilter && classFilter !== 'all') params.set('classId', classFilter)
  if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter)

  const { data: attData, loading, refetch } = useApiFetch<{ attendances: AttendanceRecord[]; summary: any }>(`/api/attendance?${params.toString()}`, [startDate, endDate, classFilter, statusFilter])

  const classes = classesData?.classes || []
  const attendances = attData?.attendances || []
  const summary = attData?.summary || { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 }
  const paged = attendances.slice(page * pageSize, (page + 1) * pageSize)
  const totalPages = Math.ceil(attendances.length / pageSize)

  const { setActivePage, setSelectedStudentId } = useAppStore()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Rekap Presensi</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-1" /> Refresh</Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><Label className="text-xs">Dari Tanggal</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Sampai Tanggal</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">Kelas</Label>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Kelas</SelectItem>
                  {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="HADIR">Hadir</SelectItem>
                  <SelectItem value="TERLAMBAT">Terlambat</SelectItem>
                  <SelectItem value="IZIN">Izin</SelectItem>
                  <SelectItem value="SAKIT">Sakit</SelectItem>
                  <SelectItem value="ALPHA">Alpha</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 sm:gap-2">
        {[
          { label: 'Hadir', value: summary.hadir, cls: 'bg-green-50 text-green-700' },
          { label: 'Terlambat', value: summary.terlambat, cls: 'bg-yellow-50 text-yellow-700' },
          { label: 'Izin', value: summary.izin, cls: 'bg-blue-50 text-blue-700' },
          { label: 'Sakit', value: summary.sakit, cls: 'bg-purple-50 text-purple-700' },
          { label: 'Alpha', value: summary.alpha, cls: 'bg-red-50 text-red-700' },
        ].map(s => (
          <div key={s.label} className={`p-2 rounded text-center ${s.cls}`}>
            <p className="text-lg font-bold">{s.value}</p><p className="text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? <PageSkeleton /> : (
            <ScrollArea className="max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Nama</TableHead>
                    <TableHead className="text-xs">Kelas</TableHead>
                    <TableHead className="text-xs hidden md:table-cell">Tanggal</TableHead>
                    <TableHead className="text-xs">Masuk</TableHead>
                    <TableHead className="text-xs hidden sm:table-cell">Keluar</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs hidden lg:table-cell">Geo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.map(a => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-emerald-50"
                      onClick={() => { setSelectedStudentId(a.studentId); setActivePage('student-profile') }}>
                      <TableCell className="text-xs py-2">{a.student?.name || '-'}</TableCell>
                      <TableCell className="text-xs py-2">{a.student?.class?.name || '-'}</TableCell>
                      <TableCell className="text-xs py-2 hidden md:table-cell">{a.date ? formatDateShort(a.date) : '-'}</TableCell>
                      <TableCell className="text-xs py-2">{a.checkInTime ? formatTimeWIB(a.checkInTime) : '-'}</TableCell>
                      <TableCell className="text-xs py-2 hidden sm:table-cell">{a.checkOutTime ? formatTimeWIB(a.checkOutTime) : '-'}</TableCell>
                      <TableCell className="py-2"><Badge className={`${getStatusColor(a.status as any)} text-xs`}>{a.status}</Badge></TableCell>
                      <TableCell className="py-2 hidden lg:table-cell">{a.geoVerified ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}</TableCell>
                    </TableRow>
                  ))}
                  {paged.length === 0 && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Tidak ada data</TableCell></TableRow>}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
          <span className="text-sm text-muted-foreground">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Selanjutnya</Button>
        </div>
      )}
    </div>
  )
}
