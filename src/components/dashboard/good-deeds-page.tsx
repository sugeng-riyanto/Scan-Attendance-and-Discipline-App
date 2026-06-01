'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { formatDateShort } from '@/lib/attendance-utils'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Plus, Trash2 } from 'lucide-react'
import { Student, ClassInfo, GoodDeedRecord, CategoriesResponse } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { ImportXlsxButton } from './import-xlsx-button'

export function GoodDeedsPage() {
  const authUser = useAuthStore(s => s.user)
  const { setActivePage, setSelectedStudentId, classFilter, setClassFilter } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [formData, setFormData] = useState({ studentId: '', categoryId: '', points: 5, description: '', date: new Date().toISOString().split('T')[0] })

  const { data: studentsData } = useApiFetch<{ students: Student[] }>(`/api/students?search=${search}`)
  const { data: catData } = useApiFetch<CategoriesResponse>('/api/categories')
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')

  const myClass = classesData?.classes?.find(c => c.homeroomTeacherId === authUser?.id)
  const effectiveClassFilter = authUser?.role === 'WALI_KELAS' && myClass ? myClass.id : classFilter

  const { data: goodData, loading, refetch } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>(
    `/api/good-deeds?classId=${effectiveClassFilter !== 'all' ? effectiveClassFilter : ''}`, [effectiveClassFilter]
  )

  const goodDeeds = goodData?.goodDeeds || []
  const students = studentsData?.students || []
  const goodCats = catData?.goodDeedCategories || []
  const classes = classesData?.classes || []

  const handleCreate = async () => {
    if (!formData.studentId || !formData.categoryId || !formData.date) { toast.error('Lengkapi semua field'); return }
    try {
      await apiFetch('/api/good-deeds', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, recordedBy: authUser?.id })
      })
      toast.success('Kebaikan berhasil dicatat')
      setShowCreate(false)
      setFormData({ studentId: '', categoryId: '', points: 5, description: '', date: new Date().toISOString().split('T')[0] })
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus kebaikan ini?')) return
    try {
      await apiFetch(`/api/good-deeds?id=${id}`, { method: 'DELETE' })
      toast.success('Kebaikan dihapus')
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Kebaikan</h2>
        <div className="flex gap-2">
          {(authUser?.role === 'ADMIN' || authUser?.role === 'VP_KESISWAAN') && (
            <ImportXlsxButton type="good-deed-categories" onDone={refetch} />
          )}
          <Select value={effectiveClassFilter} onValueChange={setClassFilter} disabled={authUser?.role === 'WALI_KELAS'}>
            <SelectTrigger className="h-10 w-full sm:w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {authUser?.role !== 'WALI_KELAS' && <SelectItem value="all">Semua Kelas</SelectItem>}
              {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Catat
          </Button>
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Catat Kebaikan</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Cari Siswa</Label><Input placeholder="Ketik nama/NISN..." value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div><Label>Pilih Siswa</Label>
              <Select value={formData.studentId} onValueChange={v => setFormData(p => ({ ...p, studentId: v }))}>
                <SelectTrigger><SelectValue placeholder="Pilih siswa" /></SelectTrigger>
                <SelectContent>
                  {students.map(s => <SelectItem key={s.id} value={s.id}>{s.name} - {s.class?.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Kategori</Label>
              <Select value={formData.categoryId} onValueChange={v => {
                const cat = goodCats.find(c => c.id === v)
                setFormData(p => ({ ...p, categoryId: v, points: cat?.defaultPoints || 5 }))
              }}>
                <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                <SelectContent>
                  {goodCats.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.defaultPoints} poin)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Poin</Label><Input type="number" value={formData.points} onChange={e => setFormData(p => ({ ...p, points: parseInt(e.target.value) || 0 }))} /></div>
            <div><Label>Tanggal</Label><Input type="date" value={formData.date} onChange={e => setFormData(p => ({ ...p, date: e.target.value }))} /></div>
            <div><Label>Keterangan</Label><Textarea value={formData.description} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleCreate}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? <PageSkeleton /> : (
        <div className="space-y-3">
          {goodDeeds.map(g => (
            <Card key={g.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="cursor-pointer" onClick={() => { setSelectedStudentId(g.studentId); setActivePage('student-profile') }}>
                    <p className="font-medium">{g.student?.name}</p>
                    <p className="text-xs text-muted-foreground">{g.student?.class?.name} • {formatDateShort(g.date)}</p>
                    <div className="flex gap-2 mt-1">
                      <Badge className="bg-yellow-100 text-yellow-800">{g.category?.name}</Badge>
                      <Badge className="bg-emerald-100 text-emerald-800">{g.points} poin</Badge>
                    </div>
                    {g.description && <p className="text-sm mt-1 text-muted-foreground">{g.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Dicatat: {g.recorder?.name || '-'}</p>
                  </div>
                  {(authUser?.role === 'ADMIN' || authUser?.role === 'VP_KESISWAAN') && (
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-red-400 hover:text-red-600" onClick={() => handleDelete(g.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {goodDeeds.length === 0 && <Card><CardContent className="p-8 text-center text-muted-foreground">Tidak ada data kebaikan</CardContent></Card>}
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
