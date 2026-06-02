'use client'

import React, { useState, useRef } from 'react'
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
import { Plus, AlertCircle, Camera, Paperclip, FileText } from 'lucide-react'
import { Student, ClassInfo, PermissionRecord } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'

export function PermissionsPage() {
  const { user } = useAuthStore()
  const { setActivePage, setSelectedStudentId } = useAppStore()
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [formData, setFormData] = useState({ studentId: '', type: 'ABSENCE', reason: '', date: new Date().toISOString().split('T')[0], startTime: '07:00', endTime: '14:00' })
  const [attachment, setAttachment] = useState<{ data: string; type: string; name: string } | null>(null)
  const [previewAttach, setPreviewAttach] = useState<PermissionRecord | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({ data: reader.result as string, type: file.type, name: file.name })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleCreate = async () => {
    if (!formData.studentId || !formData.reason || !formData.date) { toast.error('Lengkapi semua field'); return }
    try {
      await apiFetch('/api/permissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: formData.studentId, type: formData.type, reason: formData.reason,
          requestedBy: user?.id, date: formData.date,
          startTime: formData.startTime, endTime: formData.endTime,
          attachmentData: attachment?.data, attachmentType: attachment?.type, attachmentName: attachment?.name,
        })
      })
      toast.success('Izin berhasil diajukan')
      setShowCreate(false)
      setAttachment(null)
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
        <DialogContent className="max-h-[90vh] overflow-y-auto">
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
            <div><Label>Alasan / Deskripsi</Label><Textarea value={formData.reason} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={2} /></div>

            {/* Attachment */}
            <div>
              <Label className="text-xs text-muted-foreground">Lampiran (opsional — foto/PDF)</Label>
              <div className="flex gap-2 mt-1">
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="h-3.5 w-3.5 mr-1" /> Kamera
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5 mr-1" /> File
                </Button>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />
                <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileSelect} />
              </div>
              {attachment && (
                <div className="mt-2 relative inline-block">
                  {attachment.type === 'application/pdf' ? (
                    <div className="flex items-center gap-2 bg-blue-50 border rounded-lg p-2 pr-8">
                      <FileText className="h-5 w-5 text-blue-600" />
                      <span className="text-xs truncate max-w-[150px]">{attachment.name}</span>
                    </div>
                  ) : (
                    <img src={attachment.data} alt="" className="max-h-20 rounded-lg border" />
                  )}
                  <button onClick={() => setAttachment(null)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">✕</button>
                </div>
              )}
            </div>

            <p className="text-[10px] text-gray-400">📁 Lampiran akan dihapus sistem setelah 3 bulan. Data izin tetap tersimpan.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setAttachment(null) }}>Batal</Button>
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
                  <div className="cursor-pointer min-w-0 flex-1" onClick={() => { setSelectedStudentId(p.studentId); setActivePage('student-profile') }}>
                    <p className="font-medium">{p.student?.name}</p>
                    <p className="text-xs text-muted-foreground">{p.student?.class?.name} • {formatDateShort(p.date)}</p>
                    <p className="text-sm mt-1">{p.reason}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <Badge variant="outline">{permissionTypeLabels[p.type] || p.type}</Badge>
                      {p.attachmentData && (
                        <button onClick={e => { e.stopPropagation(); setPreviewAttach(p) }} className="text-[10px] text-blue-600 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded transition-colors">
                          📎 Lampiran
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0 ml-2">
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

      {/* Attachment Preview Modal */}
      {previewAttach && previewAttach.attachmentData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewAttach(null)}>
          <div className="relative bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewAttach(null)} className="absolute top-2 right-2 bg-gray-200 hover:bg-gray-300 rounded-full w-8 h-8 flex items-center justify-center text-sm">✕</button>
            <p className="font-medium text-sm mb-3">Lampiran: {previewAttach.attachmentName || 'Dokumen'}</p>
            {previewAttach.attachmentType === 'application/pdf' ? (
              <embed src={previewAttach.attachmentData} type="application/pdf" className="w-full h-[60vh] rounded" />
            ) : (
              <img src={previewAttach.attachmentData} alt="Lampiran" className="max-w-full rounded" />
            )}
            <p className="text-[10px] text-gray-400 mt-3">📁 Lampiran akan dihapus sistem setelah 3 bulan. Data izin tetap tersimpan.</p>
          </div>
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
