'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore, AuthUser } from '@/lib/stores/auth-store'
import { useAppStore, AppPage } from '@/lib/stores/app-store'
import { usePreviewStore } from '@/lib/stores/preview-store'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { GraduationCap, Lock, RefreshCw, Database, QrCode, ClipboardList, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SchoolLandingProfile } from '@/components/dashboard/school-landing-profile'
import { toast } from 'sonner'
import { useTheme } from 'next-themes'
import { apiFetch } from '@/lib/api-fetch'
import { SchoolConfigType, DEMO_CREDS } from '@/lib/types'
import { ThemeToggle } from '@/components/theme-toggle'
import { resolveSchoolByHostname } from '@/lib/school-host'

interface PublicSchool {
  id: string
  code: string
  name: string
  address: string | null
  logo: string | null
  headerImage?: string | null
  themeColor: string | null
  domain: string | null
  description?: string | null
  vision?: string | null
  mission?: string | null
  phone?: string | null
  email?: string | null
  hasJhs?: boolean
  hasShs?: boolean
  jhsStart?: string | null
  jhsEnd?: string | null
  shsStart?: string | null
  shsEnd?: string | null
  subscriptions?: { status: string; plan: string }[]
}

// Subscription status badge for the directory cards (ACTIVE/TRIAL/EXPIRED/INACTIVE).
function subscriptionBadge(status?: string) {
  if (status === 'ACTIVE') {
    return <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Aktif</Badge>
  }
  if (status === 'TRIAL') {
    return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Masa Percobaan</Badge>
  }
  if (status === 'EXPIRED' || status === 'INACTIVE') {
    return <Badge className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300">Tidak Aktif</Badge>
  }
  return null
}

const SCHOOL_COOKIE = 'school_code'

function readSchoolParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('school')
}

function readSchoolCookie(): string | null {
  if (typeof window === 'undefined') return null
  const m = document.cookie.match(new RegExp(`(?:^|; )${SCHOOL_COOKIE}=([^;]*)`))
  return m ? decodeURIComponent(m[1]) : null
}

