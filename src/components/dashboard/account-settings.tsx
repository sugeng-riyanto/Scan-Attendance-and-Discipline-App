'use client'

import React, { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { KeyRound, Mail, Smartphone, ShieldCheck, BellRing, UserCircle, Download, Trash2, FileText } from 'lucide-react'
import { apiFetch } from '@/lib/api-fetch'
import { roleLabels } from '@/lib/attendance-utils'

interface AccountProfile {
  id: string; username: string; name: string; role: string
  email: string; pinEnabled: boolean; authEnabled: boolean
  reminderEnabled: boolean; reminderType: string; reminderLevel: string
  createdAt: string
}
interface DismissalTimes { jhs: string; shs: string; checkinCutoff: string }

export function AccountSettings() {
  const [profile, setProfile] = useState<AccountProfile | null>(null)
  const [times, setTimes] = useState<DismissalTimes | null>(null)
  const [loading, setLoading] = useState(true)

  // password
  const [curPw, setCurPw] = useState(''); const [newPw, setNewPw] = useState(''); const [confPw, setConfPw] = useState('')
  // email
  const [email, setEmail] = useState('')
  // pin
  const [pin, setPin] = useState(''); const [pinEnabled, setPinEnabled] = useState(false)
  // reminder
  const [remType, setRemType] = useState<'CHECK_IN' | 'CHECK_OUT'>('CHECK_IN')
  const [remLevel, setRemLevel] = useState<'JHS' | 'SHS'>('JHS')

  const [busy, setBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ profile: AccountProfile; dismissalTimes: DismissalTimes }>('/api/account')
      setProfile(data.profile); setTimes(data.dismissalTimes)
      setEmail(data.profile.email || '')
      setPinEnabled(data.profile.pinEnabled)
      setRemType((data.profile.reminderType as 'CHECK_IN' | 'CHECK_OUT') || 'CHECK_IN')
      setRemLevel((data.profile.reminderLevel as 'JHS' | 'SHS') || 'JHS')
    } catch (err: any) { toast.error(err.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const changePassword = async () => {
    if (!curPw || !newPw) return toast.error('Please enter current and new password')
    if (newPw.length < 6) return toast.error('New password must be at least 6 characters')
    if (newPw !== confPw) return toast.error('Password confirmation does not match')
    setBusy(true)
    try {
      await apiFetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'password', currentPassword: curPw, newPassword: newPw }) })
      toast.success('Password changed successfully')
      setCurPw(''); setNewPw(''); setConfPw('')
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const changeEmail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error('Invalid email format')
    setBusy(true)
    try {
      await apiFetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'email', email }) })
      toast.success('Email updated successfully')
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const savePin = async (enabled: boolean) => {
    setBusy(true)
    try {
      await apiFetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pin', pin, enabled }) })
      setPinEnabled(enabled); setPin('')
      toast.success(enabled ? 'Quick login PIN saved' : 'PIN disabled')
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const toggleAuth = async (v: boolean) => {
    setBusy(true)
    try {
      const res = await apiFetch<{ authEnabled: boolean }>('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'auth', authEnabled: v }) })
      setProfile(p => (p ? { ...p, authEnabled: res.authEnabled } : p))
      toast.success(res.authEnabled ? 'PIN authentication enabled' : 'PIN authentication disabled')
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  const saveReminder = async (enabled: boolean) => {
    setBusy(true)
    try {
      await apiFetch('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reminder', reminderEnabled: enabled, reminderType: remType, reminderLevel: remLevel }) })
      setProfile(p => (p ? { ...p, reminderEnabled: enabled, reminderType: remType, reminderLevel: remLevel } : p))
      toast.success(enabled ? 'Reminder enabled' : 'Reminder disabled')
    } catch (err: any) { toast.error(err.message) } finally { setBusy(false) }
  }

  if (loading) return <Skeleton className="h-64" />
  if (!profile) return <p className="text-muted-foreground">Failed to load account.</p>

  const reminderTime = times
    ? remType === 'CHECK_IN'
      ? `pukul ${times.checkinCutoff.padStart(2, '0')}:00`
      : `pukul ${remLevel === 'JHS' ? times.jhs : times.shs} (kepulangan ${remLevel === 'JHS' ? 'JHS/SMP' : 'SHS/SMA'})`
    : ''

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><UserCircle className="h-5 w-5" /> My Account</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p><span className="font-medium">Name:</span> {profile.name}</p>
          <p><span className="font-medium">Username:</span> {profile.username}</p>
          <p><span className="font-medium">Role (RBAC):</span> <Badge variant="outline">{roleLabels[profile.role] || profile.role}</Badge></p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-5 w-5" /> Change Password</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Old Password</Label><Input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} /></div>
          <div><Label>New Password</Label><Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Minimum 6 characters" /></div>
          <div><Label>Confirm New Password</Label><Input type="password" value={confPw} onChange={e => setConfPw(e.target.value)} /></div>
          <Button onClick={changePassword} disabled={busy}>Save Password</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Mail className="h-5 w-5" /> Account Email</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nama@sekolah.ac.id" /></div>
          <p className="text-xs text-muted-foreground">Email is used for account recovery and notifications per data protection regulations.</p>
          <Button onClick={changeEmail} disabled={busy}>Update Email</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-5 w-5" /> Quick PIN Login</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">Enable a 4–8 digit PIN for quick access without typing your password.</p>
          <div className="flex items-center justify-between">
            <div><p className="text-sm font-medium">Enable PIN</p><p className="text-xs text-muted-foreground">{pinEnabled ? 'PIN active' : 'PIN inactive'}</p></div>
            <Switch checked={pinEnabled} onCheckedChange={v => { if (!v) savePin(false); else if (pin) savePin(true); else toast.error('Masukkan PIN terlebih dahulu') }} />
          </div>
          {!pinEnabled && (
            <div className="flex items-end gap-2">
              <div className="flex-1"><Label>New PIN (4–8 digits)</Label><Input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 1234" /></div>
              <Button onClick={() => savePin(true)} disabled={busy || pin.length < 4}>Enable</Button>
            </div>
          )}
          {pinEnabled && (
            <div className="flex items-end gap-2">
              <div className="flex-1"><Label>New PIN (optional)</Label><Input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} placeholder="Leave empty to keep current" /></div>
              <Button variant="outline" onClick={() => pin && savePin(true)} disabled={busy || pin.length < 4}>Change PIN</Button>
              <Button variant="destructive" onClick={() => savePin(false)} disabled={busy}>Disable</Button>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Autentikasi PIN</p>
              <p className="text-xs text-muted-foreground">Allow PIN login on the sign-in page (alongside password).</p>
            </div>
            <Switch checked={profile.authEnabled} onCheckedChange={toggleAuth} disabled={busy || !pinEnabled} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BellRing className="h-5 w-5" /> Pengingat Check-in / Check-out</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">Reminders follow school schedule: check-in uses the cutoff time, check-out uses JHS or SHS dismissal time.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>Jenis Pengingat</Label>
              <Select value={remType} onValueChange={v => setRemType(v as 'CHECK_IN' | 'CHECK_OUT')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CHECK_IN">Check-in (morning)</SelectItem>
                  <SelectItem value="CHECK_OUT">Check-out (afternoon)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Jenjang (Jadwal)</Label>
              <Select value={remLevel} onValueChange={v => setRemLevel(v as 'JHS' | 'SHS')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="JHS">JHS (SMP) — dismiss {times?.jhs}</SelectItem>
                  <SelectItem value="SHS">SHS (SMA) — dismiss {times?.shs}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm">Reminder status: <Badge variant="outline">{profile.reminderEnabled ? `${remType === 'CHECK_IN' ? 'Check-in' : 'Check-out'} ${remTimeLabel(remType, remLevel, times)}` : 'Disabled'}</Badge></p>
          <Button onClick={() => saveReminder(!profile.reminderEnabled)} disabled={busy}>
            {profile.reminderEnabled ? 'Disable Reminder' : `Enable ${remType === 'CHECK_IN' ? 'Check-in' : 'Check-out'} Reminder ${remLevel === 'JHS' ? 'JHS' : 'SHS'} (${reminderTime})`}
          </Button>
        </CardContent>
      </Card>

      {/* Data Rights (UU PDP Art. 4) */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="h-5 w-5" /> Data Rights (UU PDP)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Under UU PDP No. 27/2022 Art. 4, you have the right to access, correct, and request deletion of your personal data.
          </p>

          {/* Request Data Export */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="text-sm font-medium flex items-center gap-2"><Download className="h-4 w-4" /> Export My Data</p>
              <p className="text-xs text-muted-foreground">Download a copy of your personal data stored in this system.</p>
            </div>
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                // Fetch full personal data export from the account API (UU PDP Art. 4(1))
                const exportData = await apiFetch<any>('/api/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'export' }) })
                // Also log the request in the data-rights system
                await apiFetch('/api/data-rights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'EXPORT', details: 'User requested personal data export' }) }).catch(() => {})
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = `my-data-${new Date().toISOString().slice(0,10)}.json`; a.click()
                URL.revokeObjectURL(url)
                toast.success('Data exported successfully')
              } catch { toast.error('Export not available') }
            }}>
              <Download className="h-4 w-4 mr-1" />Export
            </Button>
          </div>

          {/* Request Data Correction */}
          <div className="flex items-center justify-between p-3 border rounded-lg">
            <div>
              <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> Correct My Data</p>
              <p className="text-xs text-muted-foreground">Contact your administrator to correct any inaccurate personal data.</p>
            </div>
            <Button variant="outline" size="sm" onClick={async () => {
              try {
                await apiFetch('/api/data-rights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'CORRECTION', details: 'User requests data correction — please contact admin with details' }) })
                toast.success('Correction request submitted. Admin will contact you.')
              } catch { toast.error('Failed to submit request') }
            }}>Request</Button>
          </div>

          {/* Request Data Deletion */}
          <div className="flex items-center justify-between p-3 border border-red-200 rounded-lg dark:border-red-800">
            <div>
              <p className="text-sm font-medium flex items-center gap-2 text-red-600 dark:text-red-400"><Trash2 className="h-4 w-4" /> Request Data Deletion</p>
              <p className="text-xs text-muted-foreground">Request deletion of your account and personal data. This action requires administrator approval.</p>
            </div>
            <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800" onClick={async () => {
              try {
                await apiFetch('/api/data-rights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'DELETION', details: 'User requests account and data deletion per UU PDP Art. 4' }) })
                toast.success('Deletion request submitted. Admin will review.')
              } catch { toast.error('Failed to submit request') }
            }}>
              <Trash2 className="h-4 w-4 mr-1" />Request
            </Button>
          </div>

          <p className="text-xs text-muted-foreground italic">
            For student data, these rights are exercised by parents/guardians through the school administration.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function remTimeLabel(type: string, level: string, times: DismissalTimes | null) {
  if (!times) return ''
  if (type === 'CHECK_IN') return `— batas masuk ${times.checkinCutoff.padStart(2, '0')}:00`
  return `— pulang ${level === 'JHS' ? times.jhs : times.shs} (${level === 'JHS' ? 'JHS' : 'SHS'})`
}
