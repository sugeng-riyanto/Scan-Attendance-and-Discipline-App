'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { apiFetch } from '@/lib/api-fetch'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { Plus, Pencil, Trash2, ExternalLink, Copy, Globe, FileText, Calendar, Info } from 'lucide-react'

interface SchoolDocument {
  id: string
  type: string
  title: string
  description: string | null
  url: string
  isPublished: boolean
  createdBy: string
  period: string | null
  createdAt: string
  updatedAt: string
}

type DocumentType = 'HANDBOOK' | 'CALENDAR' | 'INFORMATION'

const DOC_TABS: { value: DocumentType; label: string; icon: React.ReactNode }[] = [
  { value: 'HANDBOOK', label: 'Buku Panduan', icon: <FileText className="h-4 w-4" /> },
  { value: 'CALENDAR', label: 'Kalender Akademik', icon: <Calendar className="h-4 w-4" /> },
  { value: 'INFORMATION', label: 'Informasi', icon: <Info className="h-4 w-4" /> },
]

const emptyForm = { title: '', description: '', url: '', isPublished: false, period: '' }

export function SchoolDocumentsPage() {
  const authUser = useAuthStore(s => s.user)
  const isAdminOrVpkes = authUser?.role === 'ADMIN' || authUser?.role === 'VP_KESISWAAN'
  const [activeTab, setActiveTab] = useState<DocumentType>('HANDBOOK')
  const [showDialog, setShowDialog] = useState(false)
  const [editingDoc, setEditingDoc] = useState<SchoolDocument | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data, loading, refetch } = useApiFetch<{ documents: SchoolDocument[] }>(
    `/api/school-documents?type=${activeTab}`, [activeTab]
  )

  const documents = data?.documents || []

  const resetForm = () => {
    setForm(emptyForm)
    setEditingDoc(null)
  }

  const openCreate = () => {
    resetForm()
    setShowDialog(true)
  }

  const openEdit = (doc: SchoolDocument) => {
    setEditingDoc(doc)
    setForm({
      title: doc.title,
      description: doc.description || '',
      url: doc.url,
      isPublished: doc.isPublished,
      period: doc.period || '',
    })
    setShowDialog(true)
  }

  const handleSubmit = async () => {
    if (!form.title || !form.url) { toast.error('Judul dan URL wajib diisi'); return }
    try {
      if (editingDoc) {
        await apiFetch(`/api/school-documents?id=${editingDoc.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            type: editingDoc.type,
            period: activeTab === 'INFORMATION' ? form.period || null : null,
          }),
        })
        toast.success('Dokumen diperbarui')
      } else {
        await apiFetch('/api/school-documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...form,
            type: activeTab,
            period: activeTab === 'INFORMATION' ? form.period || null : null,
          }),
        })
        toast.success('Dokumen berhasil dibuat')
      }
      setShowDialog(false)
      resetForm()
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Hapus dokumen ini?')) return
    try {
      await apiFetch(`/api/school-documents?id=${id}`, { method: 'DELETE' })
      toast.success('Dokumen dihapus')
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const handleTogglePublish = async (doc: SchoolDocument) => {
    try {
      await apiFetch(`/api/school-documents?id=${doc.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !doc.isPublished }),
      })
      toast.success(doc.isPublished ? 'Dokumen disembunyikan' : 'Dokumen dipublikasikan')
      refetch()
    } catch (err: any) { toast.error(err.message) }
  }

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url)
    toast.success('Link disalin')
  }

  const renderForm = () => (
    <div className="space-y-3">
      <div>
        <Label>Judul</Label>
        <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="Judul dokumen" />
      </div>
      <div>
        <Label>Deskripsi</Label>
        <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="Deskripsi (opsional)" />
      </div>
      <div>
        <Label>URL Google Drive</Label>
        <Input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="https://drive.google.com/..." />
      </div>
      {activeTab === 'INFORMATION' && (
        <div>
          <Label>Periode</Label>
          <Select value={form.period} onValueChange={v => setForm(p => ({ ...p, period: v }))}>
            <SelectTrigger><SelectValue placeholder="Pilih periode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="WEEKLY">Mingguan</SelectItem>
              <SelectItem value="MONTHLY">Bulanan</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Switch checked={form.isPublished} onCheckedChange={v => setForm(p => ({ ...p, isPublished: v }))} />
        <Label>Publikasikan</Label>
      </div>
    </div>
  )

  const renderDocCard = (doc: SchoolDocument) => (
    <Card key={doc.id}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium truncate">{doc.title}</h3>
              <Badge variant={doc.isPublished ? 'default' : 'secondary'} className="shrink-0 text-xs">
                {doc.isPublished ? 'Published' : 'Draft'}
              </Badge>
              {doc.period && <Badge variant="outline" className="text-xs">{doc.period === 'WEEKLY' ? 'Mingguan' : 'Bulanan'}</Badge>}
            </div>
            {doc.description && <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>}
            <div className="flex items-center gap-2 mt-2">
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" asChild>
                <a href={doc.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" /> Buka
                </a>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => copyLink(doc.url)}>
                <Copy className="h-3 w-3" /> Salin Link
              </Button>
            </div>
          </div>
          {isAdminOrVpkes && (
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTogglePublish(doc)}>
                <Globe className={`h-4 w-4 ${doc.isPublished ? 'text-emerald-600' : 'text-muted-foreground'}`} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(doc)}>
                <Pencil className="h-4 w-4 text-blue-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(doc.id)}>
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  const readerView = (
    <Tabs value={activeTab} onValueChange={v => setActiveTab(v as DocumentType)}>
      <TabsList>
        {DOC_TABS.map(tab => (
          <TabsTrigger key={tab.value} value={tab.value} className="gap-1">
            {tab.icon} {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {DOC_TABS.map(tab => (
        <TabsContent key={tab.value} value={tab.value}>
          <div className="space-y-3 mt-4">
            {loading ? <PageSkeleton /> : (
              documents.length === 0 ? (
                <Card><CardContent className="p-8 text-center text-muted-foreground">Tidak ada dokumen</CardContent></Card>
              ) : documents.map(renderDocCard)
            )}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  )

  if (!isAdminOrVpkes) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Dokumen Sekolah</h2>
        {readerView}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">Dokumen Sekolah</h2>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Tambah
        </Button>
      </div>

      <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if (!v) resetForm() }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingDoc ? 'Edit Dokumen' : 'Tambah Dokumen'}</DialogTitle></DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); resetForm() }}>Batal</Button>
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleSubmit}>
              {editingDoc ? 'Simpan' : 'Buat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {readerView}
    </div>
  )
}
