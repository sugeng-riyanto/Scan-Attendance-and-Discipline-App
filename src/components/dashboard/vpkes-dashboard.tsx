'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AlertTriangle, Shield, Star, Plus, Save, Trash2 } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { DisciplinePatternChart } from './discipline-pattern-chart'
import { ImportXlsxButton } from './import-xlsx-button'
import { CHART_COLORS } from './chart-constants'
import { StatisticsData, BehaviorAlert, ViolationRecord, GoodDeedRecord, CategoriesResponse, CategoryInfo } from './types'
import { apiFetch } from '@/lib/api-fetch'
import { getBehaviorLevel } from '@/lib/attendance-utils'

export function VPKesDashboard() {
  const { data: stats, loading } = useApiFetch<StatisticsData>('/api/statistics?period=monthly')
  const { data: alertData } = useApiFetch<{ alerts: BehaviorAlert[] }>('/api/alerts?targetRole=VP_KESISWAAN')
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>('/api/violations')
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>('/api/good-deeds')
  const { data: catData, refetch: catRefetch } = useApiFetch<CategoriesResponse>('/api/categories')
  const alerts = alertData?.alerts || []

  const [showCatForm, setShowCatForm] = useState(false)
  const [catForm, setCatForm] = useState({ name: '', code: '', level: 'RINGAN', defaultPoints: '5', type: 'violation' as 'violation' | 'good-deed' })
  const [savingCat, setSavingCat] = useState(false)

  const handleAddCategory = async () => {
    if (!catForm.name || !catForm.code) { toast.error('Nama dan Kode wajib diisi'); return }
    setSavingCat(true)
    try {
      const body: any = { type: catForm.type, name: catForm.name, code: catForm.code, defaultPoints: parseInt(catForm.defaultPoints) || 5 }
      if (catForm.type === 'violation') body.level = catForm.level
      await apiFetch('/api/categories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      toast.success('Kategori ditambahkan')
      setShowCatForm(false)
      setCatForm({ name: '', code: '', level: 'RINGAN', defaultPoints: '5', type: 'violation' })
      catRefetch()
    } catch (err: any) { toast.error(err.message) }
    finally { setSavingCat(false) }
  }

  const handleDeleteCategory = async (id: string, type: 'violation' | 'good-deed') => {
    if (!confirm('Hapus kategori ini?')) return
    try {
      await apiFetch(`/api/categories?id=${id}&type=${type}`, { method: 'DELETE' })
      toast.success('Kategori dihapus')
      catRefetch()
    } catch (err: any) { toast.error(err.message) }
  }

  if (loading) return <PageSkeleton />

  const violCategoryData = (stats?.violationByCategory || []).map(c => ({ name: c.name, value: c.count }))
  const topV = (stats?.topViolators || []).slice(0, 5)

  const classDiscData = (stats?.classComparison || []).map(c => ({
    name: c.className, poin: c.alpha > 0 ? Math.round(c.alpha / c.total * 100) : 0
  }))

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard Wakasek Kesiswaan</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-100"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-xs text-muted-foreground">Total Pelanggaran</p><p className="text-2xl font-bold">{stats?.totalViolations || 0}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100"><Shield className="h-5 w-5 text-orange-600" /></div>
            <div><p className="text-xs text-muted-foreground">Eskalasi Level 2+</p><p className="text-2xl font-bold">{alerts.length}</p></div>
          </div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-100"><Star className="h-5 w-5 text-yellow-600" /></div>
            <div><p className="text-xs text-muted-foreground">Total Poin Pelanggaran</p><p className="text-2xl font-bold">{stats?.totalViolationPoints || 0}</p></div>
          </div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Distribusi Kategori Pelanggaran</CardTitle></CardHeader>
          <CardContent>
            {violCategoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart><Pie data={violCategoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {violCategoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Top Pelanggar</CardTitle></CardHeader>
          <CardContent>
            {topV.length > 0 ? topV.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-muted-foreground w-5">{i + 1}.</span>
                  <div><p className="text-sm font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.className}</p></div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={getBehaviorLevel(s.violationPoints).color}>{getBehaviorLevel(s.violationPoints).label}</Badge>
                  <Badge variant="destructive">{s.violationPoints}</Badge>
                </div>
              </div>
            )) : <p className="text-center text-muted-foreground py-8">Tidak ada data</p>}
          </CardContent>
        </Card>
      </div>

      <DisciplinePatternChart violations={violData?.violations || []} goodDeeds={goodData?.goodDeeds || []} title="Pola Kedisiplinan Sekolah" />
      {classDiscData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Perbandingan Kedisiplinan per Kelas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={classDiscData}><CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                <Bar dataKey="poin" fill="#ef4444" name="Indeks Pelanggaran" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Kelola Kategori Pelanggaran & Kebaikan</CardTitle>
            <div className="flex gap-2">
              <ImportXlsxButton type="violation-categories" onDone={() => { catRefetch(); window.location.reload() }} />
              <ImportXlsxButton type="good-deed-categories" onDone={() => { catRefetch(); window.location.reload() }} />
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setShowCatForm(!showCatForm)}>
                <Plus className="h-4 w-4 mr-1" /> Tambah Kategori
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {showCatForm && (
            <div className="space-y-3 mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><Label className="text-xs">Jenis</Label>
                  <Select value={catForm.type} onValueChange={v => setCatForm(p => ({ ...p, type: v as 'violation' | 'good-deed' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="violation">Pelanggaran</SelectItem>
                      <SelectItem value="good-deed">Kebaikan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Kode</Label><Input value={catForm.code} onChange={e => setCatForm(p => ({ ...p, code: e.target.value }))} placeholder="R01" /></div>
                <div><Label className="text-xs">Nama</Label><Input value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} placeholder="Terlambat" /></div>
                {catForm.type === 'violation' && (
                  <div><Label className="text-xs">Level</Label>
                    <Select value={catForm.level} onValueChange={v => setCatForm(p => ({ ...p, level: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="RINGAN">Ringan</SelectItem>
                        <SelectItem value="SEDANG">Sedang</SelectItem>
                        <SelectItem value="BERAT">Berat</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label className="text-xs">Poin</Label><Input type="number" value={catForm.defaultPoints} onChange={e => setCatForm(p => ({ ...p, defaultPoints: e.target.value }))} /></div>
              </div>
              <div className="flex gap-2">
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleAddCategory} disabled={savingCat}>
                  <Save className="h-4 w-4 mr-1" /> Simpan
                </Button>
                <Button variant="outline" onClick={() => setShowCatForm(false)}>Batal</Button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-semibold mb-2">Pelanggaran ({(catData?.violationCategories || []).length})</p>
              <ScrollArea className="max-h-48">
                {(catData?.violationCategories || []).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({c.code}) • {c.level} • {c.defaultPoints} poin</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-red-400" onClick={() => handleDeleteCategory(c.id, 'violation')}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">Kebaikan ({(catData?.goodDeedCategories || []).length})</p>
              <ScrollArea className="max-h-48">
                {(catData?.goodDeedCategories || []).map(c => (
                  <div key={c.id} className="flex items-center justify-between py-1.5 border-b last:border-0">
                    <div>
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">({c.code}) • {c.defaultPoints} poin</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-red-400" onClick={() => handleDeleteCategory(c.id, 'good-deed')}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                ))}
              </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
