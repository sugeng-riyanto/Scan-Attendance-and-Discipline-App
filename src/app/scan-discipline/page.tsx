'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import Webcam from 'react-webcam'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Search, ScanLine, Camera, User, CheckCircle, AlertTriangle, ArrowLeft, RefreshCw, PenLine, Lock, LogIn, GraduationCap, ClipboardList, Home } from 'lucide-react'
import { Student, CategoryInfo, CategoriesResponse } from '@/components/dashboard/types'

const ALLOWED_ROLES = ['ADMIN','KEPALA_SEKOLAH','VP_KESISWAAN','WALI_KELAS','GURU','GURU_JAGA']

export default function ScanDisciplinePage() {
  const [authState, setAuthState] = useState<'loading' | 'login' | 'ok'>('loading')
  const [loginUser, setLoginUser] = useState({ username: '', password: '' })
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState('')

  const [step, setStep] = useState<'find' | 'form'>('find')
  const [student, setStudent] = useState<Student | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Student[]>([])
  const [searching, setSearching] = useState(false)
  const [type, setType] = useState<'PELANGGARAN' | 'KEBAIKAN'>('PELANGGARAN')
  const [categoryId, setCategoryId] = useState('')
  const [points, setPoints] = useState(0)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [categories, setCategories] = useState<CategoriesResponse>({ violationCategories: [], goodDeedCategories: [] })
  const [showQrScanner, setShowQrScanner] = useState(false)
  const [showFaceScan, setShowFaceScan] = useState(false)
  const webcamRef = useRef<Webcam>(null)

  // Signatures
  const teacherCanvasRef = useRef<HTMLCanvasElement>(null)
  const studentCanvasRef = useRef<HTMLCanvasElement>(null)
  const [teacherSigned, setTeacherSigned] = useState(false)
  const [studentSigned, setStudentSigned] = useState(false)

  // Load categories (after auth is confirmed)
  useEffect(() => {
    if (authState !== 'ok') return
    fetch('/api/categories').then(r => r.json()).then(data => setCategories(data)).catch(() => {})
  }, [authState])

  // Check auth on mount
  useEffect(() => {
    fetch('/api/auth').then(r => r.json()).then(data => {
      if (data.user && ALLOWED_ROLES.includes(data.user.role)) {
        setCurrentUserId(data.user.id)
        setCurrentUserRole(data.user.role)
        setAuthState('ok')
      } else if (data.user) {
        setLoginError('Akun ini tidak memiliki akses ke halaman ini')
        setAuthState('login')
      } else {
        setAuthState('login')
      }
    }).catch(() => setAuthState('login'))
  }, [])

  const handleLogin = async () => {
    if (!loginUser.username || !loginUser.password) { setLoginError('Isi username dan password'); return }
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginUser),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Login gagal') }
      const data = await res.json()
      if (!ALLOWED_ROLES.includes(data.user.role)) {
        throw new Error('Akun ini tidak memiliki akses ke halaman ini')
      }
      setCurrentUserId(data.user.id)
      setCurrentUserRole(data.user.role)
      setAuthState('ok')
      fetch('/api/categories').then(r => r.json()).then(cats => setCategories(cats)).catch(() => {})
      toast.success(`Selamat datang, ${data.user.name}!`)
    } catch (err: any) {
      setLoginError(err.message || 'Login gagal')
    } finally { setLoginLoading(false) }
  }

  // Search students
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/students?search=${encodeURIComponent(searchQuery)}&limit=20`)
      const data = await res.json()
      setSearchResults(data.students || [])
    } catch { toast.error('Gagal mencari siswa') } finally { setSearching(false) }
  }, [searchQuery])

  // Select student
  const selectStudent = (s: Student) => {
    setStudent(s)
    setStep('form')
    setSearchResults([])
    setSearchQuery('')
    setShowQrScanner(false)
    setShowFaceScan(false)
  }

  // Handle QR scan
  const handleQrScan = (result: string) => {
    setShowQrScanner(false)
    fetch(`/api/students?search=${encodeURIComponent(result)}&limit=1`)
      .then(r => r.json())
      .then(data => {
        const s = data.students?.[0]
        if (s) selectStudent(s)
        else toast.error('Siswa tidak ditemukan')
      })
      .catch(() => toast.error('Gagal mencari siswa'))
  }

  // Handle face detect
  const handleFaceCapture = async () => {
    if (!webcamRef.current) return
    const photo = webcamRef.current.getScreenshot()
    if (!photo) { toast.error('Gagal mengambil foto'); return }
    try {
      const res = await fetch('/api/public-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capturedPhoto: photo, method: 'FACE', autoDetect: true }),
      })
      const data = await res.json()
      if (data.found && data.student) {
        const sRes = await fetch(`/api/students?search=${data.student.nisn}&limit=1`)
        const sData = await sRes.json()
        const s = sData.students?.[0]
        if (s) selectStudent(s)
        else toast.error('Siswa tidak ditemukan')
      } else {
        toast.error('Wajah tidak dikenali')
      }
    } catch { toast.error('Gagal verifikasi wajah') }
    setShowFaceScan(false)
  }

  // Category change
  useEffect(() => {
    const cats = type === 'PELANGGARAN' ? categories.violationCategories : categories.goodDeedCategories
    if (cats.length > 0 && !categoryId) {
      setCategoryId(cats[0].id)
      setPoints(cats[0].defaultPoints)
    }
  }, [type, categories])

  const handleCategoryChange = (id: string) => {
    setCategoryId(id)
    const cats = type === 'PELANGGARAN' ? categories.violationCategories : categories.goodDeedCategories
    const cat = cats.find(c => c.id === id)
    if (cat) setPoints(cat.defaultPoints)
  }

  // Signature handlers — using pointer events for touch + mouse
  const initSignaturePad = (canvas: HTMLCanvasElement | null, setSigned: (v: boolean) => void) => {
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.strokeStyle = '#1e40af'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    let drawing = false

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    canvas.onpointerdown = (e) => { drawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); canvas.setPointerCapture(e.pointerId) }
    canvas.onpointermove = (e) => { if (!drawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke() }
    canvas.onpointerup = () => { drawing = false; setSigned(true) }
    canvas.onpointerleave = () => { drawing = false }
  }

  const clearSignature = (canvas: HTMLCanvasElement | null, setSigned: (v: boolean) => void) => {
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setSigned(false)
  }

  const [showSuccess, setShowSuccess] = useState<'KEBAIKAN' | 'PELANGGARAN' | null>(null)

  // Submit
  const handleSubmit = async () => {
    if (!student || !categoryId) { toast.error('Lengkapi data'); return }
    setSubmitting(true)
    const endpoint = type === 'PELANGGARAN' ? '/api/violations' : '/api/good-deeds'
    const teacherSig = teacherCanvasRef.current?.toDataURL()
    const studentSig = studentCanvasRef.current?.toDataURL()
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: student.id,
          categoryId,
          points,
          description,
          date: new Date().toISOString(),
          recordedBy: currentUserId || 'system',
          scanMethod: 'MANUAL',
          teacherSignature: teacherSigned ? teacherSig : undefined,
          studentSignature: studentSigned ? studentSig : undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      setShowSuccess(type)
      setTimeout(() => {
        setShowSuccess(null)
        setStep('find')
        setStudent(null)
        setCategoryId('')
        setPoints(0)
        setDescription('')
        setTeacherSigned(false)
        setStudentSigned(false)
        clearSignature(teacherCanvasRef.current, () => {})
        clearSignature(studentCanvasRef.current, () => {})
      }, 1200)
    } catch (err: any) {
      toast.error(err.message || 'Gagal menyimpan')
    } finally { setSubmitting(false) }
  }

  const currentCats = type === 'PELANGGARAN' ? categories.violationCategories : categories.goodDeedCategories

  // ── Login screen ──
  if (authState === 'login') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="fixed top-4 left-4 z-10">
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/'} className="h-10 bg-white/80 backdrop-blur shadow-sm">
            <Home className="h-4 w-4 mr-1" /> Beranda
          </Button>
        </div>
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 space-y-4">
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
                <ClipboardList className="h-7 w-7 text-blue-600" />
              </div>
              <h1 className="font-bold text-lg">Scan Kedisiplinan</h1>
              <p className="text-xs text-gray-500 mt-1">Masuk untuk melanjutkan</p>
            </div>
            {loginError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{loginError}</p>}
            <div className="space-y-2">
              <Input value={loginUser.username} onChange={e => setLoginUser(p => ({ ...p, username: e.target.value }))}
                placeholder="Username" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              <Input type="password" value={loginUser.password} onChange={e => setLoginUser(p => ({ ...p, password: e.target.value }))}
                placeholder="Password" onKeyDown={e => e.key === 'Enter' && handleLogin()} />
              <Button className="w-full h-11" onClick={handleLogin} disabled={loginLoading}>
                {loginLoading ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
                {loginLoading ? 'Memproses...' : 'Masuk'}
              </Button>
            </div>
            <p className="text-xs text-center text-gray-400">Hanya untuk: Admin, Kepsek, VP Kesiswaan, Wali Kelas, Guru, Guru Jaga</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // ── Main content ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => window.location.href = '/'} className="h-10" title="Beranda">
          <Home className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => { setStep('find'); setStudent(null) }} className="h-10">
          <ArrowLeft className="h-4 w-4" /> Kembali
        </Button>
        <div className="flex-1">
          <h1 className="font-bold text-sm">Scan Kedisiplinan</h1>
          <p className="text-xs text-gray-500">Catat Pelanggaran / Kebaikan Siswa</p>
        </div>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded">{currentUserRole}</span>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Step 1: Find Student */}
        {step === 'find' && (
          <>
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="font-semibold text-sm">Cari Siswa</h3>
                <div className="flex gap-2">
                  <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Nama / NISN" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                  <Button onClick={handleSearch} disabled={searching} className="h-10">
                    {searching ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 h-11 text-xs" onClick={() => setShowQrScanner(!showQrScanner)}>
                    <ScanLine className="h-4 w-4 mr-1" /> QR Code
                  </Button>
                  <Button variant="outline" className="flex-1 h-11 text-xs" onClick={() => setShowFaceScan(!showFaceScan)}>
                    <Camera className="h-4 w-4 mr-1" /> Scan Wajah
                  </Button>
                </div>
              </CardContent>
            </Card>

            {showQrScanner && (
              <Card><CardContent className="p-2">
                <Scanner onScan={(result) => { if (result?.[0]) handleQrScan(result[0].rawValue || '') }}
                  styles={{ container: { width: '100%', height: 250 } }} />
              </CardContent></Card>
            )}

            {showFaceScan && (
              <Card><CardContent className="p-3 space-y-2">
                <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user', width: 320, height: 240 }}
                  style={{ width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8 }} />
                <Button onClick={handleFaceCapture} className="w-full h-11"><Camera className="h-4 w-4 mr-1" /> Verifikasi Wajah</Button>
              </CardContent></Card>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(s => (
                  <Card key={s.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => selectStudent(s)}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="w-10 h-12 rounded-md bg-gray-100 overflow-hidden shrink-0">
                        {s.photoBase64 || s.photoUrl ? <img src={s.photoBase64 || s.photoUrl} className="w-full h-full object-cover" />
                          : <div className="w-full h-full flex items-center justify-center"><User className="h-5 w-5 text-gray-300" /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{s.name}</p>
                        <p className="text-xs text-gray-500">NISN: {s.nisn} • {s.class?.name}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Step 2: Discipline Form */}
        {step === 'form' && student && (
          <>
            <Card className="border-emerald-200 bg-emerald-50">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-12 h-14 rounded-md bg-white overflow-hidden shrink-0 border">
                  {student.photoBase64 || student.photoUrl ? <img src={student.photoBase64 || student.photoUrl} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><User className="h-6 w-6 text-gray-300" /></div>}
                </div>
                <div>
                  <p className="font-bold text-sm">{student.name}</p>
                  <p className="text-xs text-gray-600">NISN: {student.nisn} • {student.class?.name}</p>
                </div>
                <Badge className="ml-auto bg-emerald-200 text-emerald-800">{student.status || 'AKTIF'}</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-4">
                {/* Type selector */}
                <div>
                  <Label>Jenis</Label>
                  <div className="flex gap-2 mt-1">
                    <Button variant={type === 'PELANGGARAN' ? 'default' : 'outline'}
                      className={`flex-1 ${type === 'PELANGGARAN' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                      onClick={() => { setType('PELANGGARAN'); setCategoryId(''); setPoints(0) }}>
                      <AlertTriangle className="h-4 w-4 mr-1" /> Pelanggaran
                    </Button>
                    <Button variant={type === 'KEBAIKAN' ? 'default' : 'outline'}
                      className={`flex-1 ${type === 'KEBAIKAN' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                      onClick={() => { setType('KEBAIKAN'); setCategoryId(''); setPoints(0) }}>
                      <CheckCircle className="h-4 w-4 mr-1" /> Kebaikan
                    </Button>
                  </div>
                </div>

                {/* Category */}
                <div>
                  <Label>Kategori</Label>
                  <Select value={categoryId} onValueChange={handleCategoryChange}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                    <SelectContent>
                      {currentCats.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name} ({c.defaultPoints} poin)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Points */}
                <div>
                  <Label>Poin</Label>
                  <Input type="number" value={points} onChange={e => setPoints(parseInt(e.target.value) || 0)} className="mt-1" />
                </div>

                {/* Description */}
                <div>
                  <Label>Keterangan</Label>
                  <Textarea value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Deskripsi pelanggaran/kebaikan..." className="mt-1" rows={3} />
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Tanda Tangan Guru {teacherSigned && <Badge className="text-[10px] bg-green-100 text-green-800 ml-1">✓</Badge>}</Label>
                    <canvas ref={teacherCanvasRef} width={300} height={80} className="border-2 border-dashed border-blue-200 rounded-md mt-1 bg-blue-50/50 w-full touch-none cursor-crosshair"
                      onPointerDown={() => initSignaturePad(teacherCanvasRef.current, setTeacherSigned)} />
                    <div className="flex gap-2 mt-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1" onClick={() => clearSignature(teacherCanvasRef.current, setTeacherSigned)}>
                        Hapus
                      </Button>
                      {teacherSigned && <Badge className="text-[10px] bg-green-100 text-green-800">Tertanda</Badge>}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Tanda Tangan Siswa {studentSigned && <Badge className="text-[10px] bg-green-100 text-green-800 ml-1">✓</Badge>}</Label>
                    <canvas ref={studentCanvasRef} width={300} height={80} className="border-2 border-dashed border-emerald-200 rounded-md mt-1 bg-emerald-50/50 w-full touch-none cursor-crosshair"
                      onPointerDown={() => initSignaturePad(studentCanvasRef.current, setStudentSigned)} />
                    <div className="flex gap-2 mt-1">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-1" onClick={() => clearSignature(studentCanvasRef.current, setStudentSigned)}>
                        Hapus
                      </Button>
                      {studentSigned && <Badge className="text-[10px] bg-green-100 text-green-800">Tertanda</Badge>}
                    </div>
                  </div>
                </div>

                {/* Submit */}
                <Button onClick={handleSubmit} disabled={submitting || !categoryId}
                  className={`w-full h-12 text-white ${type === 'PELANGGARAN' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                  {submitting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : null}
                  {submitting ? 'Menyimpan...' : `Simpan ${type === 'PELANGGARAN' ? 'Pelanggaran' : 'Kebaikan'}`}
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {/* Success Widget */}
        {showSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-in fade-in">
            <div className={`rounded-2xl p-8 text-center shadow-2xl animate-in zoom-in-95 ${showSuccess === 'KEBAIKAN' ? 'bg-emerald-50' : 'bg-red-50'}`}
              style={{ animationDuration: '1200ms' }}>
              <div className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${showSuccess === 'KEBAIKAN' ? 'bg-emerald-200' : 'bg-red-200'}`}>
                {showSuccess === 'KEBAIKAN'
                  ? <CheckCircle className="h-10 w-10 text-emerald-600" />
                  : <AlertTriangle className="h-10 w-10 text-red-600" />}
              </div>
              <h3 className={`text-xl font-bold ${showSuccess === 'KEBAIKAN' ? 'text-emerald-800' : 'text-red-800'}`}>
                {showSuccess === 'KEBAIKAN' ? 'Kebaikan Dicatat! 🎉' : 'Pelanggaran Tercatat'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">{student?.name} • {points} poin</p>
              <p className="text-xs text-gray-400 mt-3">Menyiapkan isian berikutnya...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}
