'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { formatDateShort, permissionTypeLabels, permissionStatusLabels } from '@/lib/attendance-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Plus, AlertCircle } from 'lucide-react'
import { Student, ClassInfo, PermissionRecord } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'

export function PermissionsPage() {
  const { user } = useAuthStore()
  const { setActivePage, setSelectedStudentId } = useAppStore()
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [formData, setFormData] = useState({ studentId: '', type: 'ABSENCE', reason: '', date: new Date().toISOString().split('T')[0], startTime: '07:00', endTime: '14:00' })

  const { data: studentsData } = useApiFetch<{ students: Student[] }>('/api/students')
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  const { data: permData, loading, refetch } = useApiFetch<{ permissions: PermissionRecord[] }>(`/api/permissions?status=${statusFilter !== 'all' ? statusFilter : ''}`, [statusFilter])

  const myChild = studentsData?.students?.find(s => s.parents?.some(p => p.user.id === user?.id))

  const myClass = classesData?.classes?.find(c => c.homeroomTeacherId === user?.id)

  const permissions = permData?.permissions || []
  const students = studentsData?.students || []

  const filteredPermissions = permissions.filter(p => {
    if (user?.role === 'ORANG_TUA') return p.studentId === myChild?.id
    if (user?.role === 'WALI_KELAS' && myClass) return p.student?.classId === myClass.id || p.studentId === myChild?.id
    return true
  })

  const availableStudents = user?.role === 'ORANG_TUA' && myChild ? [myChild] : students

  const handleCreate = async () => {
    if (!formData.studentId || !formData.reason || !formData.date) { toast.error('Lengkapi semua field'); return }
    try {
      await apiFetch('/api/permissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: formData.studentId, type: formData.type, reason: formData.reason,
          requestedBy: user?.id, date: formData.date,
          startTime: formData.startTime, endTime: formData.endTime
        })
      })
      toast.success('Izin berhasil diajukan')
      setShowCreate(false)
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleApprove = async (id: string, status: string) => {
    try {
      await apiFetch('/api/permissions', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status, approvedBy: user?.id })
      })
      toast.success(status === 'APPROVED' ? 'Izin disetujui' : 'Izin ditolak')
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const canApprove = user?.role === 'ADMIN' || user?.role === 'KEPALA_SEKOLAH' || user?.role === 'VP_KESISWAAN' || user?.role === 'WALI_KELAS'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Izin</h2>
        <Button data-permission-create className="bg-emerald-600 hover:bg-emerald-700" onClick={() => {
          if (user?.role === 'ORANG_TUA' && myChild) {
            setFormData(prev => ({ ...prev, studentId: myChild.id }))
          }
          setShowCreate(true)
        }}><Plus className="h-4 w-4 mr-1" /> Ajukan Izin</Button>
      </div>

      {user?.role === 'ORANG_TUA' && !myChild && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="p-4 text-center">
            <AlertCircle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
            <p className="text-sm text-yellow-700">Data anak belum terhubung. Hubungi admin sekolah.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        {['all', 'PENDING', 'APPROVED', 'REJECTED'].map(s => (
          <Button key={s} variant={statusFilter === s ? 'default' : 'outline'} size="sm"
            className={statusFilter === s ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => setStatusFilter(s)}>
            {s === 'all' ? 'Semua' : permissionStatusLabels[s] || s}
          </Button>
        ))}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajukan Izin</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Siswa</Label>
              <Select value={formData.studentId} onValueChange={v => setFormData(p => ({ ...p, studentId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih siswa" /></SelectTrigger>
                <SelectContent>
                  {availableStudents.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} - {s.class?.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Jenis Izin</Label>
              <Select value={formData.type} onValueChange={v => setFormData(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(permissionTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Tanggal</Label><Input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Jam Mulai</Label><Input type="time" value={formData.startTime} onChange={e => setFormData(p => ({ ...p, startTime: e.target.value }))} /></div>
              <div><Label>Jam Selesai</Label><Input type="time" value={formData.endTime} onChange={e => setFormData(p => ({ ...p, endTime: e.target.value }))} /></div>
            </div>
              <div><Label>Alasan / Deskripsi</Label><Textarea value={formData.reason} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate}>Kirim</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? <PageSkeleton /> : (
        <div className="space-y-3">
          {filteredPermissions.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="cursor-pointer" onClick={() => { setSelectedStudentId(p.studentId); setActivePage('student-profile') }}>
                    <p className="font-medium">{p.student?.name}</p>
                    <p className="text-xs text-muted-foreground">{p.student?.class?.name} • {formatDateShort(p.date)}</p>
                    <p className="text-sm mt-1">{p.reason}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">{permissionTypeLabels[p.type] || p.type}</Badge>
                      {p.attachmentData && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">📎 Lampiran</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge className={p.status === 'APPROVED' ? 'bg-green-100 text-green-800' : p.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                      {permissionStatusLabels[p.status] || p.status}
                    </Badge>
                    {canApprove && p.status === 'PENDING' && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 text-xs text-green-600" onClick={() => handleApprove(p.id, 'APPROVED')}>Setujui</Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-600" onClick={() => handleApprove(p.id, 'REJECTED')}>Tolak</Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filteredPermissions.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Tidak ada data izin</CardContent></Card>}
        </div>
      )}
    </div>
  )
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Gagal menghubungi server' }))
    throw new Error(data.error || 'Terjadi kesalahan')
  }
  return res.json()
}
