'use client'

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { formatTimeWIB, getStatusColor } from '@/lib/attendance-utils'
import { isWithinGeofence } from '@/lib/geo-utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MapPin, ScanLine, Camera, CheckCircle, AlertTriangle, Home, User, X, RefreshCw, Smartphone, Wifi, WifiOff } from 'lucide-react'
import { Scanner } from '@yudiel/react-qr-scanner'
import Webcam from 'react-webcam'
import { Student, AttendanceRecord, GeofenceConfig } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { useGeolocation } from './hooks/use-geolocation'

export function AttendanceScannerPage() {
  const { user } = useAuthStore()
  const { addNotification } = useAppStore()
  const geo = useGeolocation()
  const today = new Date().toISOString().split('T')[0]
  const [scanning, setScanning] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkResult, setCheckResult] = useState<any>(null)
  const webcamRef = useRef<Webcam>(null)
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user')
  const { data: attData, loading, refetch } = useApiFetch<{ attendances: AttendanceRecord[]; summary: any }>(`/api/attendance?date=${today}`)
  const { data: geoData } = useApiFetch<{ geofences: GeofenceConfig[] }>('/api/geofence')
  const activeGeofence = geoData?.geofences?.find(g => g.isActive && g.isDefault) || geoData?.geofences?.find(g => g.isActive)

  const [welcomeStudent, setWelcomeStudent] = useState<any>(null)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [welcomeStatus, setWelcomeStatus] = useState<'checkin' | 'checkout' | 'late'>('checkin')
  const [showWelcome, setShowWelcome] = useState(false)

  const [selectedNisn, setSelectedNisn] = useState('')
  const [faceVerifying, setFaceVerifying] = useState(false)
  const [faceResult, setFaceResult] = useState<any>(null)
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null)

  const [welcomeConfigs, setWelcomeConfigs] = useState<Record<string, string>>({})
  const [students, setStudents] = useState<Student[]>([])

  const geoValidation = useMemo(() => {
    if (!activeGeofence || !geo.location) return null
    return isWithinGeofence(geo.location, activeGeofence)
  }, [activeGeofence, geo.location])

  useEffect(() => {
    apiFetch<{ configs: { key: string; value: string }[] }>('/api/school-config')
      .then(data => {
        const map: Record<string, string> = {}
        data.configs.forEach(c => { map[c.key] = c.value })
        setWelcomeConfigs(map)
      })
      .catch(() => {})
    apiFetch<{ students: Student[] }>('/api/students')
      .then(data => setStudents(data.students || []))
      .catch(() => {})
  }, [])

  const speakWelcome = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    const voiceEnabled = welcomeConfigs['welcome_voice_enabled'] !== 'false'
    if (!voiceEnabled) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = welcomeConfigs['welcome_voice_lang'] || 'id-ID'
    utterance.rate = parseFloat(welcomeConfigs['welcome_voice_rate'] || '1')
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }, [welcomeConfigs])

  const formatWelcomeText = useCallback((template: string, student: any, status?: string) => {
    return template
      .replace(/\{name\}/g, student.name || '')
      .replace(/\{nisn\}/g, student.nisn || '')
      .replace(/\{className\}/g, student.className || student.class?.name || '')
      .replace(/\{time\}/g, new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB')
      .replace(/\{status\}/g, status || '')
  }, [])

  const showWelcomeCard = useCallback((student: any, status: string, isLate: boolean) => {
    setWelcomeStudent(student)
    setWelcomeStatus(isLate ? 'late' : status === 'checkout' ? 'checkout' : 'checkin')

    let template = ''
    if (isLate) {
      template = welcomeConfigs['welcome_late_text'] || '{name}, Anda terlambat hari ini.'
    } else if (status === 'checkout') {
      template = welcomeConfigs['welcome_checkout_text'] || 'Selamat pulang, {name}!'
    } else {
      template = welcomeConfigs['welcome_text'] || 'Selamat datang, {name}!'
    }

    const msg = formatWelcomeText(template, student, status)
    setWelcomeMessage(msg)
    setShowWelcome(true)
    speakWelcome(msg)

    setTimeout(() => setShowWelcome(false), 8000)
  }, [welcomeConfigs, formatWelcomeText, speakWelcome])

  const handleScan = async (qrCode: string) => {
    if (checkingIn || !qrCode) return
    setCheckingIn(true)
    setCheckResult(null)
    try {
      const body: any = {
        qrCode, method: 'QR',
        latitude: geo.location?.lat, longitude: geo.location?.lng,
        accuracy: geo.location?.accuracy, deviceInfo: navigator.userAgent.slice(0, 100)
      }
      const res = await apiFetch<any>('/api/attendance/checkin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      })
      setCheckResult(res)
      addNotification({ type: 'success', message: `${res.student?.name} - ${res.status}` })
      toast.success(`${res.student?.name}: ${res.message}`)
      showWelcomeCard(res.student, 'checkin', res.isLate)
      refetch()
    } catch (err: any) {
      try {
        const body: any = {
          qrCode, method: 'QR',
          latitude: geo.location?.lat, longitude: geo.location?.lng,
          accuracy: geo.location?.accuracy, deviceInfo: navigator.userAgent.slice(0, 100)
        }
        const res = await apiFetch<any>('/api/attendance/checkout', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        })
        setCheckResult(res)
        addNotification({ type: 'success', message: `${res.student?.name} - Check-out` })
        toast.success(`${res.student?.name}: ${res.message}`)
        showWelcomeCard(res.student, 'checkout', false)
        refetch()
      } catch (err2: any) {
        toast.error(err2.message || 'Gagal presensi')
        setCheckResult({ error: err2.message })
      }
    } finally {
      setCheckingIn(false)
    }
  }

  const handleFaceCaptureWithVerify = async () => {
    if (!webcamRef.current || !selectedNisn) return
    const screenshot = webcamRef.current.getScreenshot()
    if (!screenshot) { toast.error('Gagal mengambil foto'); return }

    setCapturedPhoto(screenshot)
    setFaceVerifying(true)
    setFaceResult(null)

    try {
      const student = students.find(s => s.nisn === selectedNisn)
      if (!student) { toast.error('Siswa tidak ditemukan'); return }

      try {
        const verifyResult = await apiFetch<any>('/api/face-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ capturedPhoto: screenshot, studentId: student.id })
        })
        setFaceResult(verifyResult)

        if (verifyResult.match === false) {
          toast.error('Wajah tidak cocok dengan data siswa')
          return
        }
      } catch (verifyErr: any) {
        setFaceResult({ match: null, confidence: 0, message: 'Verifikasi gagal, presensi tetap dilanjutkan.' })
      }

      const body: any = {
        qrCode: student.qrCode, method: 'FACE',
        latitude: geo.location?.lat, longitude: geo.location?.lng,
        accuracy: geo.location?.accuracy, deviceInfo: navigator.userAgent.slice(0, 100)
      }

      try {
        const res = await apiFetch<any>('/api/attendance/checkin', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        })
        setCheckResult(res)
        addNotification({ type: 'success', message: `${res.student?.name} - ${res.status}` })
        toast.success(`${res.student?.name}: ${res.message}`)
        showWelcomeCard(res.student, 'checkin', res.isLate)
        refetch()
      } catch (err: any) {
        try {
          const res = await apiFetch<any>('/api/attendance/checkout', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
          })
          setCheckResult(res)
          addNotification({ type: 'success', message: `${res.student?.name} - Check-out` })
          toast.success(`${res.student?.name}: ${res.message}`)
          showWelcomeCard(res.student, 'checkout', false)
          refetch()
        } catch (err2: any) {
          toast.error(err2.message || 'Gagal presensi')
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Gagal verifikasi wajah')
    } finally {
      setFaceVerifying(false)
    }
  }

  const summary = attData?.summary || { total: 0, hadir: 0, terlambat: 0 }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-800">Presensi</h2>

      {showWelcome && welcomeStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowWelcome(false)}>
          <Card className="w-full max-w-md bg-white" onClick={e => e.stopPropagation()}>
            <CardContent className="p-6 text-center space-y-4">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                {welcomeStatus === 'late' ?
                  <AlertTriangle className="h-10 w-10 text-yellow-500" /> :
                  welcomeStatus === 'checkout' ?
                  <Home className="h-10 w-10 text-blue-500" /> :
                  <CheckCircle className="h-10 w-10 text-emerald-500" />
                }
              </div>
              <div>
                <Avatar className="h-16 w-16 mx-auto mb-2">
                  <AvatarImage src={welcomeStudent.photoUrl} />
                  <AvatarFallback className="text-xl bg-emerald-100 text-emerald-700">
                    {welcomeStudent.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <h3 className="text-xl font-bold text-gray-900">{welcomeStudent.name}</h3>
                <p className="text-sm text-muted-foreground">NISN: {welcomeStudent.nisn}</p>
                <p className="text-sm text-muted-foreground">{welcomeStudent.className || welcomeStudent.class?.name}</p>
              </div>
              <div className={`text-lg font-medium px-4 py-2 rounded-lg ${
                welcomeStatus === 'late' ? 'bg-yellow-50 text-yellow-800' :
                welcomeStatus === 'checkout' ? 'bg-blue-50 text-blue-800' :
                'bg-emerald-50 text-emerald-800'
              }`}>
                {welcomeMessage}
              </div>
              <Badge className={welcomeStatus === 'late' ? 'bg-yellow-100 text-yellow-800 text-sm' : welcomeStatus === 'checkout' ? 'bg-blue-100 text-blue-800 text-sm' : 'bg-emerald-100 text-emerald-800 text-sm'}>
                {welcomeStatus === 'late' ? 'Terlambat' : welcomeStatus === 'checkout' ? 'Check-out Berhasil' : 'Check-in Berhasil'}
              </Badge>
              <p className="text-xs text-muted-foreground">Klik di mana saja untuk menutup</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className={`h-5 w-5 ${geo.watching ? 'text-green-500' : 'text-red-500'}`} />
            <div>
              <p className="text-sm font-medium">{geo.watching ? 'GPS Aktif' : 'GPS Tidak Aktif'}</p>
              {geo.watching && <p className="text-xs text-muted-foreground">Akurasi {geo.location?.accuracy ? Math.round(geo.location.accuracy) + 'm' : '-'} {geoValidation?.within ? '✓ Dalam area' : geo.location ? '✗ Di luar area' : ''}</p>}
            </div>
          </div>
          <Badge variant={geo.watching ? 'default' : 'destructive'} className={geo.watching ? 'bg-green-100 text-green-800' : ''}>
            {geo.watching ? 'Aktif' : 'Nonaktif'}
          </Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scan QR Code</CardTitle>
          <CardDescription>Arahkan kamera ke QR code siswa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {scanning ? (
              <div className="w-full max-w-sm mx-auto aspect-square relative">
                <Scanner onScan={(detectedCodes) => { if (detectedCodes?.[0]?.rawValue) { handleScan(detectedCodes[0].rawValue); setScanning(false) } }}
                  onError={() => {}} formats={['qr_code']} styles={{ video: { width: '100%' } }} />
                <Button variant="destructive" size="sm" className="absolute top-2 right-2 z-10" onClick={() => setScanning(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                <ScanLine className="h-16 w-16 text-emerald-600" />
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setScanning(true)}>
                  <Camera className="h-4 w-4 mr-2" /> Mulai Scan
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Presensi Wajah</CardTitle></CardHeader>
        <CardContent>
          {showCamera ? (
            <div className="space-y-3">
              <div>
                <Label className="text-xs mb-1">Pilih Siswa (NISN)</Label>
                <Select value={selectedNisn} onValueChange={setSelectedNisn}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Pilih siswa..." /></SelectTrigger>
                  <SelectContent>
                    {students.map(s => (
                      <SelectItem key={s.nisn} value={s.nisn}>{s.nisn} - {s.name} ({s.class?.name})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="relative">
                <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: cameraFacing }}
                  className="w-full max-w-sm mx-auto rounded-lg" />
                <Button variant="secondary" size="icon" onClick={() => setCameraFacing(f => f === 'user' ? 'environment' : 'user')} className="absolute bottom-2 right-2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 text-white">
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
              {faceResult?.student?.photoUrl && capturedPhoto && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Foto Referensi</p>
                    <img src={faceResult.student.photoUrl} alt="Reference" className="w-full rounded-lg border" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Foto Tangkapan</p>
                    <img src={capturedPhoto} alt="Captured" className="w-full rounded-lg border" />
                  </div>
                </div>
              )}
              {faceResult && (
                <div className={`p-3 rounded-lg text-sm ${faceResult.match ? 'bg-green-50 text-green-800' : faceResult.match === false ? 'bg-red-50 text-red-800' : 'bg-yellow-50 text-yellow-800'}`}>
                  <p className="font-medium">{faceResult.match ? '✓ Wajah terverifikasi' : faceResult.match === false ? '✗ Wajah tidak cocok' : '⚠ Verifikasi dilewati'}</p>
                  {faceResult.message && <p className="text-xs mt-1">{faceResult.message}</p>}
                  {faceResult.confidence > 0 && <p className="text-xs">Confidence: {faceResult.confidence}%</p>}
                </div>
              )}
              <div className="flex gap-2 justify-center">
                <Button onClick={handleFaceCaptureWithVerify} className="bg-emerald-600 hover:bg-emerald-700" disabled={!selectedNisn || faceVerifying}>
                  {faceVerifying ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />}
                  {faceVerifying ? 'Memverifikasi...' : 'Ambil & Verifikasi'}
                </Button>
                <Button variant="outline" onClick={() => { setShowCamera(false); setFaceResult(null); setCapturedPhoto(null) }}>Batal</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-4">
              <User className="h-12 w-12 text-gray-400" />
              <Button variant="outline" onClick={() => setShowCamera(true)}><Camera className="h-4 w-4 mr-2" /> Buka Kamera</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {checkResult && (
        <Card className={checkResult.error ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}>
          <CardContent className="p-4">
            {checkResult.error ? (
              <p className="text-red-700 text-sm">{checkResult.error}</p>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold text-green-800">{checkResult.student?.name}</p>
                <p className="text-sm text-green-700">{checkResult.message} • Status: <Badge className={getStatusColor(checkResult.status)}>{checkResult.status}</Badge></p>
                {checkResult.isLate && <p className="text-xs text-yellow-700">⚠️ Terlambat</p>}
                {checkResult.geoValidation && <p className="text-xs">📍 {checkResult.geoValidation.valid ? 'Dalam area sekolah' : checkResult.geoValidation.reason}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-emerald-600">{summary.hadir || 0}</p><p className="text-xs text-muted-foreground">Hadir</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold text-yellow-600">{summary.terlambat || 0}</p><p className="text-xs text-muted-foreground">Terlambat</p></CardContent></Card>
        <Card><CardContent className="p-3 text-center"><p className="text-xl font-bold">{summary.total || 0}</p><p className="text-xs text-muted-foreground">Total</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Presensi Hari Ini</CardTitle></CardHeader>
        <CardContent>
          <ScrollArea className="max-h-64">
            {(attData?.attendances || []).map(a => (
              <div key={a.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-2">
                  <Avatar className="h-7 w-7"><AvatarFallback className="text-xs">{a.student?.name?.charAt(0)}</AvatarFallback></Avatar>
                  <div>
                    <p className="text-sm">{a.student?.name}</p>
                    <p className="text-xs text-muted-foreground">{a.student?.class?.name} • {a.checkInTime ? formatTimeWIB(a.checkInTime) : '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {a.geoVerified && <MapPin className="h-3 w-3 text-green-500" />}
                  <Badge className={getStatusColor(a.status as any)}>{a.status}</Badge>
                </div>
              </div>
            ))}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options)
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: 'Gagal menghubungi server' }))
    throw new Error(data.error || 'Terjadi kesalahan')
  }
  return res.json()
}
