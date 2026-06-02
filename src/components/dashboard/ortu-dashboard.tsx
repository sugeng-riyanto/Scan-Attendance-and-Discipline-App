'use client'

import React, { useState, useCallback, useRef } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { formatTimeWIB, formatDateShort, getStatusColor, getBehaviorLevel, permissionTypeLabels, permissionStatusLabels } from '@/lib/attendance-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle, AlertCircle, CheckCircle, Clock, Plus, Send, RefreshCw, Star, CreditCard, QrCode, Eye, Image, Download, User, GraduationCap, BookOpen, Calendar, Shield, Camera, Paperclip, FileText, X } from 'lucide-react'
import { Student, BehaviorAlert, AttendanceRecord, ViolationRecord, GoodDeedRecord, PermissionRecord } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { DisciplinePatternChart } from './discipline-pattern-chart'

function InlinePermissionForm({ studentId, studentName, requestedBy, onSuccess }: {
  studentId: string; studentName: string; requestedBy: string; onSuccess: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    type: 'ABSENCE',
    reason: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '07:00',
    endTime: '14:00',
  })
  const [attachment, setAttachment] = useState<{ data: string; type: string; name: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setAttachment({
        data: reader.result as string,
        type: file.type,
        name: file.name,
      })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleSubmit = async () => {
    if (!requestedBy) { toast.error('Sesi login tidak valid. Silakan login ulang.'); return }
    if (!form.reason || !form.date) { toast.error('Lengkapi Alasan/Deskripsi dan tanggal'); return }
    setSubmitting(true)
    try {
      await apiFetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          type: form.type,
          reason: form.reason,
          requestedBy,
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          attachmentData: attachment?.data,
          attachmentType: attachment?.type,
          attachmentName: attachment?.name,
        }),
      })
      toast.success('Izin berhasil diajukan')
      setExpanded(false)
      setForm({ type: 'ABSENCE', reason: '', date: new Date().toISOString().split('T')[0], startTime: '07:00', endTime: '14:00' })
      setAttachment(null)
      onSuccess()
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengajukan izin')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-emerald-200">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4 text-emerald-600" /> Izin Siswa
          </CardTitle>
          <Button size="sm" variant={expanded ? 'outline' : 'default'}
            className={!expanded ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
            onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Tutup' : <><Plus className="h-4 w-4 mr-1" /> Ajukan Izin</>}
          </Button>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Mengajukan izin untuk <strong>{studentName}</strong></p>
          <div><Label>Jenis Izin</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(permissionTypeLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Tanggal</Label>
            <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Jam Mulai</Label>
              <Input type="time" value={form.startTime} onChange={e => setForm(p => ({ ...p, startTime: e.target.value }))} />
            </div>
            <div><Label>Jam Selesai</Label>
              <Input type="time" value={form.endTime} onChange={e => setForm(p => ({ ...p, endTime: e.target.value }))} />
            </div>
          </div>
          <div><Label>Alasan / Deskripsi</Label>
            <Textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="Tuliskan alasan/deskripsi izin..." />
          </div>

          {/* Attachment upload */}
          <div>
            <Label className="text-xs text-muted-foreground">Lampiran (opsional — foto, PDF)</Label>
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
                  <div className="relative">
                    <img src={attachment.data} alt="Lampiran" className="max-h-24 rounded-lg border" />
                  </div>
                )}
                <button onClick={() => setAttachment(null)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">✕</button>
              </div>
            )}
          </div>

          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit} disabled={submitting}>
            {submitting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            {submitting ? 'Mengirim...' : 'Kirim Permohonan Izin'}
          </Button>
          <p className="text-[10px] text-gray-400 text-center">Lampiran akan dihapus sistem setelah 3 bulan. Data izin tetap tersimpan. 📁</p>
        </CardContent>
      )}
    </Card>
  )
}

