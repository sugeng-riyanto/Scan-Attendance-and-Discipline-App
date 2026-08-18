'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SchoolLandingProfile } from '@/components/dashboard/school-landing-profile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Building2, Plus, RefreshCw, Edit, Trash2, Power, KeyRound, CalendarDays, Users, Upload, GraduationCap, ImagePlus, CalendarPlus, AlertTriangle, History } from 'lucide-react'
import { ImportXlsxButton } from './import-xlsx-button'
import { SubscriptionHistoryList } from './subscription-history-list'

interface SchoolInfo { id: string; code: string; name: string; address: string | null; domain: string | null; logo?: string | null; headerImage?: string | null; themeColor?: string | null; description?: string | null; vision?: string | null; mission?: string | null; phone?: string | null; email?: string | null; hasJhs?: boolean; hasShs?: boolean; jhsStart?: string | null; jhsEnd?: string | null; shsStart?: string | null; shsEnd?: string | null; isActive: boolean; subscriptions: any[]; _count?: { users: number; classes: number } }
interface SubInfo { id: string; schoolId: string; status: string; plan: string; periodStart: string | null; periodEnd: string | null; price: number | null; notes: string | null; school: { id: string; name: string; code: string; isActive: boolean } }
interface UserInfo { id: string; username: string; name: string; role: string; schoolId: string | null; isActive: boolean; email: string | null }
// Subscription audit history dialog — who renewed/activated/deactivated and when.
// Content (filters + list + CSV/XLSX export) is shared via SubscriptionHistoryList.
function SubscriptionHistoryDialog({ school, onClose }: { school: { id: string; name: string; code: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!school} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Riwayat Langganan — {school?.name} <span className="font-mono text-sm">({school?.code})</span></DialogTitle></DialogHeader>
        {school && <SubscriptionHistoryList schoolId={school.id} />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', ADMIN: 'School Administrator', KEPALA_SEKOLAH: 'Principal', VP_KESISWAAN: 'Vice Principal of Student Affairs',
  WALI_KELAS: 'Homeroom Teacher', GURU: 'Faculty Teacher', GURU_JAGA: 'Duty Teacher', ORANG_TUA: 'Parent/Guardian', SISWA: 'Student',
}

function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  return fetch(url, options).then(async (res) => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Terjadi kesalahan')
    return data as T
  })
}

function subBadge(status: string) {
  const map: Record<string, string> = { ACTIVE: 'bg-emerald-100 text-emerald-700', INACTIVE: 'bg-red-100 text-red-700', TRIAL: 'bg-amber-100 text-amber-700', EXPIRED: 'bg-gray-200 text-gray-600' }
  const label: Record<string, string> = { ACTIVE: 'Aktif', INACTIVE: 'Nonaktif', TRIAL: 'Masa Percobaan', EXPIRED: 'Kedaluwarsa' }
  return <Badge className={map[status] || 'bg-gray-100'}>{label[status] || status}</Badge>
}

function fmtDate(iso?: string | null) {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Tone the expiry date: red when lapsed/locked, amber under 30 days, muted otherwise.
function expiryTone(iso?: string | null, status?: string) {
  if (!iso) return 'text-muted-foreground'
  if (status === 'EXPIRED' || status === 'INACTIVE') return 'text-red-500 font-medium'
  const days = daysUntil(iso)
  if (days === null || days < 0) return 'text-red-500 font-medium'
  if (days <= 30) return 'text-amber-600 font-medium'
  return 'text-muted-foreground'
}

// Whole days until an ISO date (negative = already past, null = no date).
function daysUntil(iso?: string | null): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000)
}

/* ---------------- Ringkasan Langganan (dashboard Super Admin) ---------------- */
interface RenewalSummary {
  year: number
  count: number
  last: { username: string | null; role: string | null; schoolId: string | null; schoolName: string | null; schoolCode: string | null; createdAt: string } | null
  availableYears: number[]
}

