'use client'

import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Download, FileSpreadsheet } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'

interface SubHistoryEntry {
  id: string
  action: string
  username: string | null
  role: string | null
  details: string | null
  ip: string | null
  createdAt: string
}

const ACTION_LABEL: Record<string, string> = {
  SUBSCRIPTION_RENEW: 'Perpanjangan', SUBSCRIPTION_ACTIVATE: 'Aktivasi',
  SUBSCRIPTION_DEACTIVATE: 'Nonaktifkan', SUBSCRIPTION_UPDATE: 'Perbarui',
}

const EXPORT_HEADERS = ['No', 'Aksi', 'Tanggal', 'Detail', 'Username', 'Role', 'IP']

function exportRows(entries: SubHistoryEntry[]): (string | number)[][] {
  return entries.map((e, i) => [
    i + 1,
    ACTION_LABEL[e.action] || e.action,
    new Date(e.createdAt).toLocaleString('id-ID'),
    e.details || '',
    e.username || '',
    e.role || '',
    e.ip || '',
  ])
}

function csvEscape(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function downloadBlob(content: BlobPart, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportFilename(ext: string): string {
  const today = new Date().toISOString().split('T')[0]
  return `riwayat_langganan_${today}.${ext}`
}

/**
 * Subscription audit history for one school (renew/activate/deactivate/update),
 * with client-side filters: date range (Dari/Sampai, inclusive local days) and
 * username search (case-insensitive contains). Used by the Super Admin dialog
 * and the Settings -> Langganan tab of the school's own Admin/Kepala Sekolah.
 */
export function SubscriptionHistoryList({ schoolId }: { schoolId: string }) {
  const [entries, setEntries] = useState<SubHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [username, setUsername] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setEntries([])
    setDateFrom(''); setDateTo(''); setUsername('')
    apiFetch<{ entries: SubHistoryEntry[] }>(`/api/subscription-history?schoolId=${schoolId}`)
      .then(d => { if (alive) setEntries(d.entries || []) })
      .catch((err: any) => { if (alive) toast.error(err.message) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [schoolId])

  const q = username.trim().toLowerCase()
  const filtered = entries.filter(e => {
    if (q && !(e.username || '').toLowerCase().includes(q)) return false
    const t = new Date(e.createdAt).getTime()
    if (dateFrom && t < new Date(dateFrom + 'T00:00:00').getTime()) return false
    if (dateTo && t > new Date(dateTo + 'T23:59:59').getTime()) return false
    return true
  })
  const hasFilter = !!(dateFrom || dateTo || username)

  // Exports respect the active filters (same set shown in the list).
  const handleExportCsv = () => {
    if (filtered.length === 0) { toast.error('Tidak ada data untuk diekspor'); return }
    const lines = [
      EXPORT_HEADERS.map(h => csvEscape(h)).join(';'),
      ...exportRows(filtered).map(r => r.map(cell => csvEscape(cell)).join(';')),
    ]
    downloadBlob('\uFEFF' + lines.join('\r\n'), exportFilename('csv'), 'text/csv;charset=utf-8')
    toast.success(`CSV berhasil diunduh (${filtered.length} baris)`)
  }

  const handleExportXlsx = () => {
    if (filtered.length === 0) { toast.error('Tidak ada data untuk diekspor'); return }
    const rows = exportRows(filtered).map(r => {
      const o: Record<string, string | number> = {}
      EXPORT_HEADERS.forEach((h, i) => { o[h] = r[i] })
      return o
    })
    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [{ wch: 5 }, { wch: 16 }, { wch: 22 }, { wch: 45 }, { wch: 14 }, { wch: 16 }, { wch: 16 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat Langganan')
    XLSX.writeFile(wb, exportFilename('xlsx'))
    toast.success(`XLSX berhasil diunduh (${filtered.length} baris)`)
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <div><Label className="text-xs">Dari</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 w-36 mt-0.5" /></div>
        <div><Label className="text-xs">Sampai</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-8 w-36 mt-0.5" /></div>
        <div className="min-w-0"><Label className="text-xs">Username</Label><Input value={username} onChange={e => setUsername(e.target.value)} placeholder="Cari username…" className="h-8 w-44 mt-0.5" /></div>
        {hasFilter && <Button variant="outline" size="sm" className="h-8" onClick={() => { setDateFrom(''); setDateTo(''); setUsername('') }}>Reset</Button>}
        <div className="flex items-end gap-2 ml-auto">
          <Button variant="outline" size="sm" className="h-8" onClick={handleExportCsv} disabled={entries.length === 0} title="Unduh riwayat sebagai CSV">
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={handleExportXlsx} disabled={entries.length === 0} title="Unduh riwayat sebagai XLSX">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> XLSX
          </Button>
        </div>
      </div>

      {loading ? <Skeleton className="h-32" /> : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Belum ada riwayat langganan untuk sekolah ini.</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Tidak ada event yang cocok dengan filter.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-2">Menampilkan {filtered.length} dari {entries.length} event.</p>
          <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
            {filtered.map(e => (
              <div key={e.id} className="rounded-lg border px-3 py-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-medium">{ACTION_LABEL[e.action] || e.action}</p>
                  <p className="text-xs text-muted-foreground">{new Date(e.createdAt).toLocaleString('id-ID')}</p>
                </div>
                {e.details && <p className="text-xs text-muted-foreground mt-0.5">{e.details}</p>}
                <p className="text-xs mt-1">
                  Oleh <strong>{e.username || '—'}</strong>
                  {e.role && <span className="text-muted-foreground"> ({e.role})</span>}
                  {e.ip && <span className="text-muted-foreground ml-2">IP {e.ip}</span>}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
