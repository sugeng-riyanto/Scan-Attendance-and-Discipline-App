'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Save, RefreshCw, Upload, GraduationCap, Trash2, ImagePlus } from 'lucide-react'

interface ProfileState {
  name: string
  address: string
  logo: string
  headerImage: string
  themeColor: string
  description: string
  vision: string
  mission: string
  phone: string
  email: string
  hasJhs: boolean
  hasShs: boolean
  jhsStart: string
  jhsEnd: string
  shsStart: string
  shsEnd: string
}

const EMPTY: ProfileState = {
  name: '', address: '', logo: '', headerImage: '', themeColor: '#10b981',
  description: '', vision: '', mission: '', phone: '', email: '',
  hasJhs: true, hasShs: true, jhsStart: '07:00', jhsEnd: '14:50', shsStart: '07:00', shsEnd: '15:30',
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan')
  return data as T
}

// The school's public profile — everything visitors see on the school's landing
// page (/s/:code). Editable by the school's own Admin / Kepala Sekolah.
export function SchoolProfileSettings({ themeColor }: { themeColor: string }) {
  const [form, setForm] = useState<ProfileState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchProfile() }, [])

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ school: ProfileState & { code: string } }>('/api/school-profile')
      const s = data.school
      setForm({
        name: s.name || '', address: s.address || '', logo: s.logo || '', headerImage: s.headerImage || '', themeColor: s.themeColor || themeColor,
        description: s.description || '', vision: s.vision || '', mission: s.mission || '',
        phone: s.phone || '', email: s.email || '',
        hasJhs: s.hasJhs !== false, hasShs: s.hasShs !== false,
        jhsStart: s.jhsStart || '07:00', jhsEnd: s.jhsEnd || '14:50', shsStart: s.shsStart || '07:00', shsEnd: s.shsEnd || '15:30',
      })
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/school-profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, address: form.address, logo: form.logo, headerImage: form.headerImage, themeColor: form.themeColor,
          description: form.description, vision: form.vision, mission: form.mission,
          phone: form.phone, email: form.email,
          hasJhs: form.hasJhs, hasShs: form.hasShs,
          jhsStart: form.jhsStart, jhsEnd: form.jhsEnd, shsStart: form.shsStart, shsEnd: form.shsEnd,
        }),
      })
      toast.success('Profil sekolah disimpan — tampil di landing page sekolah')
    } catch (err: any) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setForm(p => ({ ...p, logo: reader.result as string }))
    reader.readAsDataURL(file)
  }

  const handleHeaderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onloadend = () => setForm(p => ({ ...p, headerImage: reader.result as string }))
    reader.readAsDataURL(file)
  }

  if (loading) return <Skeleton className="h-64" />

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Profil Sekolah (Landing Page)</CardTitle>
        <CardDescription className="text-xs">
          Konten ini ditampilkan publik di halaman depan sekolah (<code className="text-xs">/s/KODE</code>) — logo, visi-misi, jenjang, dan jadwal masuk-pulang.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Nama Sekolah</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
          <div><Label>Alamat</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Logo</Label>
            <div className="flex items-center gap-3 mt-1">
              {form.logo ? (
                <img src={form.logo} alt="Logo" className="h-14 w-14 rounded-lg border object-contain p-1" />
              ) : (
                <div className="h-14 w-14 rounded-lg border bg-gray-50 dark:bg-gray-800 flex items-center justify-center"><GraduationCap className="h-7 w-7 text-gray-300" /></div>
              )}
              <div className="space-y-1">
                <input type="file" accept="image/*" className="hidden" id="profile-logo-upload" onChange={handleLogoUpload} />
                <Button variant="outline" size="sm" onClick={() => document.getElementById('profile-logo-upload')?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Upload Logo
                </Button>
                {form.logo && (
                  <Button variant="ghost" size="sm" className="ml-1 text-red-500 h-8" onClick={() => setForm(p => ({ ...p, logo: '' }))}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Gambar Header (Banner)</Label>
            <div className="flex items-start gap-3 mt-1">
              {form.headerImage ? (
                <img src={form.headerImage} alt="Header" className="h-20 w-40 rounded-lg border object-cover" />
              ) : (
                <div className="h-20 w-40 rounded-lg border bg-gray-50 dark:bg-gray-800 flex items-center justify-center"><ImagePlus className="h-6 w-6 text-gray-300" /></div>
              )}
              <div className="space-y-1">
                <input type="file" accept="image/*" className="hidden" id="profile-header-upload" onChange={handleHeaderUpload} />
                <Button variant="outline" size="sm" onClick={() => document.getElementById('profile-header-upload')?.click()}>
                  <Upload className="h-4 w-4 mr-1" /> Upload Gambar
                </Button>
                {form.headerImage && (
                  <Button variant="ghost" size="sm" className="ml-1 text-red-500 h-8" onClick={() => setForm(p => ({ ...p, headerImage: '' }))}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Hapus
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div>
            <Label>Warna Tema</Label>
            <div className="flex items-center gap-3 mt-1">
              <input type="color" value={form.themeColor} onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))}
                className="h-10 w-10 rounded border cursor-pointer" />
              <Input value={form.themeColor} onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))}
                className="w-32" placeholder="#10b981" />
              <div className="h-8 w-8 rounded-full border" style={{ backgroundColor: form.themeColor }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><Label>Telepon</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(021) 7000-0000" /></div>
          <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="info@sekolah.sch.id" /></div>
        </div>

        <div><Label>Deskripsi Singkat</Label><Textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ringkasan profil sekolah…" /></div>
        <div><Label>Visi</Label><Textarea rows={2} value={form.vision} onChange={e => setForm(p => ({ ...p, vision: e.target.value }))} placeholder="Visi sekolah…" /></div>
        <div><Label>Misi</Label><Textarea rows={3} value={form.mission} onChange={e => setForm(p => ({ ...p, mission: e.target.value }))} placeholder="Misi sekolah (satu misi per baris)…" /></div>

        <Separator />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jenjang & Jadwal Masuk-Pulang</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">JHS (SMP)</Label>
              <Switch checked={form.hasJhs} onCheckedChange={v => setForm(p => ({ ...p, hasJhs: v }))} />
            </div>
            {form.hasJhs && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Jam Masuk</Label><Input type="time" value={form.jhsStart} onChange={e => setForm(p => ({ ...p, jhsStart: e.target.value }))} /></div>
                <div><Label className="text-xs">Jam Pulang</Label><Input type="time" value={form.jhsEnd} onChange={e => setForm(p => ({ ...p, jhsEnd: e.target.value }))} /></div>
              </div>
            )}
          </div>
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="font-medium">SHS (SMA)</Label>
              <Switch checked={form.hasShs} onCheckedChange={v => setForm(p => ({ ...p, hasShs: v }))} />
            </div>
            {form.hasShs && (
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-xs">Jam Masuk</Label><Input type="time" value={form.shsStart} onChange={e => setForm(p => ({ ...p, shsStart: e.target.value }))} /></div>
                <div><Label className="text-xs">Jam Pulang</Label><Input type="time" value={form.shsEnd} onChange={e => setForm(p => ({ ...p, shsEnd: e.target.value }))} /></div>
              </div>
            )}
          </div>
        </div>

        <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleSave} disabled={saving}>
          {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Simpan Profil
        </Button>
      </CardContent>
    </Card>
  )
}