function writeSchoolCookie(code: string | null) {
  if (typeof document === 'undefined') return
  if (code) document.cookie = `${SCHOOL_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`
  else document.cookie = `${SCHOOL_COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
}

export function LoginScreen({ schoolConfig, themeColor, initialSchoolCode }: { schoolConfig: SchoolConfigType; themeColor: string; initialSchoolCode?: string }) {
  // Per-school landing: on "/" the visitor picks their school from the
  // directory; each school also has its own landing page at "/s/:code" that
  // opens straight into that school's branded login form. `initialSchoolCode`
  // is set only on those dedicated school pages.
  const [schools, setSchools] = useState<PublicSchool[]>([])
  const [school, setSchool] = useState<PublicSchool | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [pickerLoading, setPickerLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState<'ALL' | 'JHS' | 'SHS'>('ALL')
  const { login } = useAuthStore()
  const { resolvedTheme } = useTheme()
  // next-themes can't know the theme during SSR, so `resolvedTheme` is undefined
  // on the server but resolved on the client's first render — using it directly
  // in a style prop would mismatch between server HTML and client hydration.
  // Gate the themed background behind a mounted flag so both renders agree
  // (no gradient server-side; it fades in after mount once the theme is known).
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pinMode, setPinMode] = useState(false)
  const [pin, setPin] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [setupLoading, setSetupLoading] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const [demoConfig, setDemoConfig] = useState<Record<string, boolean>>({})
  const roleConfigKey: Record<string, string> = {
    SUPER_ADMIN: 'superadmin', ADMIN: 'admin', KEPALA_SEKOLAH: 'kepsek', VP_KESISWAAN: 'vpkes',
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

  // Load the public school directory. Plain `/` (no ?school= and no remembered
  // school_code cookie) shows the landing picker; otherwise the chosen school's
  // branded login form renders directly. On a dedicated /s/:code page the URL
  // code is authoritative; an unknown code renders a "sekolah tidak ditemukan"
  // card instead of the picker.
  useEffect(() => {
    let cancelled = false
    apiFetch<{ schools: PublicSchool[] }>('/api/schools/public')
      .then(({ schools }) => {
        if (cancelled) return
        setSchools(schools || [])
        setPickerLoading(false)
        // Hostname routing: on a school's dedicated subdomain the landing page
        // resolves straight to that school (School.domain is the source of
        // truth; the middleware's SCHOOL_DOMAINS rewrite is a faster bonus).
        // On localhost this resolves to null and the /s/:code path (or the
        // remembered cookie / ?school= param) applies instead.
        const param = readSchoolParam()
        const hostResolved = !initialSchoolCode && !param
          ? resolveSchoolByHostname(typeof window !== 'undefined' ? window.location.hostname : '', schools || [])
          : null
        const wanted = initialSchoolCode ?? param ?? hostResolved ?? readSchoolCookie()
        const match = wanted ? schools.find(s => s.code === wanted) || null : null
        if (match) {
          setSchool(match)
          // Visiting a school's own page (or subdomain) counts as picking it:
          // remember it so a later visit to "/" opens straight into the same
          // school's login.
          if (initialSchoolCode || hostResolved) writeSchoolCookie(match.code)
        } else if (initialSchoolCode) {
          setNotFound(true)
        }
      })
      .catch(() => { if (!cancelled) setPickerLoading(false) })
    return () => { cancelled = true }
  }, [initialSchoolCode])

  // Each school's landing page gets its own browser-tab identity: title and
  // favicon follow the selected school instead of the global defaults.
  useEffect(() => {
    if (!school) return
    document.title = `Masuk — ${school.name}`
    if (school.logo) {
      const link = (document.querySelector("link[rel~='icon']") as HTMLLinkElement) || document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/png'
      link.href = school.logo
      document.head.appendChild(link)
    }
  }, [school])

  const backToPicker = () => {
    // On a dedicated /s/:code page, "back" leaves the school's landing page
    // for the shared directory at "/". The school cookie must be cleared too,
    // otherwise "/" would auto-reopen the same school's login instead of the
    // directory; on "/" it just clears in place.
    if (initialSchoolCode) {
      writeSchoolCookie(null)
      window.location.assign('/')
      return
    }
    setSchool(null)
    setNotFound(false)
    writeSchoolCookie(null)
    window.history.replaceState(null, '', '/')
  }

  // Directory search + jenjang filter, sorted so schools with an ACTIVE
  // subscription appear first (then TRIAL, then the rest — stable within rank).
  const query = search.trim().toLowerCase()
  const subRank = (s: PublicSchool) => {
    const st = s.subscriptions?.[0]?.status
    if (st === 'ACTIVE') return 0
    if (st === 'TRIAL') return 1
    return 2
  }
  const filteredSchools = schools
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => {
      if (query && !`${s.name} ${s.code} ${s.address || ''}`.toLowerCase().includes(query)) return false
      if (levelFilter === 'JHS' && !s.hasJhs) return false
      if (levelFilter === 'SHS' && !s.hasShs) return false
      return true
    })
    .sort((a, b) => subRank(a.s) - subRank(b.s) || a.i - b.i)
    .map(x => x.s)

  // A school whose subscription lapsed is "locked": visitors shouldn't try to
  // log in (the auth route refuses them server-side; the UI says so clearly).
  const isLocked = !!school && ['EXPIRED', 'INACTIVE'].includes(school.subscriptions?.[0]?.status || '')

  // Branding + accent for the selected school (falls back to global config).
  const displayTheme = school?.themeColor || themeColor
  const displayName = school?.name || schoolConfig.school_name
  const displayAddress = school?.address || schoolConfig.school_address
  const displayLogo = school?.logo || schoolConfig.school_logo
  const visibleDemoCreds = school
    ? DEMO_CREDS.filter(d => demoConfig[d.role] !== false && (d.schoolCode === '*' || d.schoolCode === school.code))
    : []
  // The demo database belongs to SHB-001; the reseed button only makes sense there.
  const showSetup = !school || school.code === 'SHB-001'

  const handleLogin = async (u?: string, p?: string) => {
    const un = u || username
    const pw = p || password
    if (pinMode) {
      if (!un || !pin) { toast.error('Masukkan username dan PIN'); return }
    } else if (!un || !pw) { toast.error('Masukkan username dan password'); return }
    if (!termsAccepted) {
      toast.error('Anda harus menyetujui Syarat dan Ketentuan terlebih dahulu')
      return
    }
    setLoading(true)
    try {
      const res = await apiFetch<{ user: AuthUser; message: string }>('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pinMode
          ? { username: un, pin, acceptedTerms: true }
          : { username: un, password: pw, acceptedTerms: true })
      })
      login(res.user)
      useAppStore.getState().setActivePage('dashboard')
      useAppStore.getState().setClassFilter('all')
      // A fresh login never starts inside a stale school preview.
      usePreviewStore.getState().clearPreview()
      if (initialSchoolCode) {
        // The /s/:code landing page lives outside the dashboard shell; hop to
        // "/" so the authenticated app renders (the dashboard is client-gated
        // and reads the session from the auth store).
        window.location.assign('/')
      } else {
        toast.success(`Selamat datang, ${res.user.name}!`)
      }
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
    <div className="min-h-screen flex items-center justify-center p-4 dark:bg-gray-950" style={!mounted || resolvedTheme === 'dark' ? undefined : { background: `linear-gradient(to bottom right, ${displayTheme}10, ${displayTheme}20)` }}>
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      {!school && (
        <Card className="w-full max-w-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ backgroundColor: themeColor }}>
              {schoolConfig.school_logo ? (
                <img src={schoolConfig.school_logo} alt="Logo" className="h-10 w-10 rounded-full object-contain" />
              ) : (
                <GraduationCap className="h-8 w-8" />
              )}
            </div>
            <CardTitle className="text-2xl font-bold" style={{ color: themeColor }}>{notFound ? `Sekolah ${initialSchoolCode}` : (schoolConfig.school_name || 'Presensi Sekolah')}</CardTitle>
            <CardDescription>{notFound ? 'Halaman sekolah tidak ditemukan' : 'Pilih sekolah Anda untuk melanjutkan'}</CardDescription>
          </CardHeader>
          <CardContent>
            {notFound ? (
              <div className="py-8 text-center">
                <p className="text-sm font-semibold">Sekolah tidak ditemukan</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Kode sekolah <code className="font-mono">{initialSchoolCode}</code> tidak terdaftar atau tidak aktif.
                </p>
                <a href="/" className="mt-4 inline-block">
                  <Button variant="outline" size="sm">← Kembali ke daftar sekolah</Button>
                </a>
              </div>
            ) : pickerLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Memuat daftar sekolah…</div>
            ) : schools.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada sekolah aktif.</div>
            ) : (
              <>
                <div className="mb-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Cari nama, kode, atau kota…" className="pl-9" />
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {(['ALL', 'JHS', 'SHS'] as const).map(lv => {
                      const active = levelFilter === lv
                      const label = lv === 'ALL' ? 'Semua' : lv === 'JHS' ? 'JHS (SMP)' : 'SHS (SMA)'
                      return (
                        <button key={lv} type="button" onClick={() => setLevelFilter(lv)}
                          className={`px-3 py-1 text-xs rounded-full border transition-colors ${active ? 'text-white border-transparent' : 'text-muted-foreground hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                          style={active ? { backgroundColor: displayTheme } : undefined}>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Menampilkan {filteredSchools.length} dari {schools.length} sekolah</p>
                {filteredSchools.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Tidak ada sekolah yang cocok dengan pencarian.</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {filteredSchools.map(s => {
                      const st = s.subscriptions?.[0]?.status
                      const locked = st === 'EXPIRED' || st === 'INACTIVE'
                      return (
                        // Each school has its own landing page at /s/:code — the
                        // directory links straight to it, so the URL is shareable.
                        <a key={s.id} href={`/s/${encodeURIComponent(s.code)}`}
                          className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-shadow overflow-hidden ${locked ? 'border-red-300 dark:border-red-900/60 hover:shadow-none' : 'hover:shadow-md'}`}>
                          {s.headerImage && (
                            <img src={s.headerImage} alt={`Header ${s.name}`}
                              className="h-16 w-[calc(100%+2rem)] -mx-4 -mt-4 mb-1 object-cover" />
                          )}
                          <div className="flex items-center gap-3 w-full">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: s.themeColor || themeColor }}>
                              {s.logo ? <img src={s.logo} alt="Logo" className="h-6 w-6 rounded-full object-contain" /> : <GraduationCap className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-tight" style={{ color: s.themeColor || themeColor }}>{s.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{s.code}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                              {subscriptionBadge(st)}
                            </div>
                          </div>
                          {s.address && <p className="text-xs text-muted-foreground leading-relaxed">{s.address}</p>}
                          <div className="flex flex-wrap gap-1.5 mt-0.5">
                            {s.hasJhs && <Badge variant="outline" className="text-[10px]">JHS (SMP)</Badge>}
                            {s.hasShs && <Badge variant="outline" className="text-[10px]">SHS (SMA)</Badge>}
                          </div>
                          {locked && (
                            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                              <Lock className="h-3 w-3 shrink-0" /> Login ditutup — langganan tidak aktif
                            </p>
                          )}
                        </a>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            <Separator className="my-4" />
            <a href="/scan" className="block">
              <Button variant="outline" className="w-full">
                <QrCode className="h-4 w-4 mr-2" /> Scan Presensi (Tanpa Login)
              </Button>
            </a>
          </CardContent>
        </Card>
      )}
      {school && (
      <div className="w-full max-w-2xl">
        {isLocked && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40 p-4 flex items-start gap-3">
            <Lock className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">Login untuk sekolah ini sedang ditutup</p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                Langganan sekolah tidak aktif. Silakan hubungi administrator untuk memperpanjang langganan sebelum login.
              </p>
            </div>
          </div>
        )}
        {/* School profile — visi-misi, jenjang, jadwal masuk-pulang (editable by the school's Admin/Kepsek in Settings -> Profil). Shared with the Super Admin edit-school live preview. */}
        <SchoolLandingProfile school={school} fallbackTheme={themeColor} />

        <Card className="w-full max-w-md mx-auto">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold" style={{ color: displayTheme }}>{displayName}</CardTitle>
            <CardDescription>Sistem Presensi & Kedisiplinan</CardDescription>
            <button type="button" onClick={backToPicker}
              className="text-xs underline underline-offset-2 mt-2" style={{ color: displayTheme }}>
              {initialSchoolCode ? '← Kembali ke daftar sekolah' : 'Ganti sekolah'}
            </button>
          </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="Masukkan username" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{pinMode ? 'PIN Login Cepat' : 'Password'}</Label>
            <Input id="password" type="password" value={pinMode ? pin : password}
              inputMode={pinMode ? 'numeric' : undefined} maxLength={pinMode ? 8 : undefined}
              onChange={e => pinMode ? setPin(e.target.value.replace(/\D/g, '')) : setPassword(e.target.value)}
              placeholder={pinMode ? 'Masukkan PIN' : 'Masukkan password'} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
            <button type="button" onClick={() => { setPinMode(m => !m); setPin(''); setPassword('') }}
              className="text-xs underline underline-offset-2" style={{ color: displayTheme }}>
              {pinMode ? 'Login dengan kata sandi' : 'Login cepat dengan PIN'}
            </button>
          </div>
          <div className="flex items-start gap-2 pt-1">
            <Checkbox id="terms" checked={termsAccepted} onCheckedChange={v => setTermsAccepted(v === true)} className="mt-0.5" />
            <label htmlFor="terms" className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed cursor-pointer select-none">
              Saya telah membaca dan menyetujui{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2" style={{ color: displayTheme }}>
                Syarat dan Ketentuan Penggunaan
              </a>{' '}
              (UU PDP No. 27/2022 dan UU Perlindungan Anak No. 35/2014) sebelum login.
            </label>
          </div>
          <Button className="w-full text-white" style={{ backgroundColor: displayTheme }} onClick={() => handleLogin()} disabled={loading}>
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

          {showSetup && (
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
            <p className="text-xs text-gray-400 dark:text-gray-500">&copy; {new Date().getFullYear()} {displayName || 'Sekolah'}. All rights reserved.</p>
          </div>
        </CardContent>
        </Card>
      </div>
      )}
    </div>
  )
}
