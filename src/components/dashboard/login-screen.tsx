'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore, AuthUser } from '@/lib/stores/auth-store'
import { useAppStore, AppPage } from '@/lib/stores/app-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { GraduationCap, Lock, RefreshCw, Database, QrCode, ClipboardList } from 'lucide-react'
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
  const [demoConfig, setDemoConfig] = useState<Record<string, boolean>>({})
  const roleConfigKey: Record<string, string> = {
    ADMIN: 'admin', KEPALA_SEKOLAH: 'kepsek', VP_KESISWAAN: 'vpkes',
    WALI_KELAS: 'walikelas', GURU: 'guru', GURU_JAGA: 'gurujaga',
    ORANG_TUA: 'ortu', SISWA: 'siswa',
  }

  useEffect(() => {
    fetch('/api/school-config')
      .then(r => r.json())
      .then((data: { configs: { key: string; value: string }[] }) => {
        const map: Record<string, boolean> = {}
        DEMO_CREDS.forEach(d => {
          const key = `demo_show_${roleConfigKey[d.role] || d.role.toLowerCase()}`
          const cfg = data.configs.find(c => c.key === key)
          map[d.role] = cfg ? cfg.value !== 'false' : true
        })
        setDemoConfig(map)
      })
      .catch(() => setDemoConfig({}))
  }, [])

  const visibleDemoCreds = DEMO_CREDS.filter(d => demoConfig[d.role] !== false)

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

          {visibleDemoCreds.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-3 text-center">Demo Login Cepat</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {visibleDemoCreds.map(d => (
                  <Button key={d.username} variant="outline" size="sm" className="text-xs h-11 px-2"
                    onClick={() => handleLogin(d.username, d.password)} disabled={loading}>
                    {d.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {visibleDemoCreds.length > 0 && (
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
