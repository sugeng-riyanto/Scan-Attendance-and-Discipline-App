'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { formatDateShort, getViolationLevelColor, roleLabels } from '@/lib/attendance-utils'
import { generateQRString } from '@/lib/qr-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import { Save, Plus, RefreshCw, Edit, Trash2, Camera, Upload, GraduationCap, Image, CheckCircle, XCircle, Lock, Copy, Volume2, Globe, Sun, Eye } from 'lucide-react'
import { Student, ClassInfo, AcademicYearInfo, CategoryInfo, GeofenceConfig, CategoriesResponse } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { ImportXlsxButton } from './import-xlsx-button'
import { FaceCaptureSection } from './siswa-dashboard'

function SchoolSettings({ themeColor }: { themeColor: string }) {
  const [config, setConfig] = useState({ school_name: '', school_address: '', school_logo: '', theme_color: '#10b981', timezone: 'Asia/Jakarta', checkin_cutoff_hour: '7' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchConfig() }, [])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ configs: { key: string; value: string }[] }>('/api/school-config')
      const map: Record<string, string> = {}
      data.configs.forEach(c => { map[c.key] = c.value })
      setConfig({
        school_name: map.school_name || 'SMP-SMA Nusantara',
        school_address: map.school_address || 'Jl. Pendidikan No. 1, Indonesia',
        school_logo: map.school_logo || '',
        theme_color: map.theme_color || '#10b981',
        timezone: map.timezone || 'Asia/Jakarta',
        checkin_cutoff_hour: map.checkin_cutoff_hour || '7',
      })
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const [key, value] of Object.entries(config)) {
        await apiFetch('/api/school-config', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value, description: key })
        })
      }
      toast.success('Pengaturan sekolah disimpan')
    } catch (err: any) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setConfig(p => ({ ...p, school_logo: reader.result as string }))
    reader.readAsDataURL(file)
  }

  if (loading) return <Skeleton className="h-48" />

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Informasi Sekolah</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div><Label>Nama Sekolah</Label>
          <Input value={config.school_name} onChange={e => setConfig(p => ({ ...p, school_name: e.target.value }))} />
        </div>
        <div><Label>Alamat Sekolah</Label>
          <Input value={config.school_address} onChange={e => setConfig(p => ({ ...p, school_address: e.target.value }))} />
        </div>
        <div>
          <Label>Logo Sekolah</Label>
          <div className="flex items-center gap-3 mt-1">
            {config.school_logo ? (
              <img src={config.school_logo} alt="Logo" className="h-16 w-16 rounded-lg border object-contain p-1" />
            ) : (
              <div className="h-16 w-16 rounded-lg border bg-gray-50 flex items-center justify-center">
                <GraduationCap className="h-8 w-8 text-gray-300" />
              </div>
            )}
            <div>
              <input type="file" accept="image/*" className="hidden" id="logo-upload" onChange={handleLogoUpload} />
              <Button variant="outline" size="sm" onClick={() => document.getElementById('logo-upload')?.click()}>
                <Upload className="h-4 w-4 mr-1" /> Upload Logo
              </Button>
              {config.school_logo && (
                <Button variant="ghost" size="sm" className="ml-2 text-red-500" onClick={() => setConfig(p => ({ ...p, school_logo: '' }))}>
                  Hapus
                </Button>
              )}
            </div>
          </div>
        </div>
        <div>
          <Label>Warna Tema</Label>
          <div className="flex items-center gap-3 mt-1">
            <input type="color" value={config.theme_color} onChange={e => setConfig(p => ({ ...p, theme_color: e.target.value }))}
              className="h-10 w-10 rounded border cursor-pointer" />
            <Input value={config.theme_color} onChange={e => setConfig(p => ({ ...p, theme_color: e.target.value }))}
              className="w-32" placeholder="#10b981" />
            <div className="h-8 w-8 rounded-full border" style={{ backgroundColor: config.theme_color }} />
          </div>
        </div>
        <Separator />
        <div>
          <Label>Zona Waktu</Label>
          <Select value={config.timezone} onValueChange={v => setConfig(p => ({ ...p, timezone: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Asia/Jakarta">WIB (UTC+7) - Asia/Jakarta</SelectItem>
              <SelectItem value="Asia/Makassar">WITA (UTC+8) - Asia/Makassar</SelectItem>
              <SelectItem value="Asia/Jayapura">WIT (UTC+9) - Asia/Jayapura</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Jam Batas Check-in (Terlambat setelah jam ini)</Label>
          <Select value={config.checkin_cutoff_hour} onValueChange={v => setConfig(p => ({ ...p, checkin_cutoff_hour: v }))}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['6','6.30','7','7.30','8','8.30','9'].map(h => (
                <SelectItem key={h} value={h}>{h.replace('.', ':')} WIB</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Simpan
        </Button>
      </CardContent>
    </Card>
  )
}

function SiswaSettings({ themeColor }: { themeColor: string }) {
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ nisn: '', name: '', classId: '', gender: 'L', address: '', email: '', phone: '', status: 'AKTIF', photoBase64: '' })
  const [showFaceCapture, setShowFaceCapture] = useState(false)
  const [faceCaptureStudent, setFaceCaptureStudent] = useState<Student | null>(null)
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  const classes = classesData?.classes || []

  useEffect(() => { fetchStudents() }, [])

  const fetchStudents = async () => {
    setLoading(true)
    try { const data = await apiFetch<{ students: Student[] }>('/api/students'); setStudents(data.students || []) }
    catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.nisn.includes(search)
  )

  const handleAutoNisn = () => {
    const existingNisns = students.map(s => parseInt(s.nisn, 10)).filter(n => !isNaN(n))
    const maxNisn = existingNisns.length > 0 ? Math.max(...existingNisns) : 0
    const nextNisn = String(maxNisn + 1).padStart(10, '0')
    setForm(p => ({ ...p, nisn: nextNisn }))
  }

  const handleSave = async () => {
    if (!form.nisn || !form.name || !form.classId) { toast.error('NISN, Nama, dan Kelas wajib diisi'); return }
    try {
      if (editId) {
        await apiFetch('/api/students', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, ...form })
        })
        toast.success('Siswa diperbarui')
      } else {
        const qrCode = generateQRString(form.nisn)
        const academicYearId = classes.find(c => c.id === form.classId)?.academicYearId || ''
        if (!academicYearId) { toast.error('Pilih kelas yang valid'); return }
        await apiFetch('/api/students', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, qrCode, academicYearId })
        })
        toast.success('Siswa ditambahkan (login: student_' + form.nisn + ' / ' + form.nisn + ')')
      }
      setShowForm(false); setEditId(null)
      setForm({ nisn: '', name: '', classId: '', gender: 'L', address: '', email: '', phone: '', status: 'AKTIF', photoBase64: '' })
      fetchStudents()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleEdit = (s: Student) => {
    setEditId(s.id)
    setForm({ nisn: s.nisn, name: s.name, classId: s.classId, gender: s.gender || 'L', address: s.address || '', email: s.email || '', phone: s.phone || '', status: s.status || 'AKTIF', photoBase64: s.photoBase64 || '' })
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus siswa ini?')) return
    try { await apiFetch(`/api/students?id=${id}`, { method: 'DELETE' }); toast.success('Siswa dihapus'); fetchStudents() }
    catch (err: any) { toast.error(err.message) }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setForm(p => ({ ...p, photoBase64: reader.result as string }))
    reader.readAsDataURL(file)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base">Manajemen Siswa ({students.length})</CardTitle>
          <div className="flex gap-2">
            <ImportXlsxButton type="students" onDone={fetchStudents} />
            <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => { setEditId(null); setForm({ nisn: '', name: '', classId: '', gender: 'L', address: '', email: '', phone: '', status: 'AKTIF', photoBase64: '' }); setShowForm(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Tambah
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Input placeholder="Cari nama/NISN..." value={search} onChange={e => setSearch(e.target.value)} className="mb-3" />

        {showForm && (
          <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">NISN</Label>
                <div className="flex gap-1">
                  <Input value={form.nisn} onChange={e => setForm(p => ({ ...p, nisn: e.target.value }))} disabled={!!editId} className="flex-1" />
                  {!editId && <Button variant="outline" size="sm" type="button" onClick={handleAutoNisn} className="shrink-0 text-xs whitespace-nowrap">Auto NISN</Button>}
                </div>
              </div>
              <div><Label className="text-xs">Nama</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div className="col-span-2">
                <Label className="text-xs">Kelas</Label>
                <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-1 bg-white">
                  {classes.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Tidak ada kelas tersedia</p>}
                  {classes.map(c => (
                    <button key={c.id} type="button"
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors text-left border"
                      style={form.classId === c.id ? { backgroundColor: themeColor + '15', borderColor: themeColor + '60', color: themeColor, fontWeight: 500 } : { borderColor: 'transparent' }}
                      onClick={() => setForm(p => ({ ...p, classId: c.id }))}>
                      <div className="h-4 w-4 rounded-full border-2 flex items-center justify-center" style={form.classId === c.id ? { borderColor: themeColor } : {}}>
                        {form.classId === c.id && <div className="h-2 w-2 rounded-full" style={{ backgroundColor: themeColor }} />}
                      </div>
                      <span>{c.name}</span>
                      <Badge variant="outline" className="text-[10px] ml-auto">{c.level}</Badge>
                      <span className="text-xs text-muted-foreground">({c._count?.students || 0})</span>
                    </button>
                  ))}
                </div>
              </div>
              <div><Label className="text-xs">Jenis Kelamin</Label>
                <Select value={form.gender} onValueChange={v => setForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="L">Laki-laki</SelectItem><SelectItem value="P">Perempuan</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div><Label className="text-xs font-semibold">📱 No HP <span className="text-red-500">*</span></Label><Input type="tel" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="08xxxxxxxxxx" className="border-primary/50" /></div>
            </div>
            <div><Label className="text-xs">Alamat</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
            <div className="flex items-center gap-4">
              <div><Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="AKTIF">Aktif</SelectItem><SelectItem value="TIDAK_AKTIF">Tidak Aktif</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Foto</Label>
                <div className="flex items-center gap-2">
                  {form.photoBase64 && <img src={form.photoBase64} alt="Foto siswa" className="h-10 w-10 rounded object-cover" />}
                  <input type="file" accept="image/*" className="hidden" id="student-photo-upload" onChange={handlePhotoUpload} />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('student-photo-upload')?.click()}>
                    <Image className="h-4 w-4 mr-1" /> Upload
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Simpan</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            </div>
          </div>
        )}

        {loading ? <Skeleton className="h-48" /> : (
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">NISN</TableHead>
                  <TableHead className="text-xs">Nama</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Kelas</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">JK</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Status</TableHead>
                  <TableHead className="text-xs">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs py-1">{s.nisn}</TableCell>
                    <TableCell className="text-xs py-1">
                      <div className="flex items-center gap-2">
                        {(s.photoBase64 || s.photoUrl) ? <img src={s.photoBase64 || s.photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" /> : <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px]">{s.name.charAt(0)}</div>}
                        {s.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs py-1 hidden md:table-cell">{s.class?.name}</TableCell>
                    <TableCell className="text-xs py-1 hidden lg:table-cell">{s.gender === 'L' ? 'L' : s.gender === 'P' ? 'P' : '-'}</TableCell>
                    <TableCell className="py-1 hidden lg:table-cell"><Badge className={`text-[10px] ${s.status === 'AKTIF' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{s.status || 'AKTIF'}</Badge></TableCell>
                    <TableCell className="py-1">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(s)}><Edit className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setFaceCaptureStudent(s); setShowFaceCapture(true) }}><Camera className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => handleDelete(s.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-xs">Tidak ada data</TableCell></TableRow>}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>

      <Dialog open={showFaceCapture} onOpenChange={setShowFaceCapture}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Capture Wajah - {faceCaptureStudent?.name}</DialogTitle></DialogHeader>
          {faceCaptureStudent && <FaceCaptureSection studentId={faceCaptureStudent.id} studentName={faceCaptureStudent.name} />}
          <DialogFooter><Button variant="outline" onClick={() => setShowFaceCapture(false)}>Tutup</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function UsersSettings({ themeColor }: { themeColor: string }) {
  const { data, loading, refetch } = useApiFetch<{ users: any[] }>('/api/auth')
  const users = data?.users || []
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ username: '', name: '', role: 'GURU', password: '' })
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('ALL')

  const filteredUsers = users.filter(u => {
    const matchSearch = !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.username.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter
    return matchSearch && matchRole
  })

  const handleCreate = async () => {
    if (!form.username || !form.name || !form.password) { toast.error('Lengkapi semua field'); return }
    try {
      await apiFetch('/api/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      toast.success('Pengguna ditambahkan')
      setShowForm(false)
      setForm({ username: '', name: '', role: 'GURU', password: '' })
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleEdit = (u: any) => {
    setEditId(u.id)
    setForm({ username: u.username, name: u.name, role: u.role, password: '' })
    setShowForm(true)
  }

  const handleUpdate = async () => {
    if (!editId) return
    try {
      const updateData: any = { id: editId, name: form.name, role: form.role }
      await apiFetch('/api/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      })
      toast.success('Pengguna diperbarui')
      setShowForm(false)
      setEditId(null)
      setForm({ username: '', name: '', role: 'GURU', password: '' })
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Nonaktifkan pengguna ini?')) return
    try { await apiFetch(`/api/users?id=${id}`, { method: 'DELETE' }); toast.success('Pengguna dinonaktifkan'); refetch() }
    catch (err: any) { toast.error(err.message) }
  }

  const handleResetPassword = async (u: any) => {
    const defaultPw = u.username + '123'
    if (!confirm(`Reset password ${u.name} menjadi "${defaultPw}"?`)) return
    try {
      await apiFetch('/api/users', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: u.id, password: defaultPw })
      })
      toast.success(`Password ${u.name} direset ke ${defaultPw}`)
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Manajemen Pengguna ({users.length})</CardTitle>
          <div className="flex gap-2">
            <ImportXlsxButton type="users" onDone={refetch} />
            <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => { setEditId(null); setForm({ username: '', name: '', role: 'GURU', password: '' }); setShowForm(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Tambah
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Input placeholder="Cari nama/username..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Semua Role</SelectItem>
              <SelectItem value="ADMIN">Admin</SelectItem>
              <SelectItem value="KEPALA_SEKOLAH">Kepala Sekolah</SelectItem>
              <SelectItem value="VP_KESISWAAN">Wakasek Kesiswaan</SelectItem>
              <SelectItem value="WALI_KELAS">Wali Kelas</SelectItem>
              <SelectItem value="GURU">Guru</SelectItem>
              <SelectItem value="GURU_JAGA">Guru Jaga</SelectItem>
              <SelectItem value="ORANG_TUA">Orang Tua</SelectItem>
              <SelectItem value="SISWA">Siswa</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showForm && (
          <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Username</Label><Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} disabled={!!editId} /></div>
              <div><Label className="text-xs">Nama</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              <div><Label className="text-xs">Role</Label>
                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="KEPALA_SEKOLAH">Kepala Sekolah</SelectItem>
                    <SelectItem value="VP_KESISWAAN">Wakasek Kesiswaan</SelectItem>
                    <SelectItem value="WALI_KELAS">Wali Kelas</SelectItem>
                    <SelectItem value="GURU">Guru</SelectItem>
                    <SelectItem value="GURU_JAGA">Guru Jaga</SelectItem>
                    <SelectItem value="ORANG_TUA">Orang Tua</SelectItem>
                    <SelectItem value="SISWA">Siswa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!editId && <div><Label className="text-xs">Password</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} /></div>}
            </div>
            <div className="flex gap-2">
              <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={editId ? handleUpdate : handleCreate}><Save className="h-4 w-4 mr-1" /> {editId ? 'Perbarui' : 'Simpan'}</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditId(null) }}>Batal</Button>
            </div>
          </div>
        )}

        {loading ? <Skeleton className="h-32" /> : (
          <ScrollArea className="max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nama</TableHead>
                  <TableHead className="text-xs">Username</TableHead>
                  <TableHead className="text-xs">Role</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Info</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="text-xs py-1 font-medium">{u.name}</TableCell>
                    <TableCell className="text-xs py-1">{u.username}</TableCell>
                    <TableCell className="text-xs py-1"><Badge variant="outline">{roleLabels[u.role] || u.role}</Badge></TableCell>
                    <TableCell className="text-xs py-1 hidden md:table-cell text-muted-foreground">
                      {u.student && <span>Siswa: {u.student.name}</span>}
                      {u.homeroomOf && <span>Wali: {u.homeroomOf.name}</span>}
                      {u.teacher && <span>NIP: {u.teacher.nip || '-'}</span>}
                    </TableCell>
                    <TableCell className="py-1">{u.isActive ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}</TableCell>
                    <TableCell className="py-1">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(u)} title="Edit"><Edit className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-500" onClick={() => handleResetPassword(u)} title="Reset Password"><Lock className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => handleDelete(u.id)} title="Nonaktifkan"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground text-xs">Tidak ada data</TableCell></TableRow>}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

function KelasSettings({ themeColor }: { themeColor: string }) {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', level: 'SMP', academicYearId: '', homeroomTeacherId: 'NONE' })
  const { data: yearsData } = useApiFetch<{ academicYears: AcademicYearInfo[] }>('/api/academic-years')
  const { data: usersData } = useApiFetch<{ users: any[] }>('/api/auth')
  const teachers = (usersData?.users || []).filter(u => u.role === 'WALI_KELAS' || u.role === 'GURU')
  const years = yearsData?.academicYears || []

  useEffect(() => { fetchClasses() }, [])

  const fetchClasses = async () => {
    setLoading(true)
    try { const data = await apiFetch<{ classes: ClassInfo[] }>('/api/classes'); setClasses(data.classes || []) }
    catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!form.name || !form.level) { toast.error('Nama dan Jenjang wajib diisi'); return }
    try {
      const saveData = { ...form, homeroomTeacherId: form.homeroomTeacherId === 'NONE' ? '' : form.homeroomTeacherId }
      if (editId) {
        await apiFetch('/api/classes', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editId, ...saveData })
        })
        toast.success('Kelas diperbarui')
      } else {
        await apiFetch('/api/classes', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveData)
        })
        toast.success('Kelas ditambahkan')
      }
      setShowForm(false); setEditId(null)
      setForm({ name: '', level: 'SMP', academicYearId: '', homeroomTeacherId: 'NONE' })
      fetchClasses()
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Manajemen Kelas ({classes.length})</CardTitle>
          <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => { setEditId(null); setForm({ name: '', level: 'SMP', academicYearId: years.find(y => y.isActive)?.id || '', homeroomTeacherId: 'NONE' }); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-1" /> Tambah
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nama Kelas</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="7A, 10B..." /></div>
              <div><Label className="text-xs">Jenjang</Label>
                <Select value={form.level} onValueChange={v => setForm(p => ({ ...p, level: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="SMP">SMP</SelectItem><SelectItem value="SMA">SMA</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Tahun Ajaran</Label>
                <Select value={form.academicYearId} onValueChange={v => setForm(p => ({ ...p, academicYearId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih tahun ajaran" /></SelectTrigger>
                  <SelectContent>{years.map(y => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Wali Kelas</Label>
                <Select value={form.homeroomTeacherId} onValueChange={v => setForm(p => ({ ...p, homeroomTeacherId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih wali kelas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Tanpa Wali Kelas</SelectItem>
                    {teachers.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Simpan</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            </div>
          </div>
        )}

        {loading ? <Skeleton className="h-32" /> : (
          <div className="space-y-2">
            {classes.map(c => (
              <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">{c.name} <Badge variant="outline" className="text-[10px] ml-1">{c.level}</Badge></p>
                  <p className="text-xs text-muted-foreground">Wali: {c.homeroomTeacher?.name || '-'} • {c._count?.students || 0} siswa</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(c)}><Edit className="h-3 w-3" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
            ))}
            {classes.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Tidak ada kelas</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

async function handleDelete(id: string) {
  if (!confirm('Hapus item ini?')) return
  try { await apiFetch(`/api/classes?id=${id}`, { method: 'DELETE' }); toast.success('Dihapus') }
  catch (err: any) { toast.error(err.message) }
}

function CategoriesSettings({ themeColor }: { themeColor: string }) {
  const [categories, setCategories] = useState<CategoryInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('violation')
  const [showForm, setShowForm] = useState(false)
  const [formType, setFormType] = useState<'violation' | 'good-deed'>('violation')
  const [form, setForm] = useState({ name: '', code: '', level: 'RINGAN', defaultPoints: 5, description: '' })

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<CategoriesResponse>('/api/categories')
      setCategories([...(data.violationCategories || []), ...(data.goodDeedCategories || [])])
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const violationCats = categories.filter(c => c.level)
  const goodCats = categories.filter(c => !c.level)

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error('Nama dan Kode wajib diisi'); return }
    try {
      await apiFetch('/api/categories', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: formType, ...form })
      })
      toast.success('Kategori ditambahkan')
      setShowForm(false)
      setForm({ name: '', code: '', level: 'RINGAN', defaultPoints: 5, description: '' })
      fetchCategories()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleDeleteCat = async (type: string, id: string) => {
    if (!confirm('Nonaktifkan kategori ini?')) return
    try { await apiFetch(`/api/categories?type=${type}&id=${id}`, { method: 'DELETE' }); toast.success('Kategori dinonaktifkan'); fetchCategories() }
    catch (err: any) { toast.error(err.message) }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Manajemen Kategori</CardTitle>
          <div className="flex gap-2">
            <ImportXlsxButton type="violation-categories" onDone={fetchCategories} />
            <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => { setFormType(tab === 'violation' ? 'violation' : 'good-deed'); setShowForm(true) }}>
              <Plus className="h-4 w-4 mr-1" /> Tambah
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Kode</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="PLG01" /></div>
              <div><Label className="text-xs">Nama</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
              {formType === 'violation' && (
                <div className="col-span-2"><Label className="text-xs">Level Pelanggaran</Label>
                  <div className="flex gap-2 mt-1">
                    {[
                      { value: 'RINGAN', label: 'Ringan', color: 'bg-green-100 border-green-400 text-green-800' },
                      { value: 'SEDANG', label: 'Sedang', color: 'bg-yellow-100 border-yellow-400 text-yellow-800' },
                      { value: 'BERAT', label: 'Berat', color: 'bg-red-100 border-red-400 text-red-800' },
                    ].map(opt => (
                      <button key={opt.value} type="button"
                        className={`flex-1 px-4 py-2.5 rounded-lg border-2 text-sm font-medium transition-all ${form.level === opt.value ? opt.color + ' ring-2 ring-offset-1' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                        onClick={() => setForm(p => ({ ...p, level: opt.value }))}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div><Label className="text-xs">Poin Default</Label><Input type="number" value={form.defaultPoints} onChange={e => setForm(p => ({ ...p, defaultPoints: parseInt(e.target.value) || 0 }))} /></div>
            </div>
            <div><Label className="text-xs">Deskripsi</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="flex gap-2">
              <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Simpan</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            </div>
          </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="violation" className="flex-1">Pelanggaran ({violationCats.length})</TabsTrigger>
            <TabsTrigger value="gooddeed" className="flex-1">Kebaikan ({goodCats.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="violation">
            {loading ? <Skeleton className="h-32" /> : (
              <div className="space-y-2 mt-2">
                {violationCats.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.code} • {c.defaultPoints} poin</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getViolationLevelColor(c.level || '')}>{c.level}</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => handleDeleteCat('violation', c.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
                {violationCats.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Tidak ada kategori</p>}
              </div>
            )}
          </TabsContent>
          <TabsContent value="gooddeed">
            {loading ? <Skeleton className="h-32" /> : (
              <div className="space-y-2 mt-2">
                {goodCats.map(c => (
                  <div key={c.id} className="flex items-center justify-between p-2 border rounded">
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.code} • {c.defaultPoints} poin</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge style={{ backgroundColor: themeColor + '20', color: themeColor }}>{c.defaultPoints} poin</Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => handleDeleteCat('good-deed', c.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                ))}
                {goodCats.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Tidak ada kategori</p>}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

function GeofenceSettings({ themeColor }: { themeColor: string }) {
  const [geofences, setGeofences] = useState<GeofenceConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ id: '', name: 'Area Sekolah', centerLat: -6.2088, centerLng: 106.8456, radiusMeters: 200, isActive: true, isDefault: true })

  useEffect(() => { fetchGeofences() }, [])

  const fetchGeofences = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ geofences: GeofenceConfig[] }>('/api/geofence')
      setGeofences(data.geofences || [])
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    try {
      if (form.id) {
        await apiFetch('/api/geofence', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        toast.success('Geofence diperbarui')
      } else {
        await apiFetch('/api/geofence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        toast.success('Geofence dibuat')
      }
      setShowForm(false)
      setForm({ id: '', name: 'Area Sekolah', centerLat: -6.2088, centerLng: 106.8456, radiusMeters: 200, isActive: true, isDefault: true })
      fetchGeofences()
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Konfigurasi Geofence</CardTitle>
          <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => { setForm({ id: '', name: 'Area Sekolah', centerLat: -6.2088, centerLng: 106.8456, radiusMeters: 200, isActive: true, isDefault: true }); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-1" /> Tambah
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
            <div><Label>Nama Area</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Latitude</Label><Input type="number" step="any" value={form.centerLat} onChange={e => setForm(p => ({ ...p, centerLat: parseFloat(e.target.value) || 0 }))} /></div>
              <div><Label>Longitude</Label><Input type="number" step="any" value={form.centerLng} onChange={e => setForm(p => ({ ...p, centerLng: parseFloat(e.target.value) || 0 }))} /></div>
            </div>
            <div><Label>Radius (meter)</Label><Input type="number" value={form.radiusMeters} onChange={e => setForm(p => ({ ...p, radiusMeters: parseInt(e.target.value) || 0 }))} /></div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2"><Switch checked={form.isActive} onCheckedChange={v => setForm(p => ({ ...p, isActive: v }))} /><Label>Aktif</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.isDefault} onCheckedChange={v => setForm(p => ({ ...p, isDefault: v }))} /><Label>Geofence Utama</Label></div>
            </div>
            <div className="flex gap-2">
              <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Simpan</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            </div>
          </div>
        )}

        {loading ? <Skeleton className="h-32" /> : (
          <div className="space-y-3">
            {geofences.map(g => (
              <div key={g.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="text-xs text-muted-foreground">{g.centerLat}, {g.centerLng} • Radius: {g.radiusMeters}m</p>
                  <div className="flex gap-1 mt-1">
                    {g.isActive && <Badge className="bg-green-100 text-green-800 text-xs">Aktif</Badge>}
                    {g.isDefault && <Badge className="bg-blue-100 text-blue-800 text-xs">Utama</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => { setForm({ id: g.id, name: g.name, centerLat: g.centerLat, centerLng: g.centerLng, radiusMeters: g.radiusMeters, isActive: g.isActive, isDefault: g.isDefault }); setShowForm(true) }}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400" onClick={async () => { if (!confirm('Hapus geofence ini?')) return; await apiFetch(`/api/geofence?id=${g.id}`, { method: 'DELETE' }); toast.success('Geofence dihapus'); fetchGeofences() }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
            {geofences.length === 0 && <p className="text-center text-muted-foreground py-4">Belum ada geofence</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AcademicYearSettings({ themeColor }: { themeColor: string }) {
  const [years, setYears] = useState<AcademicYearInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' })

  useEffect(() => { fetchYears() }, [])

  const fetchYears = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ academicYears: AcademicYearInfo[] }>('/api/academic-years')
      setYears(data.academicYears || [])
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    if (!form.name || !form.startDate || !form.endDate) { toast.error('Lengkapi semua field'); return }
    try {
      await apiFetch('/api/academic-years', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      toast.success('Tahun ajaran ditambahkan')
      setShowForm(false)
      setForm({ name: '', startDate: '', endDate: '' })
      fetchYears()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleSetActive = async (id: string) => {
    try {
      await apiFetch('/api/academic-years', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, isActive: true })
      })
      toast.success('Tahun ajaran diaktifkan')
      fetchYears()
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Tahun Ajaran</CardTitle>
          <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Tambah
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
            <div><Label className="text-xs">Nama</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="2024/2025 Genap" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Tanggal Mulai</Label><Input type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} /></div>
              <div><Label className="text-xs">Tanggal Selesai</Label><Input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSave}><Save className="h-4 w-4 mr-1" /> Simpan</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            </div>
          </div>
        )}

        {loading ? <Skeleton className="h-32" /> : (
          <div className="space-y-2">
            {years.map(y => (
              <div key={y.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium text-sm">{y.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDateShort(y.startDate)} - {formatDateShort(y.endDate)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {y.isActive ? (
                    <Badge className="bg-green-100 text-green-800">Aktif</Badge>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => handleSetActive(y.id)}>
                      Aktifkan
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {years.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Tidak ada data</p>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function WelcomeSettings({ themeColor }: { themeColor: string }) {
  const [configs, setConfigs] = useState<Record<string, string>>({
    welcome_text: 'Selamat datang, {name}! Semoga harimu menyenangkan.',
    welcome_voice_enabled: 'true',
    welcome_voice_lang: 'id-ID',
    welcome_voice_rate: '1',
    welcome_late_text: '{name}, Anda terlambat hari ini. Semoga besok lebih tepat waktu.',
    welcome_checkout_text: 'Selamat pulang, {name}! Hati-hati di jalan.',
    welcome_lang_monday: 'id-ID',
    welcome_lang_tuesday: 'id-ID',
    welcome_lang_wednesday: 'zh-TW',
    welcome_lang_thursday: 'en-US',
    welcome_lang_friday: 'en-US',
    welcome_lang_saturday: 'id-ID',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testText, setTestText] = useState('')
  const [customVars, setCustomVars] = useState<{ key: string; value: string }[]>([])
  const [newVarKey, setNewVarKey] = useState('')
  const [newVarValue, setNewVarValue] = useState('')

  useEffect(() => { fetchConfigs() }, [])

  const fetchConfigs = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ configs: { key: string; value: string }[] }>('/api/school-config')
      const map: Record<string, string> = { ...configs }
      const customVarsList: { key: string; value: string }[] = []
      data.configs.forEach(c => {
        if (c.key.startsWith('custom_var_')) {
          customVarsList.push({ key: c.key.replace('custom_var_', ''), value: c.value })
        } else if (configs[c.key] !== undefined) {
          map[c.key] = c.value
        }
      })
      setConfigs(map)
      setCustomVars(customVarsList)
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const [key, value] of Object.entries(configs)) {
        await apiFetch('/api/school-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value, description: key })
        })
      }
      for (const cv of customVars) {
        await apiFetch('/api/school-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'custom_var_' + cv.key, value: cv.value, description: 'Custom variable: ' + cv.key })
        })
      }
      toast.success('Pengaturan welcome disimpan')
    } catch (err: any) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const addCustomVar = () => {
    if (!newVarKey || !newVarValue) { toast.error('Isi key dan value'); return }
    setCustomVars([...customVars, { key: newVarKey, value: newVarValue }])
    setNewVarKey(''); setNewVarValue('')
  }

  const removeCustomVar = (idx: number) => {
    setCustomVars(customVars.filter((_, i) => i !== idx))
  }

  const handleTestVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { toast.error('Browser tidak mendukung Text-to-Speech'); return }
    const hour = new Date().getHours()
    const greeting = hour < 11 ? 'Selamat Pagi' : hour < 15 ? 'Selamat Siang' : hour < 18 ? 'Selamat Sore' : 'Selamat Malam'
    let text = testText || configs.welcome_text
      .replace('{name}', 'Rizky Pratama')
      .replace('{nisn}', '0012345001')
      .replace('{className}', '7A')
      .replace('{time}', new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB')
      .replace('{status}', 'Hadir')
      .replace('{date}', new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))
      .replace('{schoolName}', 'SMP-SMA Nusantara')
      .replace('{greeting}', greeting)
      .replace('{points}', '5')
      .replace('{behaviorLevel}', 'Baik')
    customVars.forEach(cv => { text = text.replaceAll(`{${cv.key}}`, cv.value) })
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = configs.welcome_voice_lang || 'id-ID'
    utterance.rate = parseFloat(configs.welcome_voice_rate || '1')
    window.speechSynthesis.speak(utterance)
  }

  const variables = [
    { var: '{name}', desc: 'Nama siswa' },
    { var: '{nisn}', desc: 'NISN siswa' },
    { var: '{className}', desc: 'Nama kelas' },
    { var: '{time}', desc: 'Waktu saat ini' },
    { var: '{status}', desc: 'Status kehadiran' },
    { var: '{date}', desc: 'Tanggal hari ini' },
    { var: '{schoolName}', desc: 'Nama sekolah' },
    { var: '{greeting}', desc: 'Sapaan (Selamat Pagi/Siang/Sore/Malam)' },
    { var: '{points}', desc: 'Poin pelanggaran siswa' },
    { var: '{behaviorLevel}', desc: 'Tingkat kedisiplinan' },
  ]

  const LANGUAGES = [
    { value: 'id-ID', label: 'Bahasa Indonesia' },
    { value: 'en-US', label: 'English USA' },
    { value: 'en-GB', label: 'English UK' },
    { value: 'zh-TW', label: 'Traditional Mandarin' },
  ]

  const DAYS = [
    { key: 'welcome_lang_monday', label: 'Senin' },
    { key: 'welcome_lang_tuesday', label: 'Selasa' },
    { key: 'welcome_lang_wednesday', label: 'Rabu' },
    { key: 'welcome_lang_thursday', label: 'Kamis' },
    { key: 'welcome_lang_friday', label: 'Jumat' },
    { key: 'welcome_lang_saturday', label: 'Sabtu' },
  ]

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Pengaturan Pesan Welcome</CardTitle></CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-32" /> : (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm font-medium text-blue-800 mb-2">Variabel yang tersedia:</p>
              <div className="flex flex-wrap gap-2">
                {variables.map(v => (
                  <Badge key={v.var} variant="outline" className="text-xs cursor-pointer" onClick={() => navigator.clipboard.writeText(v.var)}>
                    {v.var} - {v.desc}
                  </Badge>
                ))}
                {customVars.map((cv, i) => (
                  <Badge key={i} variant="outline" className="text-xs cursor-pointer bg-purple-50" onClick={() => navigator.clipboard.writeText(`{${cv.key}}`)}>
                    {'{' + cv.key + '}'} - {cv.value}
                  </Badge>
                ))}
              </div>
            </div>
            <div><Label>Pesan Welcome (Check-in)</Label><Textarea value={configs.welcome_text} onChange={e => setConfigs(p => ({ ...p, welcome_text: e.target.value }))} rows={2} /></div>
            <div><Label>Pesan Terlambat</Label><Textarea value={configs.welcome_late_text} onChange={e => setConfigs(p => ({ ...p, welcome_late_text: e.target.value }))} rows={2} /></div>
            <div><Label>Pesan Check-out</Label><Textarea value={configs.welcome_checkout_text} onChange={e => setConfigs(p => ({ ...p, welcome_checkout_text: e.target.value }))} rows={2} /></div>
            <Separator />
            <div>
              <Label className="font-medium">Variabel Kustom</Label>
              <p className="text-xs text-muted-foreground mb-2">Tambahkan variabel sendiri yang bisa dipakai di pesan welcome</p>
              <div className="space-y-2">
                {customVars.map((cv, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{'{' + cv.key + '}'}</Badge>
                    <span className="text-sm flex-1">{cv.value}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-400" onClick={() => removeCustomVar(i)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input placeholder="Key (cont: motto)" value={newVarKey} onChange={e => setNewVarKey(e.target.value)} className="flex-1" />
                  <Input placeholder="Value (cont: Maju Bersama)" value={newVarValue} onChange={e => setNewVarValue(e.target.value)} className="flex-1" />
                  <Button variant="outline" size="sm" onClick={addCustomVar}><Plus className="h-3 w-3" /></Button>
                </div>
              </div>
            </div>
            <Separator />
            <div className="flex items-center gap-2"><Switch checked={configs.welcome_voice_enabled === 'true'} onCheckedChange={v => setConfigs(p => ({ ...p, welcome_voice_enabled: v ? 'true' : 'false' }))} /><Label>Aktifkan Suara Welcome</Label></div>
            <div><Label>Bahasa Suara Default</Label>
              <Select value={configs.welcome_voice_lang} onValueChange={v => setConfigs(p => ({ ...p, welcome_voice_lang: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Kecepatan Suara ({configs.welcome_voice_rate}x)</Label><Slider min={0.5} max={2} step={0.1} value={[parseFloat(configs.welcome_voice_rate)]} onValueChange={v => setConfigs(p => ({ ...p, welcome_voice_rate: String(v[0]) }))} /></div>
            <Separator />
            <div>
              <Label className="font-medium">Jadwal Bahasa per Hari</Label>
              <p className="text-xs text-muted-foreground mb-2">Atur bahasa suara untuk setiap hari</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {DAYS.map(day => (
                  <div key={day.key} className="border rounded-lg p-2 space-y-1">
                    <Label className="text-xs font-semibold">{day.label}</Label>
                    <Select value={configs[day.key] || 'id-ID'} onValueChange={v => setConfigs(p => ({ ...p, [day.key]: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LANGUAGES.map(l => <SelectItem key={l.value} value={l.value} className="text-xs">{l.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            <div><Label>Test Suara</Label>
              <div className="flex gap-2 mt-1">
                <Input value={testText} onChange={e => setTestText(e.target.value)} placeholder="Teks untuk test..." className="flex-1" />
                <Button variant="outline" onClick={handleTestVoice}><Volume2 className="h-4 w-4 mr-1" /> Play</Button>
              </div>
            </div>
            <Button className="w-full text-white" style={{ backgroundColor: themeColor }} onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Simpan Pengaturan
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function SettingsPage({ themeColor }: { themeColor: string }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Pengaturan</h2>
      <Tabs defaultValue="school">
        <div className="overflow-x-auto scrollbar-hide">
        <TabsList className="flex-nowrap min-w-max">
          <TabsTrigger value="school" className="flex-1 min-w-[80px]">Sekolah</TabsTrigger>
          <TabsTrigger value="students" className="flex-1 min-w-[80px]">Siswa</TabsTrigger>
          <TabsTrigger value="users" className="flex-1 min-w-[80px]">Pengguna</TabsTrigger>
          <TabsTrigger value="classes" className="flex-1 min-w-[80px]">Kelas</TabsTrigger>
          <TabsTrigger value="categories" className="flex-1 min-w-[80px]">Kategori</TabsTrigger>
          <TabsTrigger value="geofence" className="flex-1 min-w-[80px]">Geofence</TabsTrigger>
          <TabsTrigger value="academic" className="flex-1 min-w-[80px]">Tahun Ajaran</TabsTrigger>
          <TabsTrigger value="welcome" className="flex-1 min-w-[80px]">Welcome</TabsTrigger>
        </TabsList>
        </div>

        <TabsContent value="school" className="mt-4"><SchoolSettings themeColor={themeColor} /></TabsContent>
        <TabsContent value="students" className="mt-4"><SiswaSettings themeColor={themeColor} /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersSettings themeColor={themeColor} /></TabsContent>
        <TabsContent value="classes" className="mt-4"><KelasSettings themeColor={themeColor} /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesSettings themeColor={themeColor} /></TabsContent>
        <TabsContent value="geofence" className="mt-4"><GeofenceSettings themeColor={themeColor} /></TabsContent>
        <TabsContent value="academic" className="mt-4"><AcademicYearSettings themeColor={themeColor} /></TabsContent>
        <TabsContent value="welcome" className="mt-4"><WelcomeSettings themeColor={themeColor} /></TabsContent>
      </Tabs>
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
