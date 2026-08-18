'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { RefreshCw, ShieldAlert, AlertTriangle, Info, Search, Download } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'

interface AuditLogRow {
  id: string; action: string; category: string; level: string | null
  severity: string; details: string | null; username: string | null
  role: string | null; ip: string | null; createdAt: string
}

const CATEGORIES = ['AUTH', 'ACCOUNT', 'EXPORT', 'IMPORT', 'SETTINGS', 'DATA', 'BREACH', 'SYSTEM']

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'Login Success',
  LOGIN_PIN_SUCCESS: 'Login via PIN',
  LOGIN_FAILED: 'Login Failed',
  LOGIN_BLOCKED_SUBSCRIPTION: 'Login Blocked (Subscription)',
  LOGOUT: 'Logout',
  PASSWORD_CHANGE: 'Password Changed',
  PASSWORD_CHANGE_FAILED: 'Password Change Failed',
  EMAIL_CHANGE: 'Email Changed',
  PIN_CHANGE: 'PIN Changed',
  PIN_DISABLED: 'PIN Disabled',
  AUTH_PIN_ENABLED: 'PIN Authentication Enabled',
  AUTH_PIN_DISABLED: 'PIN Authentication Disabled',
  REMINDER_ENABLED: 'Reminder Enabled',
  REMINDER_DISABLED: 'Reminder Disabled',
  EXPORT: 'Data Exported',
  EXPORT_PDF: 'PDF Exported',
  IMPORT: 'Data Imported',
  IMPORT_STUDENTS: 'Students Imported',
  CONFIG_CHANGE: 'Configuration Changed',
  SCHOOL_PROFILE_UPDATE: 'School Profile Updated',
  RESEED: 'Database Reseeded',
  BREACH_REPORTED: 'Breach Reported',
  SCHOOL_CREATE: 'School Created',
  SCHOOL_UPDATE: 'School Updated',
  SCHOOL_DELETE: 'School Deleted',
  USER_CREATE: 'User Created',
  USER_UPDATE: 'User Updated',
  USER_DELETE: 'User Deleted',
  SUBSCRIPTION_RENEW: 'Subscription Renewed',
  SUBSCRIPTION_UPDATE: 'Subscription Updated',
  SUBSCRIPTION_ACTIVATE: 'Subscription Activated',
  SUBSCRIPTION_DEACTIVATE: 'Subscription Deactivated',
}

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [solutions, setSolutions] = useState<Record<string, string>>({})
  const [catLabels, setCatLabels] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState('ALL')
  const [category, setCategory] = useState('ALL')
  const [severity, setSeverity] = useState('ALL')
  const [username, setUsername] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ level, category, severity, username, limit: '500' })
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)
      const data = await apiFetch<{ logs: AuditLogRow[]; counts: Record<string, number>; solutions: Record<string, string>; categoryLabels: Record<string, string> }>(`/api/audit-logs?${params}`)
      setLogs(data.logs); setCounts(data.counts); setSolutions(data.solutions); setCatLabels(data.categoryLabels)
    } catch { /* gated page; silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchLogs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sevBadge = (s: string) =>
    s === 'CRITICAL' ? <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"><ShieldAlert className="h-3 w-3 mr-1" />CRITICAL</Badge>
    : s === 'WARNING' ? <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"><AlertTriangle className="h-3 w-3 mr-1" />WARNING</Badge>
    : <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"><Info className="h-3 w-3 mr-1" />INFO</Badge>

  const fmt = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const exportCSV = () => {
    const BOM = '\uFEFF'
    const header = ['Timestamp', 'User', 'Role', 'Action', 'Category', 'Level', 'Severity', 'Details', 'IP']
    const rows = logs.map(l => [
      new Date(l.createdAt).toISOString(),
      l.username || '',
      l.role || '',
      ACTION_LABELS[l.action] || l.action,
      catLabels[l.category] || l.category,
      l.level || '',
      l.severity,
      (l.details || '').replace(/"/g, '""'),
      l.ip || '',
    ])
    const csv = BOM + header.map(h => `"${h}"`).join(';') + '\n' + rows.map(r => r.map(c => `"${c}"`).join(';')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `activity_log_${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const resetFilters = () => { setLevel('ALL'); setCategory('ALL'); setSeverity('ALL'); setUsername(''); setDateFrom(''); setDateTo('') }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Activity Log</h2>
          <p className="text-sm text-muted-foreground">User &amp; sensitive activity monitoring — per UU PDP No. 27/2022 and Terms &amp; Conditions.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={logs.length === 0}>
            <Download className="h-4 w-4 mr-1" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-1" />Refresh
          </Button>
        </div>
      </div>

      {/* Severity summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {(['CRITICAL', 'WARNING', 'INFO'] as const).map(s => (
          <Card key={s}>
            <CardContent className="p-3 text-center">
              <p className={`text-2xl font-bold ${s === 'CRITICAL' ? 'text-red-600 dark:text-red-400' : s === 'WARNING' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>{counts[s] || 0}</p>
              <p className="text-xs text-muted-foreground">{s === 'CRITICAL' ? 'Critical (Incidents)' : s === 'WARNING' ? 'Warnings' : 'Routine'}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-2 items-end">
            {/* Level */}
            <div className="w-28"><p className="text-xs text-muted-foreground mb-1">Level</p>
              <Select value={level} onValueChange={setLevel}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">All</SelectItem><SelectItem value="JHS">JHS (SMP)</SelectItem><SelectItem value="SHS">SHS (SMA)</SelectItem></SelectContent></Select>
            </div>
            {/* Category */}
            <div className="w-36"><p className="text-xs text-muted-foreground mb-1">Category</p>
              <Select value={category} onValueChange={setCategory}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">All</SelectItem>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{catLabels[c] || c}</SelectItem>)}</SelectContent></Select>
            </div>
            {/* Severity */}
            <div className="w-32"><p className="text-xs text-muted-foreground mb-1">Severity</p>
              <Select value={severity} onValueChange={setSeverity}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="ALL">All</SelectItem><SelectItem value="CRITICAL">Critical</SelectItem><SelectItem value="WARNING">Warning</SelectItem><SelectItem value="INFO">Routine</SelectItem></SelectContent></Select>
            </div>
            {/* Date From */}
            <div className="w-36"><p className="text-xs text-muted-foreground mb-1">From</p>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-sm" />
            </div>
            {/* Date To */}
            <div className="w-36"><p className="text-xs text-muted-foreground mb-1">To</p>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-sm" />
            </div>
            {/* Username search */}
            <div className="w-44"><p className="text-xs text-muted-foreground mb-1">Username</p>
              <Input placeholder="Search user…" value={username} onChange={e => setUsername(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLogs()} />
            </div>
            <Button onClick={fetchLogs} size="sm"><Search className="h-4 w-4 mr-1" />Apply</Button>
            <Button variant="ghost" size="sm" onClick={resetFilters}>Reset</Button>
          </div>
        </CardContent>
      </Card>

      {/* Log table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Activity Trail ({logs.length} entries)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="max-h-[520px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">User</TableHead>
                  <TableHead className="text-xs">Action</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Category</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Level</TableHead>
                  <TableHead className="text-xs">Severity</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">IP</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8}><Skeleton className="h-24" /></TableCell></TableRow>
                ) : logs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No activity logs found.</TableCell></TableRow>
                ) : logs.map(l => (
                  <TableRow key={l.id} className="dark:border-gray-800">
                    <TableCell className="text-xs whitespace-nowrap">{fmt(l.createdAt)}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{l.username || '—'}</span>
                      {l.role ? <span className="text-muted-foreground ml-1">({l.role})</span> : null}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{ACTION_LABELS[l.action] || l.action}</TableCell>
                    <TableCell className="text-xs hidden md:table-cell">{catLabels[l.category] || l.category}</TableCell>
                    <TableCell className="text-xs hidden lg:table-cell">{l.level || '—'}</TableCell>
                    <TableCell className="text-xs">{sevBadge(l.severity)}</TableCell>
                    <TableCell className="text-xs hidden sm:table-cell text-muted-foreground">{l.ip || '—'}</TableCell>
                    <TableCell className="text-xs max-w-[280px] truncate hidden lg:table-cell" title={l.details || ''}>{l.details || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Solutions & next steps */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recommended Actions by Category</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(solutions).map(([cat, sol]) => (
            <p key={cat} className="text-sm"><span className="font-semibold">{catLabels[cat] || cat}:</span> <span className="text-muted-foreground">{sol}</span></p>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