function OrtuPermissionList({ studentId }: { studentId: string }) {
  const { data: permData, loading, refetch } = useApiFetch<{ permissions: PermissionRecord[] }>(
    `/api/permissions?studentId=${studentId}`, [studentId]
  )
  const permissions = permData?.permissions || []
  const [previewAttach, setPreviewAttach] = useState<PermissionRecord | null>(null)

  if (loading) return <Skeleton className="h-32" />
  if (permissions.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-emerald-600" /> Riwayat Permohonan Izin
          </CardTitle>
          <Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { refetch(); toast.success('Data diperbarui') }}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-64 overflow-y-auto space-y-0">
          {permissions.map(p => (
            <div key={p.id} className="py-2 border-b last:border-0">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{permissionTypeLabels[p.type] || p.type}</p>
                  <p className="text-xs text-muted-foreground">{formatDateShort(p.date)} • {p.reason}</p>
                  {p.startTime && p.endTime && <p className="text-xs text-muted-foreground">{p.startTime} - {p.endTime}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {(p as any).attachmentData && (
                    <button onClick={() => setPreviewAttach(p)} className="text-[10px] text-blue-600 hover:text-blue-800 underline">
                      📎 Lampiran
                    </button>
                  )}
                  <Badge className={p.status === 'APPROVED' ? 'bg-green-100 text-green-800' : p.status === 'REJECTED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}>
                    {permissionStatusLabels[p.status] || p.status}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Attachment Preview Modal */}
      {previewAttach && (previewAttach as any).attachmentData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewAttach(null)}>
          <div className="relative bg-white rounded-xl max-w-lg w-full max-h-[80vh] overflow-auto p-4" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPreviewAttach(null)} className="absolute top-2 right-2 bg-gray-200 hover:bg-gray-300 rounded-full w-8 h-8 flex items-center justify-center text-sm">✕</button>
            <p className="font-medium text-sm mb-3">Lampiran: {(previewAttach as any).attachmentName || 'Dokumen'}</p>
            {(previewAttach as any).attachmentType === 'application/pdf' ? (
              <embed src={(previewAttach as any).attachmentData} type="application/pdf" className="w-full h-[60vh] rounded" />
            ) : (
              <img src={(previewAttach as any).attachmentData} alt="Lampiran" className="max-w-full rounded" />
            )}
          </div>
        </div>
      )}
    </Card>
  )
}

