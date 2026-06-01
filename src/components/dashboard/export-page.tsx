'use client'

import React, { useState } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileSpreadsheet, FileDown, RefreshCw } from 'lucide-react'
import { ClassInfo } from './types'
import { useApiFetch } from './hooks/use-api-fetch'

export function ExportPage() {
  const { user } = useAuthStore()
  const { classFilter, setClassFilter } = useAppStore()
  const [exportType, setExportType] = useState('attendance')
  const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0] })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0])
  const [exporting, setExporting] = useState(false)
  const { data: classesData } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  const classes = classesData?.classes || []
  const isGuruJaga = user?.role === 'GURU_JAGA'

  const handleExportXlsx = async () => {
    setExporting(true)
    try {
      const params = new URLSearchParams({ type: exportType, startDate, endDate })
      if (classFilter !== 'all') params.set('classId', classFilter)
      const res = await fetch(`/api/export?${params.toString()}`)
      if (!res.ok) throw new Error('Gagal mengekspor data')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${exportType}_${startDate}_${endDate}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('File XLSX berhasil diunduh')
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengekspor')
    } finally {
      setExporting(false)
    }
  }

  const handleExportPdf = () => {
    const params = new URLSearchParams({ type: exportType, startDate, endDate })
    if (classFilter !== 'all') params.set('classId', classFilter)
    window.open(`/api/export-pdf?${params.toString()}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Export Data</h2>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div><Label>Jenis Data</Label>
            <Select value={exportType} onValueChange={setExportType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="attendance">Kehadiran</SelectItem>
                <SelectItem value="violations">Pelanggaran</SelectItem>
                <SelectItem value="good-deeds">Kebaikan</SelectItem>
                <SelectItem value="discipline-pattern">Pola Disiplin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Dari Tanggal</Label><Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></div>
            <div><Label>Sampai Tanggal</Label><Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></div>
          </div>
          <div><Label>Kelas</Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kelas</SelectItem>
                {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleExportXlsx} disabled={exporting}>
              {exporting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Download XLSX
            </Button>
            <Button variant="outline" onClick={handleExportPdf} disabled={exporting}>
              <FileDown className="h-4 w-4 mr-2" /> Export PDF
            </Button>
          </div>
          {isGuruJaga && (
            <p className="text-xs text-muted-foreground">Sebagai Guru Jaga, Anda dapat mengekspor laporan kehadiran dengan ringkasan chart.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
