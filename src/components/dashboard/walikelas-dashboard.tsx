'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
// ScrollArea removed — replaced with plain div for stability
import { Textarea } from '@/components/ui/textarea'
import { Clock, Send, Plus, ChevronRight, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { formatDateShort, getViolationLevelColor, getBehaviorLevel, permissionTypeLabels, permissionStatusLabels } from '@/lib/attendance-utils'
import { apiFetch } from '@/lib/api-fetch'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { DisciplinePatternChart } from './discipline-pattern-chart'
import { ClassInfo, Student, AttendanceRecord, ViolationRecord, GoodDeedRecord, PermissionRecord } from './types'

function StudentEscalationWarning({ classId, onStudentClick }: { classId: string; onStudentClick: (id: string) => void }) {
  const { data } = useApiFetch<{ students: Student[] }>(`/api/students?classId=${classId}`)
  const nearThreshold = (data?.students || []).filter(s => s.totalViolationPoints > 30)

  if (nearThreshold.length === 0) return null
  return (
    <Card className="border-orange-200 bg-orange-50">
      <CardHeader className="pb-2"><CardTitle className="text-base text-orange-700">Mendekati Ambang Batas</CardTitle></CardHeader>
      <CardContent>
        {nearThreshold.map(s => (
          <div key={s.id} className="flex items-center justify-between py-1 cursor-pointer hover:bg-orange-100 rounded px-2"
            onClick={() => onStudentClick(s.id)}>
            <span className="text-sm">{s.name}</span>
            <Badge className={getBehaviorLevel(s.totalViolationPoints).color}>{s.totalViolationPoints} poin - {getBehaviorLevel(s.totalViolationPoints).label}</Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function WaliKelasStudentView({ myClass }: { myClass: ClassInfo }) {
  const { data: studentsData, loading } = useApiFetch<{ students: Student[] }>(`/api/students?classId=${myClass.id}`)
  const { setActivePage, setSelectedStudentId } = useAppStore()
  const students = (studentsData?.students || []).filter(s => s.classId === myClass.id)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Siswa Kelas {myClass.name} ({students.length})</CardTitle>
          <p className="text-xs text-muted-foreground">Manajemen siswa oleh Admin</p>
        </div>
      </CardHeader>
          <CardContent className="p-0 overflow-hidden">
            {loading ? <Skeleton className="h-32 m-4" /> : (
              <div className="max-h-64 overflow-y-auto">
            {students.map(s => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer hover:bg-gray-50 rounded px-1"
                onClick={() => { setSelectedStudentId(s.id); setActivePage('student-profile') }}>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    {(s.photoBase64 || s.photoUrl) ? <img src={s.photoBase64 || s.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <AvatarFallback className="text-xs">{s.name.charAt(0)}</AvatarFallback>}
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">NISN: {s.nisn}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {s.totalViolationPoints > 0 && <Badge className="bg-red-100 text-red-700 text-xs">{s.totalViolationPoints} poin</Badge>}
                  <Badge className={`${s.status === 'AKTIF' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'} text-xs`}>{s.status || 'AKTIF'}</Badge>
                </div>
              </div>
            ))}
            {students.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Belum ada siswa di kelas ini</p>}
            </div>
          )}
        </CardContent>
      </Card>
  )
}

export function WaliKelasDashboard() {
  const { user } = useAuthStore()
  const { setActivePage, setSelectedStudentId } = useAppStore()
  const today = new Date().toISOString().split('T')[0]
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  const myClass = classesData?.classes?.find(c => c.homeroomTeacherId === user?.id)

  const { data: attData, loading: aLoad } = useApiFetch<{ attendances: AttendanceRecord[]; summary: any }>(
    myClass ? `/api/attendance?date=${today}&classId=${myClass.id}` : null, [myClass?.id]
  )
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>(
    myClass ? `/api/violations?classId=${myClass.id}` : null, [myClass?.id]
  )
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>(
    myClass ? `/api/good-deeds?classId=${myClass.id}` : null, [myClass?.id]
  )
  const { data: permData, refetch: permRefetch } = useApiFetch<{ permissions: PermissionRecord[] }>('/api/permissions')
  const { data: studentsData } = useApiFetch<{ students: Student[] }>(
    myClass ? `/api/students?classId=${myClass.id}` : null, [myClass?.id]
  )
  const [showPermForm, setShowPermForm] = useState(false)
  const [permForm, setPermForm] = useState({ studentId: '', type: 'ABSENCE', reason: '', date: new Date().toISOString().split('T')[0], startTime: '07:00', endTime: '14:00' })

  if (aLoad) return <PageSkeleton />

  const summary = attData?.summary || { total: 0, hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0 }
  const recentViol = (violData?.violations || []).slice(0, 5)

  const allClassPermissions = (permData?.permissions || []).filter(p =>
    myClass && p.student?.classId === myClass.id
  )
  const classPermissions = allClassPermissions.filter(p => p.status === 'PENDING')

  const handleApprovePermission = async (id: string, status: string) => {
    try {
      await apiFetch('/api/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, approvedBy: user?.id }),
      })
      toast.success(status === 'APPROVED' ? 'Izin disetujui' : 'Izin ditolak')
      permRefetch()
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengupdate izin')
    }
  }

  const handleCreatePermission = async () => {
    if (!permForm.studentId || !permForm.reason || !permForm.date) { toast.error('Lengkapi semua field'); return }
    if (!user?.id) { toast.error('Sesi login tidak valid'); return }
    try {
      await apiFetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: permForm.studentId,
          type: permForm.type,
          reason: permForm.reason,
          requestedBy: user.id,
          date: permForm.date,
          startTime: permForm.startTime,
          endTime: permForm.endTime,
        }),
      })
      toast.success('Izin berhasil diajukan')
      setShowPermForm(false)
      setPermForm({ studentId: '', type: 'ABSENCE', reason: '', date: new Date().toISOString().split('T')[0], startTime: '07:00', endTime: '14:00' })
      permRefetch()
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengajukan izin')
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard Wali Kelas {myClass?.name || ''}</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Kehadiran Hari Ini</p>
          <p className="text-2xl font-bold text-green-600">{summary.hadir}/{summary.total}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Terlambat</p>
          <p className="text-2xl font-bold text-yellow-600">{summary.terlambat}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Izin/Sakit</p>
          <p className="text-2xl font-bold text-blue-600">{(summary.izin || 0) + (summary.sakit || 0)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Alpha</p>
          <p className="text-2xl font-bold text-red-600">{summary.alpha}</p>
        </CardContent></Card>
      </div>

      {myClass && (
        <StudentEscalationWarning classId={myClass.id} onStudentClick={(id) => { setSelectedStudentId(id); setActivePage('student-profile') }} />
      )}

      {classPermissions.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-yellow-800 flex items-center gap-2">
                <Clock className="h-4 w-4" /> Izin Menunggu Persetujuan ({classPermissions.length})
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setActivePage('permissions')}>
                Lihat Semua <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {classPermissions.slice(0, 5).map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium flex items-center gap-1">{p.student?.name} {p.attachmentData && <span className="text-[10px] text-blue-600">📎</span>}</p>
                  <p className="text-xs text-muted-foreground">
                    {permissionTypeLabels[p.type] || p.type} • {formatDateShort(p.date)} • {p.reason}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs text-green-600 border-green-300 hover:bg-green-50"
                    onClick={() => handleApprovePermission(p.id, 'APPROVED')}>Setujui</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => handleApprovePermission(p.id, 'REJECTED')}>Tolak</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {myClass && (
        <Card className="border-emerald-200">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Send className="h-4 w-4 text-emerald-600" /> Ajukan Izin Siswa
              </CardTitle>
              <Button size="sm" variant={showPermForm ? 'outline' : 'default'}
                className={!showPermForm ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                onClick={() => setShowPermForm(!showPermForm)}>
                {showPermForm ? 'Tutup' : <><Plus className="h-4 w-4 mr-1" /> Ajukan Izin</>}
              </Button>
            </div>
          </CardHeader>
          {showPermForm && (
            <CardContent className="space-y-3">
              <div><Label>Siswa</Label>
                <Select value={permForm.studentId} onValueChange={v => setPermForm(p => ({ ...p, studentId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih siswa" /></SelectTrigger>
                  <SelectContent>
                    {(studentsData?.students || []).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} - {s.nisn}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Jenis Izin</Label>
                <Select value={permForm.type} onValueChange={v => setPermForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(permissionTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Tanggal</Label>
                <Input type="date" value={permForm.date} onChange={e => setPermForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Jam Mulai</Label>
                  <Input type="time" value={permForm.startTime} onChange={e => setPermForm(p => ({ ...p, startTime: e.target.value }))} />
                </div>
                <div><Label>Jam Selesai</Label>
                  <Input type="time" value={permForm.endTime} onChange={e => setPermForm(p => ({ ...p, endTime: e.target.value }))} />
                </div>
              </div>
              <div><Label>Alasan</Label>
                <Textarea value={permForm.reason} onChange={e => setPermForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="Tuliskan alasan izin..." />
              </div>
              <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleCreatePermission}>
                <Send className="h-4 w-4 mr-2" /> Kirim Permohonan Izin
              </Button>
            </CardContent>
          )}
        </Card>
      )}

      {allClassPermissions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Semua Permohonan Izin Kelas ({allClassPermissions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-hidden">
            <div className="max-h-64 overflow-y-auto">
              {allClassPermissions.map(p => (
                <div key={p.id} className="flex items-center justify-between py-2 px-4 border-b last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.student?.name} {p.attachmentData && <span className="text-[10px] text-blue-600">📎</span>}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {permissionTypeLabels[p.type] || p.type} • {formatDateShort(p.date)} • {p.reason}
                    </p>
                  </div>
                  <Badge className={p.status === 'APPROVED' ? 'bg-green-100 text-green-800' : p.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                    {permissionStatusLabels[p.status] || p.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {recentViol.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Pelanggaran Terkini di Kelas</CardTitle></CardHeader>
          <CardContent>
            {recentViol.map(v => (
              <div key={v.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{v.student?.name}</p>
                  <p className="text-xs text-muted-foreground">{v.category?.name} • {formatDateShort(v.date)}</p>
                </div>
                <Badge className={getViolationLevelColor(v.category?.level || '')}>{v.points} poin</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <DisciplinePatternChart violations={violData?.violations || []} goodDeeds={goodData?.goodDeeds || []} title={`Pola Kedisiplinan Kelas ${myClass?.name || ''}`} />

      {myClass && (
        <WaliKelasStudentView myClass={myClass} />
      )}
    </div>
  )
}