// Compact calendar-year picker used by both renewal-summary surfaces.
function RenewalYearSelect({ value, available, onChange, className }: { value: number; available?: number[]; onChange: (y: number) => void; className?: string }) {
  const years = available && available.length > 0 ? available : [value]
  return (
    <Select value={String(value)} onValueChange={v => onChange(parseInt(v, 10))}>
      <SelectTrigger className={className || 'h-7 w-28 text-xs'}><SelectValue /></SelectTrigger>
      <SelectContent>
        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function SubscriptionAlertCard({ themeColor }: { themeColor: string }) {
  const [alerts, setAlerts] = useState<{ sub: SubInfo; days: number | null }[]>([])
  const [summary, setSummary] = useState<RenewalSummary | null>(null)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [loading, setLoading] = useState(true)

  const fetchAlerts = useCallback(async (yr: number) => {
    try {
      const d = await apiFetch<{ subscriptions: SubInfo[]; renewalSummary?: RenewalSummary }>(`/api/super-admin?resource=subscriptions&year=${yr}`)
      const list = (d.subscriptions || [])
        .map(sub => ({ sub, days: daysUntil(sub.periodEnd) }))
        .filter(({ sub, days }) => {
          if (sub.status === 'EXPIRED' || sub.status === 'INACTIVE') return true
          return days !== null && days >= 0 && days <= 30
        })
        .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
      setAlerts(list)
      setSummary(d.renewalSummary || null)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAlerts(year) }, [fetchAlerts, year])

  const renew = async (schoolId: string, name: string) => {
    try {
      await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'subscriptions', action: 'renew', schoolId }) })
      toast.success(`Langganan ${name} diperpanjang 1 tahun`)
      fetchAlerts(year)
    } catch (err: any) { toast.error(err.message) }
  }

  if (loading || alerts.length === 0) return null

  const expiring = alerts.filter(a => a.days !== null && a.days >= 0)
  const locked = alerts.filter(a => a.sub.status === 'EXPIRED' || a.sub.status === 'INACTIVE')

  return (
    <Card className="border-amber-300 dark:border-amber-700/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" /> Peringatan Langganan
          </CardTitle>
          <RenewalYearSelect value={year} available={summary?.availableYears} onChange={setYear} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {expiring.length > 0 && (
          <p className="text-amber-700 dark:text-amber-400">
            <strong>{expiring.length} sekolah</strong> akan kedaluwarsa dalam 30 hari.
          </p>
        )}
        {locked.length > 0 && (
          <p className="text-red-600 dark:text-red-400">
            <strong>{locked.length} sekolah</strong> langganannya nonaktif/kedaluwarsa — login sekolah diblokir.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b pb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CalendarPlus className="h-3.5 w-3.5" />
            <strong className="text-foreground">{summary?.count ?? 0}</strong> perpanjangan tahun {summary?.year ?? year}
          </span>
          {summary?.last ? (
            <span>
              Terakhir: <strong className="text-foreground">{fmtDate(summary.last.createdAt)}</strong> oleh {summary.last.username || '—'}
              {summary.last.schoolCode && <span className="font-mono"> ({summary.last.schoolCode})</span>}
            </span>
          ) : (
            <span>Belum ada perpanjangan tercatat.</span>
          )}
        </div>
        <div className="space-y-1.5">
          {alerts.map(({ sub, days }) => (
            <div key={sub.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{sub.school.name} <span className="font-mono text-xs text-muted-foreground">{sub.school.code}</span></p>
                <p className="text-xs text-muted-foreground">
                  {sub.status === 'EXPIRED' || sub.status === 'INACTIVE'
                    ? <span className="text-red-500">Langganan {sub.status === 'EXPIRED' ? 'kedaluwarsa' : 'nonaktif'} — perpanjang untuk membuka login</span>
                    : days !== null && <span className="text-amber-600 dark:text-amber-400">Kedaluwarsa dalam {days} hari (s.d. {new Date(sub.periodEnd as string).toLocaleDateString('id-ID')})</span>}
                </p>
              </div>
              <Button size="sm" className="h-7 text-white shrink-0" style={{ backgroundColor: themeColor }} onClick={() => renew(sub.schoolId, sub.school.name)}>
                <CalendarPlus className="h-3.5 w-3.5 mr-1" /> Perpanjang
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function SuperAdminPage({ themeColor }: { themeColor: string }) {
  const [tab, setTab] = useState('schools')

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
        <Building2 className="h-5 w-5" style={{ color: themeColor }} /> Super Admin — Manage Schools & Subscriptions
      </h2>
      <SubscriptionAlertCard themeColor={themeColor} />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="schools">Schools</TabsTrigger>
          <TabsTrigger value="users">Users & RBAC</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions (Yearly)</TabsTrigger>
        </TabsList>
        <TabsContent value="schools" className="mt-4"><SchoolsTab themeColor={themeColor} /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersTab themeColor={themeColor} /></TabsContent>
        <TabsContent value="subscriptions" className="mt-4"><SubscriptionsTab themeColor={themeColor} /></TabsContent>
      </Tabs>
    </div>
  )
}

/* ---------------- Sekolah (CRUD) ---------------- */
const EMPTY_SCHOOL_FORM = {
  code: '', name: '', address: '', domain: '', logo: '', headerImage: '', themeColor: '#10b981',
  description: '', vision: '', mission: '', phone: '', email: '',
  hasJhs: true, hasShs: true, jhsStart: '07:00', jhsEnd: '14:50', shsStart: '07:00', shsEnd: '15:30',
  templateFromSchoolId: '',
}

type SchoolForm = typeof EMPTY_SCHOOL_FORM

function SchoolsTab({ themeColor }: { themeColor: string }) {
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<SchoolForm>(EMPTY_SCHOOL_FORM)
  const [historySchool, setHistorySchool] = useState<{ id: string; name: string; code: string } | null>(null)

  const fetchSchools = useCallback(async () => {
    setLoading(true)
    try { const d = await apiFetch<{ schools: SchoolInfo[] }>('/api/super-admin?resource=schools'); setSchools(d.schools || []) }
    catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSchools() }, [fetchSchools])

  const save = async () => {
    if (!form.code || !form.name) { toast.error('Kode dan nama sekolah wajib diisi'); return }
    try {
      const res = await apiFetch<{ message: string; template?: { classesCopied: number; violationCategories: number; goodDeedCategories: number; templateName?: string } }>('/api/super-admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource: 'schools', action: editId ? 'update' : 'create', id: editId, ...form }),
      })
      if (res.template) {
        toast.success(`Sekolah dibuat + ${res.template.classesCopied} kelas disalin dari "${res.template.templateName}" (kategori pelanggaran ${res.template.violationCategories} & kebaikan ${res.template.goodDeedCategories} sudah tersedia global)`)
      } else {
        toast.success(editId ? 'Sekolah diperbarui' : 'Sekolah dibuat (langganan Trial otomatis)')
      }
      setShowForm(false); setEditId(null); setForm(EMPTY_SCHOOL_FORM)
      fetchSchools()
    } catch (err: any) { toast.error(err.message) }
  }

  const remove = async (s: SchoolInfo) => {
    if (!confirm(`Hapus sekolah ${s.name}? Semua datanya ikut terhapus.`)) return
    try { await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'schools', action: 'delete', id: s.id }) }); toast.success('Sekolah dihapus'); fetchSchools() }
    catch (err: any) { toast.error(err.message) }
  }

  const toggle = async (s: SchoolInfo) => {
    try { await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'schools', action: 'toggle', id: s.id, isActive: !s.isActive }) }); fetchSchools() }
    catch (err: any) { toast.error(err.message) }
  }

  // Quick 1-year renewal right from the row — no need to open the Langganan tab.
  const renew = async (s: SchoolInfo) => {
    try {
      await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'subscriptions', action: 'renew', schoolId: s.id }) })
      toast.success(`Langganan ${s.name} diperpanjang 1 tahun`)
      fetchSchools()
    } catch (err: any) { toast.error(err.message) }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Daftar Sekolah ({schools.length})</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchSchools}><RefreshCw className="h-4 w-4 mr-1" /> Muat Ulang</Button>
              <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => { setEditId(null); setForm(EMPTY_SCHOOL_FORM); setShowForm(true) }}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Sekolah
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Kode</TableHead><TableHead>Nama Sekolah</TableHead><TableHead>Alamat</TableHead><TableHead>Domain</TableHead><TableHead>Pengguna</TableHead><TableHead>Langganan</TableHead><TableHead className="text-right">Aksi</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {schools.map(s => {
                  const sub = s.subscriptions?.[0]
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.code}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">{s.address || '-'}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[160px] truncate">{s.domain || '-'}</TableCell>
                      <TableCell>{s._count?.users ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            {sub ? subBadge(sub.status) : <Badge variant="outline">Tanpa langganan</Badge>}
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Perpanjang 1 tahun" onClick={() => renew(s)}>
                              <CalendarPlus className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {sub?.periodEnd ? (
                            <span className={`text-xs ${expiryTone(sub.periodEnd, sub.status)}`}>s.d. {fmtDate(sub.periodEnd)}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">Belum ada langganan</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggle(s)} title={s.isActive ? 'Nonaktifkan' : 'Aktifkan'}><Power className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Riwayat langganan" onClick={() => setHistorySchool({ id: s.id, name: s.name, code: s.code })}><History className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditId(s.id); setForm({ code: s.code, name: s.name, address: s.address || '', domain: s.domain || '', logo: s.logo || '', headerImage: s.headerImage || '', themeColor: s.themeColor || '#10b981', description: s.description || '', vision: s.vision || '', mission: s.mission || '', phone: s.phone || '', email: s.email || '', hasJhs: s.hasJhs !== false, hasShs: s.hasShs !== false, jhsStart: s.jhsStart || '07:00', jhsEnd: s.jhsEnd || '14:50', shsStart: s.shsStart || '07:00', shsEnd: s.shsEnd || '15:30', templateFromSchoolId: '' }); setShowForm(true) }}><Edit className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => remove(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {schools.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Belum ada sekolah</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-5xl">
          <DialogHeader><DialogTitle>{editId ? 'Edit Sekolah' : 'Tambah Sekolah'}</DialogTitle></DialogHeader>
          <div className="grid lg:grid-cols-2 gap-4">
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div><Label className="text-xs">Kode Sekolah</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="SHB-001" /></div>
            <div><Label className="text-xs">Nama Sekolah</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Sekolah Harapan Bangsa" /></div>
            <div><Label className="text-xs">Alamat</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Jl. ..." /></div>
            <div><Label className="text-xs">Domain (subdomain)</Label><Input value={form.domain} onChange={e => setForm(p => ({ ...p, domain: e.target.value.toLowerCase() }))} placeholder="shb-001.app.test" /></div>
            {!editId && (
              <div>
                <Label className="text-xs">Salin kelas dari sekolah (template) — opsional</Label>
                <Select value={form.templateFromSchoolId || 'none'} onValueChange={v => setForm(p => ({ ...p, templateFromSchoolId: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Tanpa template (mulai dari nol)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa template (mulai dari nol)</SelectItem>
                    {schools.filter(s => s.code !== form.code).map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.code}) — {s._count?.classes ?? 0} kelas</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">Menyalin struktur kelas sekolah pilihan ke sekolah baru. Kategori pelanggaran/kebaikan bersifat global dan otomatis tersedia untuk semua sekolah.</p>
              </div>
            )}

            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profil & Branding</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Logo</Label>
                <div className="flex items-center gap-2 mt-1">
                  {form.logo ? <img src={form.logo} alt="Logo" className="h-12 w-12 rounded-lg border object-contain p-1" /> : <div className="h-12 w-12 rounded-lg border bg-gray-50 dark:bg-gray-800 flex items-center justify-center"><GraduationCap className="h-6 w-6 text-gray-300" /></div>}
                  <div className="space-y-1">
                    <input type="file" accept="image/*" className="hidden" id="sa-logo-upload" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onloadend = () => setForm(p => ({ ...p, logo: r.result as string })); r.readAsDataURL(f) }} />
                    <Button variant="outline" size="sm" onClick={() => document.getElementById('sa-logo-upload')?.click()}><Upload className="h-3.5 w-3.5 mr-1" /> Upload</Button>
                    {form.logo && <Button variant="ghost" size="sm" className="text-red-500 h-7 block" onClick={() => setForm(p => ({ ...p, logo: '' }))}>Hapus</Button>}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Warna Tema</Label>
                <div className="flex items-center gap-2 mt-1">
                  <input type="color" value={form.themeColor} onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))} className="h-9 w-9 rounded border cursor-pointer" />
                  <Input value={form.themeColor} onChange={e => setForm(p => ({ ...p, themeColor: e.target.value }))} className="w-24" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Gambar Header (Banner)</Label>
              <div className="flex items-start gap-2 mt-1">
                {form.headerImage ? <img src={form.headerImage} alt="Header" className="h-14 w-28 rounded-lg border object-cover" /> : <div className="h-14 w-28 rounded-lg border bg-gray-50 dark:bg-gray-800 flex items-center justify-center"><ImagePlus className="h-5 w-5 text-gray-300" /></div>}
                <div className="space-y-1">
                  <input type="file" accept="image/*" className="hidden" id="sa-header-upload" onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onloadend = () => setForm(p => ({ ...p, headerImage: r.result as string })); r.readAsDataURL(f) }} />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('sa-header-upload')?.click()}><Upload className="h-3.5 w-3.5 mr-1" /> Upload</Button>
                  {form.headerImage && <Button variant="ghost" size="sm" className="text-red-500 h-7 block" onClick={() => setForm(p => ({ ...p, headerImage: '' }))}>Hapus</Button>}
                </div>
              </div>
            </div>
            <div><Label className="text-xs">Deskripsi Singkat</Label><Textarea rows={2} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Ringkasan profil…" /></div>
            <div><Label className="text-xs">Visi</Label><Textarea rows={2} value={form.vision} onChange={e => setForm(p => ({ ...p, vision: e.target.value }))} /></div>
            <div><Label className="text-xs">Misi</Label><Textarea rows={2} value={form.mission} onChange={e => setForm(p => ({ ...p, mission: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Telepon</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(021) 7000-0000" /></div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="info@sekolah.sch.id" /></div>
            </div>

            <Separator />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Jenjang & Jadwal</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between"><Label className="text-xs font-medium">JHS (SMP)</Label><Switch checked={form.hasJhs} onCheckedChange={v => setForm(p => ({ ...p, hasJhs: v }))} /></div>
                {form.hasJhs && <div className="grid grid-cols-2 gap-2"><div><Label className="text-[10px]">Masuk</Label><Input type="time" value={form.jhsStart} onChange={e => setForm(p => ({ ...p, jhsStart: e.target.value }))} /></div><div><Label className="text-[10px]">Pulang</Label><Input type="time" value={form.jhsEnd} onChange={e => setForm(p => ({ ...p, jhsEnd: e.target.value }))} /></div></div>}
              </div>
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between"><Label className="text-xs font-medium">SHS (SMA)</Label><Switch checked={form.hasShs} onCheckedChange={v => setForm(p => ({ ...p, hasShs: v }))} /></div>
                {form.hasShs && <div className="grid grid-cols-2 gap-2"><div><Label className="text-[10px]">Masuk</Label><Input type="time" value={form.shsStart} onChange={e => setForm(p => ({ ...p, shsStart: e.target.value }))} /></div><div><Label className="text-[10px]">Pulang</Label><Input type="time" value={form.shsEnd} onChange={e => setForm(p => ({ ...p, shsEnd: e.target.value }))} /></div></div>}
              </div>
            </div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pratinjau Landing Page</p>
            <SchoolLandingProfile school={form} fallbackTheme={themeColor} />
            <p className="text-[11px] text-muted-foreground">Tampilan halaman landing (<span className="font-mono">/s/{form.code || 'KODE'}</span>) — diperbarui langsung saat field diubah.</p>
          </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Batal</Button>
            <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={save}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionHistoryDialog school={historySchool} onClose={() => setHistorySchool(null)} />
    </div>
  )
}

/* ---------------- Pengguna & RBAC (CRUD + template) ---------------- */
function UsersTab({ themeColor }: { themeColor: string }) {
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [schoolId, setSchoolId] = useState('ALL')
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ username: '', name: '', role: 'GURU', password: '', email: '', schoolId: '' })

  const fetchSchools = useCallback(async () => {
    try { const d = await apiFetch<{ schools: SchoolInfo[] }>('/api/super-admin?resource=schools'); setSchools(d.schools || []) } catch {}
  }, [])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const q = schoolId && schoolId !== 'ALL' ? `&schoolId=${encodeURIComponent(schoolId)}` : ''
      const d = await apiFetch<{ users: UserInfo[] }>(`/api/super-admin?resource=users${q}`)
      setUsers((d.users || []).filter(u => u.role !== 'SUPER_ADMIN'))
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [schoolId])

  useEffect(() => { fetchSchools(); fetchUsers() }, [fetchSchools, fetchUsers])

  const save = async () => {
    if (!form.username || !form.name || !form.role) { toast.error('Username, name, and role are required'); return }
    try {
      const effectiveSchoolId = form.schoolId || (schoolId !== 'ALL' ? schoolId : null)
      await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'users', action: editId ? 'update' : 'create', id: editId, username: form.username, name: form.name, role: form.role, password: form.password, email: form.email, schoolId: effectiveSchoolId }) })
      toast.success(editId ? 'User updated' : 'User created')
      setShowForm(false); setEditId(null); setForm({ username: '', name: '', role: 'GURU', password: '', email: '', schoolId: '' })
      fetchUsers()
    } catch (err: any) { toast.error(err.message) }
  }

  const remove = async (u: UserInfo) => {
    if (!confirm(`Delete user ${u.username}?`)) return
    try { await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'users', action: 'delete', id: u.id }) }); toast.success('User deleted'); fetchUsers() }
    catch (err: any) { toast.error(err.message) }
  }

  const toggle = async (u: UserInfo) => {
    try { await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'users', action: 'toggle', id: u.id, isActive: !u.isActive }) }); fetchUsers() }
    catch (err: any) { toast.error(err.message) }
  }

  const schoolName = (sid: string | null) => schools.find(s => s.id === sid)?.name || (sid ? sid.slice(0, 8) : '—')

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Users & Roles ({users.length})</CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">Filter School</Label>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Schools</SelectItem>
                    {schools.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <ImportXlsxButton type="users" onDone={fetchUsers} />
              <ImportXlsxButton type="students" onDone={fetchUsers} />
              <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => { setEditId(null); setForm({ username: '', name: '', role: 'GURU', password: '', email: '', schoolId: schoolId !== 'ALL' ? schoolId : '' }); setShowForm(true) }}>
                <Plus className="h-4 w-4 mr-1" /> Add User
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Username</TableHead><TableHead>Name</TableHead><TableHead>Role (RBAC)</TableHead><TableHead>School</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-mono text-xs">{u.username}</TableCell>
                    <TableCell className="font-medium">{u.name}</TableCell>
                    <TableCell><Badge variant="outline">{ROLE_LABELS[u.role] || u.role}</Badge></TableCell>
                    <TableCell className="text-xs">{schoolName(u.schoolId)}</TableCell>
                    <TableCell>{u.isActive ? <Badge className="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge className="bg-red-100 text-red-700">Inactive</Badge>}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggle(u)} title={u.isActive ? 'Deactivate' : 'Activate'}><Power className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditId(u.id); setForm({ username: u.username, name: u.name, role: u.role, password: '', email: u.email || '', schoolId: u.schoolId || '' }); setShowForm(true) }}><Edit className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400" onClick={() => remove(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {users.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No users yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="text-sm text-muted-foreground">
          <p className="flex items-start gap-2"><KeyRound className="h-4 w-4 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">RBAC Template:</strong> download the XLSX template, fill in the columns <code className="text-xs bg-muted px-1 rounded">Username · Name · Role · NIP · Class Name · School Code</code>, then upload. An empty school code means the default school. Valid roles: Admin, Principal, Vice Principal for Student Affairs, Homeroom Teacher, Teacher, Duty Teacher, Parent, Student (Super Admin cannot be imported).</span>
          </p>
          <p className="flex items-start gap-2 mt-2"><Users className="h-4 w-4 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">Student Template — provision a new school:</strong> the <code className="text-xs bg-muted px-1 rounded">School Code</code> + <code className="text-xs bg-muted px-1 rounded">School Name</code> columns in the student template. Empty = your own school; a code that does <em>not</em> exist yet automatically creates the new school (classes + students + parent accounts) and grants a <strong>30-day Trial</strong> subscription — one upload fully provisions a new school. Super Admin only.</span>
          </p>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? 'Edit User' : 'Add User'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Username</Label><Input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} /></div>
              <div><Label className="text-xs">Name</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Role (RBAC)</Label>
                <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).filter(([r]) => r !== 'SUPER_ADMIN').map(([r, l]) => <SelectItem key={r} value={r}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">School</Label>
                <Select value={form.schoolId || 'NONE'} onValueChange={v => setForm(p => ({ ...p, schoolId: v === 'NONE' ? '' : v }))}>
                  <SelectTrigger><SelectValue placeholder="Choose school" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">— Choose school —</SelectItem>
                    {schools.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">{editId ? 'Password (empty = unchanged)' : 'Password (default: username+123)'}</Label><Input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder={editId ? 'Leave empty' : ''} /></div>
              <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ---------------- Langganan Tahunan (activate/deactivate) ---------------- */
function SubscriptionsTab({ themeColor }: { themeColor: string }) {
  const [subs, setSubs] = useState<SubInfo[]>([])
  const [schools, setSchools] = useState<SchoolInfo[]>([])
  const [summary, setSummary] = useState<RenewalSummary | null>(null)
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [loading, setLoading] = useState(true)
  const [editSub, setEditSub] = useState<SubInfo | null>(null)
  const [form, setForm] = useState({ status: 'ACTIVE', price: '', notes: '', periodEnd: '' })
  const [historySchool, setHistorySchool] = useState<{ id: string; name: string; code: string } | null>(null)

  const fetchAll = useCallback(async (yr: number) => {
    setLoading(true)
    try {
      const [sd, subd] = await Promise.all([
        apiFetch<{ schools: SchoolInfo[] }>('/api/super-admin?resource=schools'),
        apiFetch<{ subscriptions: SubInfo[]; renewalSummary?: RenewalSummary }>(`/api/super-admin?resource=subscriptions&year=${yr}`),
      ])
      setSchools(sd.schools || [])
      setSubs(subd.subscriptions || [])
      setSummary(subd.renewalSummary || null)
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll(year) }, [fetchAll, year])

  const setStatus = async (schoolId: string, activate: boolean) => {
    try {
      await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'subscriptions', action: activate ? 'activate' : 'deactivate', schoolId }) })
      toast.success(activate ? 'Langganan diaktifkan (periode 1 tahun)' : 'Langganan dinonaktifkan — login sekolah diblokir')
      fetchAll(year)
    } catch (err: any) { toast.error(err.message) }
  }

  const saveEdit = async () => {
    if (!editSub) return
    try {
      const periodEnd = form.periodEnd ? new Date(form.periodEnd + 'T23:59:59') : undefined
      await apiFetch('/api/super-admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resource: 'subscriptions', action: 'upsert', schoolId: editSub.schoolId, status: form.status, price: form.price, notes: form.notes, periodEnd }) })
      toast.success('Langganan diperbarui')
      setEditSub(null)
      fetchAll(year)
    } catch (err: any) { toast.error(err.message) }
  }

  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('id-ID') : '—'

  // Schools whose ACTIVE/TRIAL subscription expires within 30 days — flagged amber.
  const expiringSoon = subs.filter(s => {
    if (s.status === 'EXPIRED' || s.status === 'INACTIVE') return false
    const d = daysUntil(s.periodEnd)
    return d !== null && d >= 0 && d <= 30
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base">Langganan Tahunan ({subs.length})</CardTitle>
            <Button variant="outline" size="sm" onClick={() => fetchAll(year)}><RefreshCw className="h-4 w-4 mr-1" /> Muat Ulang</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-32" /> : (
            <>
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-3 py-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <CalendarPlus className="h-4 w-4" style={{ color: themeColor }} /> Ringkasan Perpanjangan
              </span>
              <span className="inline-flex items-center gap-1">
                <strong className="text-foreground">{summary?.count ?? 0}</strong> perpanjangan tahun {summary?.year ?? year}
              </span>
              {summary?.last ? (
                <span>Terakhir: <strong className="text-foreground">{fmtDate(summary.last.createdAt)}</strong> oleh {summary.last.username || '—'}
                  {summary.last.schoolCode && <span className="font-mono"> ({summary.last.schoolCode})</span>}
                </span>
              ) : (
                <span>Belum ada perpanjangan tercatat.</span>
              )}
              <RenewalYearSelect value={year} available={summary?.availableYears} onChange={setYear} className="ml-auto h-7 w-28 text-xs" />
            </div>
            {expiringSoon.length > 0 && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span><strong>{expiringSoon.length} sekolah</strong> akan kedaluwarsa dalam 30 hari: {expiringSoon.map(s => s.school.name).join(', ')}. Perpanjang sebelum tanggal berakhir agar login tidak terblokir.</span>
              </div>
            )}
            <Table>
              <TableHeader><TableRow>
                <TableHead>Sekolah</TableHead><TableHead>Status</TableHead><TableHead>Periode</TableHead><TableHead>Harga/Tahun</TableHead><TableHead className="text-right">Aksi</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {subs.map(s => {
                  const days = daysUntil(s.periodEnd)
                  const soon = s.status !== 'EXPIRED' && s.status !== 'INACTIVE' && days !== null && days >= 0 && days <= 30
                  return (
                  <TableRow key={s.id} className={soon ? 'bg-amber-50/60 dark:bg-amber-950/20' : undefined}>
                    <TableCell>
                      <p className="font-medium">{s.school.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.school.code}</p>
                    </TableCell>
                    <TableCell>{subBadge(s.status)}</TableCell>
                    <TableCell className="text-xs">{fmt(s.periodStart)} → {fmt(s.periodEnd)}
                      {soon && days !== null && <Badge className="ml-2 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">≤30 hari ({days} hari lagi)</Badge>}
                    </TableCell>
                    <TableCell>{s.price ? `Rp ${s.price.toLocaleString('id-ID')}` : '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {s.status !== 'ACTIVE'
                          ? <Button size="sm" className="text-white h-7" style={{ backgroundColor: themeColor }} onClick={() => setStatus(s.schoolId, true)}>Aktifkan</Button>
                          : <Button size="sm" variant="outline" className="h-7 text-red-500 border-red-200" onClick={() => setStatus(s.schoolId, false)}>Nonaktifkan</Button>}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Riwayat langganan" onClick={() => setHistorySchool({ id: s.schoolId, name: s.school.name, code: s.school.code })}><History className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditSub(s); setForm({ status: s.status, price: s.price ? String(s.price) : '', notes: s.notes || '', periodEnd: s.periodEnd ? s.periodEnd.slice(0, 10) : '' }) }}><Edit className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  )
                })}
                {subs.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Belum ada langganan</TableCell></TableRow>}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="text-sm text-muted-foreground">
          <p className="flex items-start gap-2"><CalendarDays className="h-4 w-4 mt-0.5 shrink-0" />
            <span><strong className="text-foreground">Perilaku sistem:</strong> sekolah dengan langganan <strong>Nonaktif/Kedaluwarsa</strong> otomatis diblokir login (semua peran kecuali Super Admin) hingga langganan diaktifkan kembali. Sekolah baru otomatis mendapat <strong>Masa Percobaan (Trial)</strong> 30 hari.</span>
          </p>
        </CardContent>
      </Card>

      <Dialog open={!!editSub} onOpenChange={o => !o && setEditSub(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Langganan — {editSub?.school.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Aktif</SelectItem>
                  <SelectItem value="TRIAL">Masa Percobaan</SelectItem>
                  <SelectItem value="INACTIVE">Nonaktif</SelectItem>
                  <SelectItem value="EXPIRED">Kedaluwarsa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Harga/Tahun (Rp)</Label><Input type="number" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="3500000" /></div>
              <div><Label className="text-xs">Berakhir (tanggal)</Label><Input type="date" value={form.periodEnd} onChange={e => setForm(p => ({ ...p, periodEnd: e.target.value }))} /></div>
            </div>
            <div><Label className="text-xs">Catatan</Label><Input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Catatan langganan" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditSub(null)}>Batal</Button>
            <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={saveEdit}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SubscriptionHistoryDialog school={historySchool} onClose={() => setHistorySchool(null)} />
    </div>
  )
}
