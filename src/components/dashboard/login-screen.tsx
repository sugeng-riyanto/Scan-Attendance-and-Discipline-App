'use client'

import React, { useState } from 'react'
import { useAuthStore, AuthUser } from '@/lib/stores/auth-store'
import { useAppStore, AppPage } from '@/lib/stores/app-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { GraduationCap, Lock, RefreshCw, Database, QrCode, ClipboardList, Settings, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-fetch'
import { SchoolConfigType, DEMO_CREDS } from '@/lib/types'

export function LoginScreen({ schoolConfig, themeColor }: { schoolConfig: SchoolConfigType; themeColor: string }) {
  const { login } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const [showDemoSettings, setShowDemoSettings] = useState(false)
  const [demoVisibility, setDemoVisibility] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    DEMO_CREDS.forEach(d => {
      const configKey = `demo_show_${d.role.toLowerCase().replace(/_/g, '')}`
      initial[d.role] = (schoolConfig as any)[configKey] !== 'false'
    })
    return initial
  })

  const handleLogin = async (u?: string, p?: string) => {
    const un = u || username
    const pw = p || password
    if (!un || !pw) { toast.error('Masukkan username dan password'); return }
    setLoading(true)
    try {
      const res = await apiFetch<{ user: AuthUser; message: string }>('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: un, password: pw })
      })
      login(res.user)
      useAppStore.getState().setActivePage('dashboard')
      useAppStore.getState().setClassFilter('all')
      toast.success(`Selamat datang, ${res.user.name}!`)
    } catch (err: any) {
      toast.error(err.message || 'Login gagal')
    } finally {
      setLoading(false)
    }
  }

  const handleSetup = async () => {
    setSetupLoading(true)
    try {
      await apiFetch('/api/setup?force=true', { method: 'POST' })
      toast.success('Database berhasil diinisialisasi! Silakan login.')
      setSetupDone(true)
    } catch (err: any) {
      toast.error(err.message || 'Gagal setup database')
    } finally {
      setSetupLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(to br, ${themeColor}10, ${themeColor}20)` }}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ backgroundColor: themeColor }}>
            {schoolConfig.school_logo ? (
              <img src={schoolConfig.school_logo} alt="Logo" className="h-10 w-10 rounded-full object-contain" />
            ) : (
              <GraduationCap className="h-8 w-8" />
            )}
          </div>
          <CardTitle className="text-2xl font-bold" style={{ color: themeColor }}>{schoolConfig.school_name}</CardTitle>
          <CardDescription>Sistem Presensi & Kedisiplinan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Masukkan username" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Masukkan password" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <Button className="w-full text-white" style={{ backgroundColor: themeColor }} onClick={() => handleLogin()} disabled={loading}>
            {loading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
            Masuk
          </Button>

          <div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <p className="text-xs text-muted-foreground">Demo Login Cepat</p>
              <button type="button" onClick={() => setShowDemoSettings(!showDemoSettings)} className="text-muted-foreground hover:text-foreground transition-colors" title="Atur visibilitas demo">
                {showDemoSettings ? <EyeOff className="h-3 w-3" /> : <Settings className="h-3 w-3" />}
              </button>
            </div>
            {showDemoSettings && (
              <div className="mb-3 p-2 bg-gray-50 rounded space-y-1">
                {DEMO_CREDS.map(d => (
                  <label key={d.role} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={demoVisibility[d.role]} onChange={() => setDemoVisibility(prev => ({ ...prev, [d.role]: !prev[d.role] }))} />
                    {d.label}
                  </label>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DEMO_CREDS.filter(d => demoVisibility[d.role]).map(d => (
                <Button key={d.username} variant="outline" size="sm" className="text-xs h-11 px-2"
                  onClick={() => handleLogin(d.username, d.password)} disabled={loading}>
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          {DEMO_CREDS.some(d => demoVisibility[d.role]) && (
            <>
              <Separator />
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={handleSetup} disabled={setupLoading}>
                {setupLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Database className="h-4 w-4 mr-2" />}
                {setupDone ? '✅ Setup Selesai (Klik untuk Re-seed)' : 'Setup Database (Data Demo)'}
              </Button>
            </>
          )}

          <Separator />
          <a href="/scan" className="block">
            <Button variant="outline" className="w-full">
              <QrCode className="h-4 w-4 mr-2" /> Scan Presensi (Tanpa Login)
            </Button>
          </a>
          <a href="/scan-discipline" className="block">
            <Button variant="outline" className="w-full">
              <ClipboardList className="h-4 w-4 mr-2" /> Scan Kedisiplinan (Login)
            </Button>
          </a>
          <Separator />
          <div className="pt-4 text-center">
            <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} {schoolConfig.school_name || 'Sekolah'}. All rights reserved.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