export function OrtuDashboard() {
  const { user } = useAuthStore()
  const { setActivePage, setSelectedStudentId } = useAppStore()
  const { data: studentsData } = useApiFetch<{ students: Student[] }>(`/api/students?search=`)
  const myChild = studentsData?.students?.find(s => s.parents?.some(p => p.user.id === user?.id))
  const { data: alertData } = useApiFetch<{ alerts: BehaviorAlert[] }>('/api/alerts?targetRole=ORANG_TUA')
  const alerts = alertData?.alerts || []

  const today = new Date().toISOString().split('T')[0]
  const { data: attData } = useApiFetch<{ attendances: AttendanceRecord[] }>(
    myChild ? `/api/attendance?studentId=${myChild.id}` : null, [myChild?.id]
  )
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>(
    myChild ? `/api/violations?studentId=${myChild.id}` : null, [myChild?.id]
  )
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>(
    myChild ? `/api/good-deeds?studentId=${myChild.id}` : null, [myChild?.id]
  )
  const { data: permData, refetch: permRefetch } = useApiFetch<{ permissions: PermissionRecord[] }>(
    myChild ? `/api/permissions?studentId=${myChild.id}` : null, [myChild?.id]
  )

  const todayAtt = attData?.attendances?.[0]
  const bl = myChild ? getBehaviorLevel(myChild.totalViolationPoints) : null

  const [summonsRead, setSummonsRead] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('summons_read') || '[]')) } catch { return new Set() }
  })
  const markSummonsRead = (id: string) => {
    const next = new Set(summonsRead); next.add(id)
    setSummonsRead(next)
    localStorage.setItem('summons_read', JSON.stringify([...next]))
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard Orang Tua</h2>

      {alerts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-2"><CardTitle className="text-base text-orange-700">⚠️ Peringatan Kedisiplinan</CardTitle></CardHeader>
          <CardContent>
            {alerts.slice(0, 5).map(a => (
              <div key={a.id} className="flex items-start gap-2 py-2 border-b last:border-0">
                <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{a.student?.name || ''}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {myChild ? (
        <>
          {myChild.totalViolationPoints >= 50 && (
            <>
              {myChild.totalViolationPoints >= 150 && !summonsRead.has(`l4_${myChild.id}`) && (
                <Card className="border-red-400 bg-red-50 shadow-lg">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-red-200 shrink-0"><AlertTriangle className="h-6 w-6 text-red-700" /></div>
                      <div className="flex-1">
                        <h3 className="font-bold text-red-800 text-lg">⚠️ PEMANGGILAN ORANG TUA</h3>
                        <p className="text-sm text-red-700 mt-1">
                          Pemanggilan orang tua diperlukan karena anak Anda telah mencapai <strong>Level 4</strong> kedisiplinan
                        </p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div><span className="text-red-600">Nama:</span> <strong>{myChild.name}</strong></div>
                          <div><span className="text-red-600">NISN:</span> <strong>{myChild.nisn}</strong></div>
                          <div><span className="text-red-600">Kelas:</span> <strong>{myChild.class?.name}</strong></div>
                          <div><span className="text-red-600">Poin:</span> <strong>{myChild.totalViolationPoints}</strong></div>
                        </div>
                        <Badge className="bg-red-700 text-white mt-2">Level 4 - Pemanggilan Ortu</Badge>
                        <Button variant="outline" size="sm" className="mt-3 border-red-400 text-red-700 hover:bg-red-100"
                          onClick={() => markSummonsRead(`l4_${myChild.id}`)}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Saya Sudah Membaca
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {myChild.totalViolationPoints >= 100 && myChild.totalViolationPoints < 150 && !summonsRead.has(`l3_${myChild.id}`) && (
                <Card className="border-orange-300 bg-orange-50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-orange-200 shrink-0"><AlertCircle className="h-5 w-5 text-orange-700" /></div>
                      <div className="flex-1">
                        <h3 className="font-bold text-orange-800">Peringatan Level 3 - Kepala Sekolah</h3>
                        <p className="text-sm text-orange-700">Kasus diserahkan ke Kepala Sekolah. Nama: {myChild.name} • {myChild.totalViolationPoints} poin</p>
                        <Button variant="outline" size="sm" className="mt-2 border-orange-400 text-orange-700"
                          onClick={() => markSummonsRead(`l3_${myChild.id}`)}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Saya Sudah Membaca
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              {myChild.totalViolationPoints >= 50 && myChild.totalViolationPoints < 100 && !summonsRead.has(`l2_${myChild.id}`) && (
                <Card className="border-yellow-300 bg-yellow-50">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-full bg-yellow-200 shrink-0"><AlertCircle className="h-5 w-5 text-yellow-700" /></div>
                      <div className="flex-1">
                        <h3 className="font-bold text-yellow-800">Peringatan Level 2 - Wakasek Kesiswaan</h3>
                        <p className="text-sm text-yellow-700">Kasus ditangani Wakasek Kesiswaan. Nama: {myChild.name} • {myChild.totalViolationPoints} poin</p>
                        <Button variant="outline" size="sm" className="mt-2 border-yellow-400 text-yellow-700"
                          onClick={() => markSummonsRead(`l2_${myChild.id}`)}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Saya Sudah Membaca
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <Card className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => { setSelectedStudentId(myChild.id); setActivePage('student-profile') }}>
            <CardContent className="p-4 flex items-center gap-4">
              <Avatar className="h-14 w-14"><AvatarFallback className="bg-emerald-100 text-emerald-700 text-lg">{myChild.name.charAt(0)}</AvatarFallback></Avatar>
              <div>
                <p className="font-semibold text-lg">{myChild.name}</p>
                <p className="text-sm text-muted-foreground">{myChild.class?.name} • NISN: {myChild.nisn}</p>
                {bl && <Badge className={`${bl.color} mt-1`}>{bl.label} - {myChild.totalViolationPoints} poin pelanggaran</Badge>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Kehadiran Hari Ini</CardTitle></CardHeader>
            <CardContent>
              {todayAtt ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge className={getStatusColor(todayAtt.status as any)}>{todayAtt.status}</Badge></div>
                  <div><p className="text-xs text-muted-foreground">Jam Masuk</p><p className="font-semibold">{todayAtt.checkInTime ? formatTimeWIB(todayAtt.checkInTime) : '-'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Jam Keluar</p><p className="font-semibold">{todayAtt.checkOutTime ? formatTimeWIB(todayAtt.checkOutTime) : '-'}</p></div>
                </div>
              ) : <p className="text-center text-muted-foreground">Belum ada data kehadiran hari ini</p>}
            </CardContent>
          </Card>

          {/* Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-l-4 border-emerald-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Kehadiran</p>
                <p className="text-2xl font-bold text-emerald-600">
                  {attData?.attendances ? Math.round((attData.attendances.filter(a => a.status !== 'ALPHA').length / attData.attendances.length) * 100) : 0}%
                </p>
                <p className="text-xs text-gray-400">{attData?.attendances?.length || 0} hari tercatat</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-blue-500">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Hadir</p>
                <p className="text-2xl font-bold text-blue-600">{attData?.attendances?.filter(a => a.status === 'HADIR').length || 0}</p>
                <p className="text-xs text-gray-400">Tepat waktu</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-red-500">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Poin Pelanggaran</p>
                <p className="text-2xl font-bold text-red-600">{myChild.totalViolationPoints}</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-yellow-500">
              <CardContent className="p-4 text-center">
                <p className="text-xs text-muted-foreground">Poin Kebaikan</p>
                <p className="text-2xl font-bold text-yellow-600">{myChild.totalGoodPoints}</p>
              </CardContent>
            </Card>
          </div>

          {/* ID Card */}
          {myChild.idCardVisibleToParent !== false ? (
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActivePage('id-card')}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100"><CreditCard className="h-6 w-6 text-emerald-600" /></div>
                <div className="flex-1">
                  <p className="font-semibold">Kartu Identitas Siswa</p>
                  <p className="text-xs text-muted-foreground">Lihat dan download ID Card {myChild.name} (SVG/PDF)</p>
                </div>
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"><Eye className="h-4 w-4 mr-1" /> Lihat</Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="bg-gray-50">
              <CardContent className="p-4 flex items-center gap-3 opacity-60">
                <div className="p-2 rounded-lg bg-gray-200"><CreditCard className="h-6 w-6 text-gray-400" /></div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-500">Kartu Identitas Siswa</p>
                  <p className="text-xs text-gray-400">ID Card tidak tersedia saat ini.</p>
                </div>
              </CardContent>
            </Card>
          )}

          <DisciplinePatternChart violations={violData?.violations || []} goodDeeds={goodData?.goodDeeds || []} title="Pola Kedisiplinan Anak" />

          {bl && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Indikator Perilaku</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Level Perilaku</span>
                    <Badge className={`${bl.color}`}>{bl.label} - {bl.handler}</Badge>
                  </div>
                  <Progress value={Math.min((myChild.totalViolationPoints / 200) * 100, 100)} className="h-3" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>L1 (0-50)</span><span>L2 (51-100)</span><span>L3 (101-150)</span><span>L4 (150+)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Pelanggaran Terkini</CardTitle></CardHeader>
              <CardContent>
                {(violData?.violations || []).slice(0, 3).map(v => (
                  <div key={v.id} className="py-2 border-b last:border-0">
                    <p className="text-sm font-medium">{v.category?.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(v.date)} • {v.points} poin</p>
                  </div>
                ))}
                {(violData?.violations || []).length === 0 && <p className="text-sm text-muted-foreground text-center">Tidak ada pelanggaran</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Kebaikan Terkini</CardTitle></CardHeader>
              <CardContent>
                {(goodData?.goodDeeds || []).slice(0, 3).map(g => (
                  <div key={g.id} className="py-2 border-b last:border-0">
                    <p className="text-sm font-medium">{g.category?.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateShort(g.date)} • {g.points} poin</p>
                  </div>
                ))}
                {(goodData?.goodDeeds || []).length === 0 && <p className="text-sm text-muted-foreground text-center">Tidak ada kebaikan</p>}
              </CardContent>
            </Card>
          </div>

          <InlinePermissionForm
            studentId={myChild.id}
            studentName={myChild.name}
            requestedBy={user?.id || ''}
            onSuccess={() => { permRefetch() }}
          />

          <OrtuPermissionList studentId={myChild.id} />
        </>
      ) : (
        <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Data anak belum terhubung. Hubungi admin sekolah.</p></CardContent></Card>
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
