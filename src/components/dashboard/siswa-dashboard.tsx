'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { Clock, User, CreditCard, QrCode, Eye, Image, FileDown, Download, GraduationCap, BookOpen, Shield, AlertTriangle, Star, Copy, Camera, CheckCircle, RefreshCw, X, Home, AlertCircle, ScanLine, Calendar } from 'lucide-react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { toast } from 'sonner'
import Webcam from 'react-webcam'
import html2canvas from 'html2canvas'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useAppStore } from '@/lib/stores/app-store'
import { formatTimeWIB, formatDateShort, getStatusColor, getBehaviorLevel } from '@/lib/attendance-utils'
import { generateQRCode, generateQRString } from '@/lib/qr-utils'
import { useSchoolConfig } from './hooks/use-school-config'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { Student, AttendanceRecord, ViolationRecord, GoodDeedRecord } from './types'
import { loadFaceApiModels, calculateFaceAccuracy, performLiveTest, MIN_ACCURACY_PERCENT, FACE_MATCH_THRESHOLD, AccuracyResult, LiveTestResult } from './face-utils'

export function FaceCaptureSection({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [capturing, setCapturing] = useState(false)
  const [existingRefs, setExistingRefs] = useState<any[]>([])
  const webcamRef = useRef<Webcam>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [showAccuracyPanel, setShowAccuracyPanel] = useState(false)
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user')

  const loadRefs = useCallback(async () => {
    try {
      const res = await fetch(`/api/face-references?studentId=${studentId}`)
      const data = await res.json()
      setExistingRefs(data.faceReferences || [])
    } catch {}
  }, [studentId])

  useEffect(() => { loadRefs() }, [loadRefs])

  useEffect(() => {
    if (showCamera && !modelsLoaded) {
      loadFaceApiModels().then(ok => setModelsLoaded(ok))
    }
  }, [showCamera, modelsLoaded])

  useEffect(() => {
    if (!showCamera || !modelsLoaded || capturing) return
    let active = true
    const detectFace = async () => {
      if (!active || !webcamRef.current) return
      const video = webcamRef.current.video
      if (!video || video.readyState < 2) {
        if (active) requestAnimationFrame(detectFace)
        return
      }
      try {
        const faceapi = await import('@vladmandic/face-api')
        const detection = await faceapi.detectSingleFace(video)
          .withFaceLandmarks()
          .withFaceDescriptor()
        setFaceDetected(!!detection)
      } catch (e) {}
      if (active) {
        setTimeout(detectFace, 300)
      }
    }
    detectFace()
    return () => { active = false }
  }, [showCamera, modelsLoaded, capturing])

  const handleCapture = async () => {
    if (!webcamRef.current) return
    const photo = webcamRef.current.getScreenshot()
    if (!photo) return
    setCapturing(true)
    try {
      let faceDescriptor: number[] | null = null
      if (modelsLoaded) {
        const video = webcamRef.current.video
        if (video) {
          try {
            const faceapi = await import('@vladmandic/face-api')
            const detection = await faceapi.detectSingleFace(video)
              .withFaceLandmarks()
              .withFaceDescriptor()
            if (detection) {
              faceDescriptor = Array.from(detection.descriptor) as number[]
            } else {
              toast.warning('Wajah tidak terdeteksi. Foto disimpan tanpa descriptor.')
            }
          } catch (e) {
            toast.warning('Gagal mendeteksi wajah. Foto disimpan tanpa descriptor.')
          }
        }
      }
      const res = await fetch('/api/face-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, photoBase64: photo, captureIndex: existingRefs.length + 1, captureMethod: 'WEBCAM', faceDescriptor }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Gagal menyimpan')
      } else {
        toast.success(data.message || 'Foto wajah berhasil disimpan')
        if (data.warning) toast.warning(data.warning)
        if (faceDescriptor) toast.info('Descriptor wajah berhasil diekstrak')
        loadRefs()
        if (existingRefs.length + 1 >= 2) setShowAccuracyPanel(true)
      }
    } catch (err: any) {
      toast.error('Gagal menyimpan foto wajah')
    } finally {
      setCapturing(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch('/api/face-references', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, softDelete: true }),
      })
      toast.success('Foto wajah dihapus')
      setExistingRefs(prev => prev.filter((r: any) => r.id !== id))
    } catch (err: any) {
      toast.error('Gagal menghapus')
    }
  }

  const remaining = 5 - existingRefs.filter((r: any) => r.isActive !== false).length
  const descriptorsWithAI = existingRefs.filter((ref: any) => ref.faceDescriptor).length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={(existingRefs.length / 5) * 100} className="flex-1 h-2" />
        <span className="text-xs text-muted-foreground">{existingRefs.length}/5</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Untuk akurasi optimal, disarankan <strong>5 kali capture</strong> wajah. Minimum <strong>3 capture</strong> untuk akurasi dasar. Minimal <strong>2 capture</strong> dengan AI descriptor.
      </p>
      {descriptorsWithAI > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
            <CheckCircle className="h-3 w-3 mr-1" /> {descriptorsWithAI} AI Descriptor
          </Badge>
          {descriptorsWithAI >= 2 && (
            <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700 cursor-pointer hover:bg-blue-100"
              onClick={() => setShowAccuracyPanel(!showAccuracyPanel)}>
              <Shield className="h-3 w-3 mr-1" /> {showAccuracyPanel ? 'Tutup Test' : 'Test Akurasi'}
            </Badge>
          )}
          {existingRefs.length >= 3 && descriptorsWithAI >= 2 && (
            <Badge variant="outline" className="text-xs bg-emerald-50 border-emerald-200 text-emerald-700">
              Siap untuk presensi wajah
            </Badge>
          )}
        </div>
      )}
      {existingRefs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {existingRefs.map((ref: any) => (
            <div key={ref.id} className="relative group">
              <img src={ref.photoBase64} alt={`Capture ${ref.captureIndex}`} className="w-16 h-20 rounded object-cover border" />
              {ref.faceDescriptor ? (
                <div className="absolute bottom-0 left-0 right-0 bg-green-500 text-white text-[11px] text-center py-0.5">AI</div>
              ) : (
                <div className="absolute bottom-0 left-0 right-0 bg-gray-400 text-white text-[11px] text-center py-0.5">Foto</div>
              )}
              <button onClick={() => handleDelete(ref.id)} className="absolute -top-1 -right-1 h-6 w-6 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="h-2 w-2" />
              </button>
              <p className="text-[10px] text-center mt-0.5">#{ref.captureIndex}</p>
            </div>
          ))}
        </div>
      )}
      {remaining > 0 ? (
        <>
          {!showCamera ? (
            <div className="flex gap-2">
              <Button onClick={() => setShowCamera(true)} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                <Camera className="h-4 w-4 mr-2" /> Capture Wajah ({remaining} tersisa)
              </Button>
              {descriptorsWithAI >= 2 && !showAccuracyPanel && (
                <Button variant="outline" onClick={() => setShowAccuracyPanel(true)}>
                  <Shield className="h-4 w-4 mr-1" /> Test
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {!modelsLoaded && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Memuat model AI...
                </div>
              )}
              <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200 bg-black" style={{ aspectRatio: '4/3' }}>
                <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: cameraFacing, width: 640, height: 480 }} className="absolute inset-0 w-full h-full object-cover" />
                {/* Face guide overlay */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-36 h-44 sm:w-48 sm:h-56 rounded-2xl border-2 transition-all duration-300 ${
                    faceDetected ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/50 bg-white/5'
                  }`} />
                </div>
                {modelsLoaded && (
                  <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium shadow-lg z-10 ${
                    faceDetected ? 'bg-emerald-500 text-white' : 'bg-gray-700/80 text-gray-200'
                  }`}>
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${faceDetected ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
                      {faceDetected ? 'Wajah Terdeteksi' : 'Mencari wajah...'}
                    </div>
                  </div>
                )}
                <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full z-10">
                  Capture {existingRefs.length + 1}/5
                </div>
                {capturing && (
                  <div className="absolute inset-0 bg-white animate-ping opacity-30 pointer-events-none z-20" />
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={handleCapture} disabled={capturing} className="h-11 bg-emerald-600 hover:bg-emerald-700 text-sm col-span-1">
                  {capturing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
                  {capturing ? 'Menyimpan...' : 'Ambil'}
                </Button>
                <Button variant="outline" onClick={() => setCameraFacing(f => f === 'user' ? 'environment' : 'user')} className="h-11 text-sm" title="Ganti kamera">
                  <RefreshCw className="h-5 w-5" />
                </Button>
                <Button variant="outline" onClick={() => { setShowCamera(false); setFaceDetected(false) }} className="h-11 text-sm">Tutup</Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-green-600 font-medium text-center">Semua referensi wajah sudah terpenuhi (5/5)</p>
          {!showAccuracyPanel && descriptorsWithAI >= 2 && (
            <Button variant="outline" className="w-full" onClick={() => setShowAccuracyPanel(true)}>
              <Shield className="h-4 w-4 mr-2" /> Uji Akurasi Sekarang
            </Button>
          )}
        </div>
      )}

      {showAccuracyPanel && descriptorsWithAI >= 2 && (
        <AccuracyTestPanel studentId={studentId} existingRefs={existingRefs} onRefresh={loadRefs} />
      )}
    </div>
  )
}

function AccuracyTestPanel({ studentId, existingRefs, onRefresh }: { studentId: string; existingRefs: any[]; onRefresh: () => void }) {
  const [testing, setTesting] = useState(false)
  const [accuracyResult, setAccuracyResult] = useState<AccuracyResult | null>(null)
  const [liveTestMode, setLiveTestMode] = useState(false)
  const [liveTestResult, setLiveTestResult] = useState<LiveTestResult | null>(null)
  const [liveTesting, setLiveTesting] = useState(false)
  const webcamRef = useRef<Webcam>(null)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [liveCameraFacing, setLiveCameraFacing] = useState<'user' | 'environment'>('user')

  useEffect(() => {
    if (liveTestMode && !modelsLoaded) {
      loadFaceApiModels().then(ok => setModelsLoaded(ok))
    }
  }, [liveTestMode, modelsLoaded])

  const getDescriptors = useCallback((): number[][] => {
    return existingRefs
      .filter((ref: any) => ref.faceDescriptor)
      .map((ref: any) => {
        try {
          const desc = typeof ref.faceDescriptor === 'string' ? JSON.parse(ref.faceDescriptor) : ref.faceDescriptor
          return Array.isArray(desc) && desc.length === 128 ? desc : null
        } catch { return null }
      })
      .filter((d: any): d is number[] => d !== null)
  }, [existingRefs])

  const descriptorsWithAI = existingRefs.filter((ref: any) => ref.faceDescriptor).length
  const canTest = descriptorsWithAI >= 2

  const handleTestAccuracy = async () => {
    setTesting(true)
    setLiveTestResult(null)
    try {
      const descriptors = getDescriptors()
      if (descriptors.length < 2) { toast.error('Minimal 2 foto dengan descriptor AI diperlukan'); return }
      await new Promise(r => setTimeout(r, 300))
      const result = calculateFaceAccuracy(descriptors)
      setAccuracyResult(result)
      if (result.overallAccuracy >= MIN_ACCURACY_PERCENT) {
        toast.success(`Akurasi: ${result.overallAccuracy.toFixed(1)}% - ${result.statusLabel}`)
      } else {
        toast.warning(`Akurasi: ${result.overallAccuracy.toFixed(1)}% - ${result.statusLabel}`)
      }
    } catch (err: any) {
      toast.error('Gagal menguji akurasi')
    } finally { setTesting(false) }
  }

  const handleLiveTest = async () => {
    if (!webcamRef.current) return
    const video = webcamRef.current.video
    if (!video) return
    setLiveTesting(true)
    try {
      const faceapi = await import('@vladmandic/face-api')
      const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor()
      if (!detection) { toast.error('Wajah tidak terdeteksi'); return }
      const liveDescriptor = Array.from(detection.descriptor) as number[]
      const storedDescriptors = getDescriptors()
      if (storedDescriptors.length < 1) { toast.error('Tidak ada descriptor tersimpan'); return }
      const result = performLiveTest(liveDescriptor, storedDescriptors)
      setLiveTestResult(result)
      if (result.matched) toast.success(`Wajah dikenali! Akurasi: ${result.bestAccuracy.toFixed(1)}%`)
      else toast.error(`Wajah tidak cocok. Akurasi terbaik: ${result.bestAccuracy.toFixed(1)}%`)
    } catch (e) { toast.error('Gagal melakukan live test') }
    finally { setLiveTesting(false) }
  }

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 85) return 'text-emerald-600'
    if (accuracy >= 75) return 'text-blue-600'
    if (accuracy >= 60) return 'text-amber-600'
    return 'text-red-600'
  }

  const getAccuracyBg = (accuracy: number) => {
    if (accuracy >= 85) return 'bg-emerald-50 border-emerald-200'
    if (accuracy >= 75) return 'bg-blue-50 border-blue-200'
    if (accuracy >= 60) return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
  }

  const getProgressColor = (accuracy: number) => {
    if (accuracy >= 85) return 'bg-emerald-500'
    if (accuracy >= 75) return 'bg-blue-500'
    if (accuracy >= 60) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button onClick={handleTestAccuracy} disabled={!canTest || testing} className="flex-1" variant={canTest ? 'default' : 'outline'} style={canTest ? { backgroundColor: '#10b981' } : {}}>
          {testing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
          {testing ? 'Menguji...' : 'Test Akurasi Referensi'}
        </Button>
        {!canTest && <p className="text-xs text-muted-foreground">Min. 2 foto dengan AI</p>}
      </div>
      {accuracyResult && (
        <div className={`rounded-lg border p-4 space-y-3 ${getAccuracyBg(accuracyResult.overallAccuracy)}`}>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Akurasi Konsistensi Referensi</p>
            <p className={`text-4xl font-bold ${getAccuracyColor(accuracyResult.overallAccuracy)}`}>{accuracyResult.overallAccuracy.toFixed(1)}%</p>
            <Badge className={`mt-1 ${accuracyResult.status === 'excellent' ? 'bg-emerald-100 text-emerald-800' : accuracyResult.status === 'good' ? 'bg-blue-100 text-blue-800' : accuracyResult.status === 'warning' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{accuracyResult.statusLabel}</Badge>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div className={`h-3 rounded-full transition-all duration-500 ${getProgressColor(accuracyResult.overallAccuracy)}`} style={{ width: `${Math.min(100, accuracyResult.overallAccuracy)}%` }} />
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/60 rounded p-2"><p className="text-[10px] text-muted-foreground">Min</p><p className={`text-sm font-bold ${getAccuracyColor(accuracyResult.minAccuracy)}`}>{accuracyResult.minAccuracy.toFixed(1)}%</p></div>
            <div className="bg-white/60 rounded p-2"><p className="text-[10px] text-muted-foreground">Rata-rata</p><p className={`text-sm font-bold ${getAccuracyColor(accuracyResult.overallAccuracy)}`}>{accuracyResult.overallAccuracy.toFixed(1)}%</p></div>
            <div className="bg-white/60 rounded p-2"><p className="text-[10px] text-muted-foreground">Max</p><p className={`text-sm font-bold ${getAccuracyColor(accuracyResult.maxAccuracy)}`}>{accuracyResult.maxAccuracy.toFixed(1)}%</p></div>
          </div>
          {accuracyResult.overallAccuracy < MIN_ACCURACY_PERCENT ? (
            <div className="flex items-start gap-2 bg-red-100 text-red-700 rounded p-2 text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div><p className="font-medium">Akurasi di bawah minimum ({MIN_ACCURACY_PERCENT}%)</p><p>{accuracyResult.recommendation}</p></div>
            </div>
          ) : (
            <div className="flex items-start gap-2 bg-emerald-100 text-emerald-700 rounded p-2 text-xs">
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div><p className="font-medium">Akurasi memenuhi standar minimum ({MIN_ACCURACY_PERCENT}%)</p><p>{accuracyResult.recommendation}</p></div>
            </div>
          )}
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Live Test (Uji Langsung)</p>
              <Button variant="outline" size="sm" onClick={() => { setLiveTestMode(!liveTestMode); setLiveTestResult(null) }}>{liveTestMode ? 'Tutup' : 'Buka Kamera Test'}</Button>
            </div>
            {liveTestMode && (
              <div className="space-y-3">
                {!modelsLoaded && <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2"><RefreshCw className="h-3 w-3 animate-spin" />Memuat model AI...</div>}
                <div className="rounded-lg overflow-hidden border relative">
                  <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: liveCameraFacing, width: 320, height: 240 }} style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                  <Button variant="secondary" size="icon" onClick={() => setLiveCameraFacing(f => f === 'user' ? 'environment' : 'user')} className="absolute bottom-2 right-2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 text-white">
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <Button onClick={handleLiveTest} disabled={liveTesting || !modelsLoaded} className="w-full bg-blue-600 hover:bg-blue-700">
                  {liveTesting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <ScanLine className="h-4 w-4 mr-2" />}{liveTesting ? 'Menguji...' : 'Test Sekarang'}
                </Button>
                {liveTestResult && (
                  <div className={`rounded-lg border p-3 ${liveTestResult.matched ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="text-center mb-2">
                      <p className={`text-2xl font-bold ${liveTestResult.matched ? 'text-emerald-600' : 'text-red-600'}`}>{liveTestResult.matched ? 'Wajah Dikenali!' : 'Wajah Tidak Cocok'}</p>
                      <p className={`text-lg font-semibold ${getAccuracyColor(liveTestResult.bestAccuracy)}`}>Akurasi: {liveTestResult.bestAccuracy.toFixed(1)}%</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SiswaDashboard() {
  const { user } = useAuthStore()
  const { setActivePage } = useAppStore()
  const schoolConfig = useSchoolConfig()
  const { data: studentsData, loading: studentsLoading } = useApiFetch<{ students: Student[] }>(`/api/students?search=`)
  const me = studentsData?.students?.find(s => s.user?.id === user?.id) || studentsData?.students?.find(s => s.nisn === user?.username)

  const today = new Date().toISOString().split('T')[0]
  const { data: attData } = useApiFetch<{ attendances: AttendanceRecord[] }>(me ? `/api/attendance?studentId=${me.id}` : null, [me?.id])
  const { data: violData } = useApiFetch<{ violations: ViolationRecord[] }>(me ? `/api/violations?studentId=${me.id}` : null, [me?.id])
  const { data: goodData } = useApiFetch<{ goodDeeds: GoodDeedRecord[] }>(me ? `/api/good-deeds?studentId=${me.id}` : null, [me?.id])

  const [qrDataUrl, setQrDataUrl] = useState('')
  const [showIdCard, setShowIdCard] = useState(true)

  useEffect(() => {
    if (me?.qrCode) {
      const qrStr = generateQRString(me.nisn)
      generateQRCode(qrStr).then(url => setQrDataUrl(url))
    }
  }, [me?.qrCode, me?.nisn])

  const bl = me ? getBehaviorLevel(me.totalViolationPoints) : null
  const attendances = attData?.attendances || []
  const todayAtt = attendances.find(a => a.date?.toString().startsWith(today))

  const totalDays = attendances.length
  const hadirCount = attendances.filter(a => a.status === 'HADIR').length
  const terlambatCount = attendances.filter(a => a.status === 'TERLAMBAT').length
  const izinCount = attendances.filter(a => a.status === 'IZIN').length
  const sakitCount = attendances.filter(a => a.status === 'SAKIT').length
  const alphaCount = attendances.filter(a => a.status === 'ALPHA').length
  const attendanceRate = totalDays > 0 ? Math.round(((hadirCount + terlambatCount) / totalDays) * 100) : 0
  const punctualityRate = totalDays > 0 ? Math.round((hadirCount / Math.max(1, hadirCount + terlambatCount)) * 100) : 100

  const handleDownloadIdCard = async (format: 'png' | 'pdf') => {
    const cardEl = document.getElementById('student-id-card')
    if (!cardEl) return
    try {
      if (format === 'pdf') {
        const printWindow = window.open('', '_blank')
        if (!printWindow) { toast.error('Gagal membuka jendela cetak'); return }
        printWindow.document.write(`
          <html><head><title>ID Card - ${me?.name}</title>
          <style>@page { size: landscape; margin: 0; } body { display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; } @media print { body { background: white; } }</style></head>
          <body>${cardEl.outerHTML}</body></html>`)
        printWindow.document.close()
        setTimeout(() => { printWindow.print() }, 500)
        toast.success('Kartu siswa siap dicetak ke PDF (landscape)')
      } else {
        const targetWidth = 1016
        const targetHeight = Math.round(targetWidth / 1.586)
        const canvas = await html2canvas(cardEl, { scale: 3, useCORS: true, backgroundColor: '#ffffff', width: cardEl.offsetWidth, height: cardEl.offsetHeight })
        const finalCanvas = document.createElement('canvas')
        finalCanvas.width = targetWidth * 2
        finalCanvas.height = targetHeight * 2
        const ctx = finalCanvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)
          const scale = Math.min(finalCanvas.width / canvas.width, finalCanvas.height / canvas.height)
          const x = (finalCanvas.width - canvas.width * scale) / 2
          const y = (finalCanvas.height - canvas.height * scale) / 2
          ctx.drawImage(canvas, x, y, canvas.width * scale, canvas.height * scale)
        }
        const link = document.createElement('a')
        link.download = `ID-Card-${me?.nisn || 'student'}.png`
        link.href = (finalCanvas.getContext('2d') ? finalCanvas : canvas).toDataURL('image/png')
        link.click()
        toast.success('Kartu siswa berhasil diunduh sebagai PNG')
      }
    } catch (err: any) { toast.error('Gagal mengunduh kartu siswa') }
  }

  const attByDate = attendances.slice(0, 14).map(a => ({ tanggal: (a.date || '').toString().slice(5, 10), status: a.status === 'HADIR' ? 1 : a.status === 'TERLAMBAT' ? 0.5 : 0 }))

  const statusDist = [
    { name: 'Hadir', value: hadirCount, color: '#10b981' },
    { name: 'Terlambat', value: terlambatCount, color: '#f59e0b' },
    { name: 'Izin', value: izinCount, color: '#3b82f6' },
    { name: 'Sakit', value: sakitCount, color: '#8b5cf6' },
    { name: 'Alpha', value: alphaCount, color: '#ef4444' },
  ].filter(d => d.value > 0)

  const violBreakdown = (violData?.violations || []).reduce<Record<string, number>>((acc, v) => { const name = v.category?.name || 'Lainnya'; acc[name] = (acc[name] || 0) + v.points; return acc }, {})
  const goodBreakdown = (goodData?.goodDeeds || []).reduce<Record<string, number>>((acc, g) => { const name = g.category?.name || 'Lainnya'; acc[name] = (acc[name] || 0) + g.points; return acc }, {})

  const themeColor = schoolConfig.theme_color || '#10b981'

  if (studentsLoading) return <PageSkeleton />
  if (!me) return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Dashboard Siswa</h2>
      <Card><CardContent className="p-8 text-center">
        <User className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-muted-foreground">Data siswa tidak ditemukan</p>
        <p className="text-xs text-gray-400 mt-2">Hubungi admin untuk menghubungkan akun dengan data siswa.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => setActivePage('id-card')}>
          <CreditCard className="h-4 w-4 mr-1" /> Coba buka ID Card
        </Button>
      </CardContent></Card>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Dashboard Siswa</h2>
          <p className="text-sm text-muted-foreground">Selamat datang, {me.name}!</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setActivePage('id-card')}><CreditCard className="h-4 w-4 mr-1" /> ID Card Lengkap</Button>
          <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => setShowIdCard(!showIdCard)}>
            {showIdCard ? <Eye className="h-4 w-4 mr-1" /> : <QrCode className="h-4 w-4 mr-1" />}{showIdCard ? 'Tutup Kartu' : 'Buka Kartu'}
          </Button>
        </div>
      </div>

            {showIdCard && (
        <div className="space-y-3">
          <div className="flex justify-center">
            <div id="student-id-card-dash" className="rounded-2xl overflow-hidden shadow-xl border-2 w-full max-w-sm sm:max-w-md mx-auto" style={{ borderColor: themeColor + '40' }}>
              <div className="relative px-4 py-3 text-white overflow-hidden" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}dd, ${themeColor}99)` }}>
                <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
                <div className="relative flex items-center gap-2 mb-1">
                  {schoolConfig.school_logo ? <img src={schoolConfig.school_logo} alt="Logo" className="h-8 w-8 rounded-full bg-white p-0.5 object-contain shadow-md" /> : <div className="h-8 w-8 rounded-full bg-white/25 backdrop-blur flex items-center justify-center shadow-md"><GraduationCap className="h-4 w-4 text-white" /></div>}
                  <div className="text-left min-w-0"><p className="font-bold text-sm leading-tight drop-shadow-sm truncate">{schoolConfig.school_name}</p><p className="text-[10px] opacity-90 leading-tight truncate">{schoolConfig.school_address}</p></div>
                </div>
                <p className="text-center text-[11px] font-semibold tracking-wider opacity-80">KARTU IDENTITAS SISWA</p>
              </div>
              <div className="bg-white p-4">
                <div className="flex flex-row gap-3 items-start">
                  <div className="shrink-0">
                    <div className="w-[60px] h-[76px] rounded-lg border-2 overflow-hidden shadow-sm" style={{ borderColor: themeColor + '30' }}>
                      {me.photoBase64 || me.photoUrl ? <img src={me.photoBase64 || me.photoUrl} alt="Foto" className="w-full h-full object-cover" /> : <div className="w-full h-full bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center"><User className="h-6 w-6 text-gray-300" /></div>}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="font-bold text-gray-900 text-sm leading-tight truncate">{me.name}</p>
                    <div className="text-xs text-gray-700 space-y-0.5">
                      <p className="flex items-center gap-1"><CreditCard className="h-3 w-3 text-gray-400 shrink-0" /> NISN: <span className="font-semibold">{me.nisn}</span></p>
                      <p className="flex items-center gap-1"><GraduationCap className="h-3 w-3 text-gray-400 shrink-0" /> Kelas: <span className="font-semibold">{me.class?.name || '-'}</span></p>
                      <p className="flex items-center gap-1"><BookOpen className="h-3 w-3 text-gray-400 shrink-0" /> Status: <Badge className={`text-[10px] px-1.5 py-0 ${me.status === 'AKTIF' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{me.status || 'AKTIF'}</Badge></p>
                      {(() => { const lv = me.class?.level || ''; const et = ['VII','VIII','IX'].includes(lv) ? 'SMP' : ['X','XI','XII'].includes(lv) ? 'SMA' : lv; const ay = me.class?.academicYear?.name || ''; return et ? <p className="flex items-center gap-1"><Calendar className="h-3 w-3 text-gray-400 shrink-0" /> Tingkat: <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-800">{et}{ay ? ` / ${ay}` : ''}</Badge></p> : null })()}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-center">
                    <div className="w-[52px] h-[52px] sm:w-[72px] sm:h-[72px] rounded-lg border p-0.5 shadow-sm" style={{ borderColor: themeColor + '30' }}>{qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-full h-full" /> : <div className="w-full h-full bg-gray-50 rounded animate-pulse" />}</div>
                    <p className="text-[9px] text-gray-400 mt-0.5">Scan presensi</p>
                  </div>
                </div>
              </div>
              <div className="px-4 py-1.5 border-t flex items-center justify-between" style={{ background: `linear-gradient(to right, ${themeColor}08, ${themeColor}15, ${themeColor}08)` }}>
                <p className="text-[9px] text-gray-400">Dicetak: {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                <p className="text-[9px] text-gray-400 font-medium truncate ml-2">{schoolConfig.school_name}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-3">
            <Button size="sm" variant="outline" style={{ borderColor: themeColor, color: themeColor }} onClick={() => setActivePage('id-card')}><Download className="h-4 w-4 mr-1" /> PDF</Button>
            <Button size="sm" className="text-white" style={{ backgroundColor: themeColor }} onClick={() => setActivePage('id-card')}><Image className="h-4 w-4 mr-1" /> SVG</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4" style={{ borderLeftColor: '#10b981' }}><CardContent className="p-3"><p className="text-xs text-gray-500">Tingkat Kehadiran</p><p className="text-2xl font-bold text-emerald-600">{attendanceRate}%</p><Progress value={attendanceRate} className="h-1.5 mt-1" /></CardContent></Card>
        <Card className="border-l-4" style={{ borderLeftColor: '#3b82f6' }}><CardContent className="p-3"><p className="text-xs text-gray-500">Total Hari Tercatat</p><p className="text-2xl font-bold text-blue-600">{totalDays}</p><p className="text-xs text-gray-400">Hadir: {hadirCount} hari</p></CardContent></Card>
        <Card className="border-l-4" style={{ borderLeftColor: '#f59e0b' }}><CardContent className="p-3"><p className="text-xs text-gray-500">Ketepatan Waktu</p><p className="text-2xl font-bold text-amber-600">{punctualityRate}%</p><p className="text-xs text-gray-400">Terlambat: {terlambatCount}x</p></CardContent></Card>
        <Card className="border-l-4" style={{ borderLeftColor: bl ? (me.totalViolationPoints >= 100 ? '#ef4444' : me.totalViolationPoints >= 50 ? '#f59e0b' : '#8b5cf6') : '#6b7280' }}><CardContent className="p-3"><p className="text-xs text-gray-500">Poin Pelanggaran</p><p className="text-2xl font-bold" style={{ color: bl ? (me.totalViolationPoints >= 100 ? '#ef4444' : me.totalViolationPoints >= 50 ? '#f59e0b' : '#8b5cf6') : '#6b7280' }}>{me.totalViolationPoints}</p>{bl && <Badge className={`${bl.color} text-[10px] mt-0.5`}>{bl.label}</Badge>}</CardContent></Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="text-center"><CardHeader className="pb-2"><CardTitle className="text-base">Kode QR Presensi</CardTitle></CardHeader><CardContent>{qrDataUrl ? <img src={qrDataUrl} alt="QR Code" className="mx-auto w-40 h-40" /> : <Skeleton className="mx-auto w-40 h-40" />}<p className="text-sm text-muted-foreground mt-2">Tunjukkan kode ini untuk presensi</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Kehadiran Hari Ini</CardTitle></CardHeader><CardContent>{todayAtt ? (
          <div className="space-y-3"><div className="flex items-center justify-center"><Badge className={`${getStatusColor(todayAtt.status as any)} text-lg px-4 py-1`}>{todayAtt.status}</Badge></div><div className="grid grid-cols-2 gap-4 text-center"><div className="bg-green-50 rounded-lg p-3"><Clock className="h-5 w-5 text-green-500 mx-auto mb-1" /><p className="text-xs text-muted-foreground">Masuk</p><p className="font-bold text-green-700">{todayAtt.checkInTime ? formatTimeWIB(todayAtt.checkInTime) : '-'}</p></div><div className="bg-blue-50 rounded-lg p-3"><Clock className="h-5 w-5 text-blue-500 mx-auto mb-1" /><p className="text-xs text-muted-foreground">Keluar</p><p className="font-bold text-blue-700">{todayAtt.checkOutTime ? formatTimeWIB(todayAtt.checkOutTime) : '-'}</p></div></div><div className="flex justify-center gap-3 text-xs text-muted-foreground"><span>Wajah: {todayAtt.verifiedByFace ? '✓' : '✗'}</span><span>GPS: {todayAtt.geoVerified ? '✓' : '✗'}</span><span>Metode: {todayAtt.checkInMethod || '-'}</span></div></div>
        ) : <div className="text-center py-6"><Clock className="h-10 w-10 text-gray-300 mx-auto mb-2" /><p className="text-muted-foreground">Belum ada data kehadiran hari ini</p></div>}</CardContent></Card>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="border-l-4 border-red-400"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Poin Pelanggaran</p><p className="text-3xl font-bold text-red-600">{me.totalViolationPoints}</p></div><AlertTriangle className="h-8 w-8 text-red-200" /></div>{bl && <Badge className={`${bl.color} mt-2`}>{bl.label} - {bl.handler}</Badge>}</CardContent></Card>
        <Card className="border-l-4 border-yellow-400"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">Poin Kebaikan</p><p className="text-3xl font-bold text-yellow-600">{me.totalGoodPoints}</p></div><Star className="h-8 w-8 text-yellow-200" /></div></CardContent></Card>
      </div>

      <Card><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">Statistik Pribadi</CardTitle><Button variant="ghost" size="sm" className="h-10 text-xs" onClick={() => { const text = `Statistik ${me.name}\nTingkat Kehadiran: ${attendanceRate}%\nTotal Hari: ${totalDays}\nHadir: ${hadirCount}, Terlambat: ${terlambatCount}, Izin: ${izinCount}, Sakit: ${sakitCount}, Alpha: ${alphaCount}\nPelanggaran: ${me.totalViolationPoints} poin\nKebaikan: ${me.totalGoodPoints} poin`; navigator.clipboard.writeText(text); toast.success('Data disalin ke clipboard') }}><Copy className="h-3 w-3 mr-1" /> Salin</Button></div></CardHeader><CardContent className="overflow-hidden">
        {statusDist.length > 0 && <div className="mb-4"><p className="text-xs text-muted-foreground mb-2">Distribusi Status Kehadiran</p><ResponsiveContainer width="100%" height={180}><PieChart><Pie data={statusDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{statusDist.map((d, i) => <Cell key={i} fill={d.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>}
        {attByDate.length > 0 && <div className="mb-4"><p className="text-xs text-muted-foreground mb-2">Tren Kehadiran (14 hari terakhir)</p><ResponsiveContainer width="100%" height={150}><BarChart data={attByDate}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="tanggal" tick={{ fontSize: 9 }} /><YAxis domain={[0, 1]} tick={false} /><Tooltip /><Bar dataKey="status" fill={themeColor} name="Kehadiran" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>}
        <div className="grid grid-cols-2 gap-3">
          {Object.keys(violBreakdown).length > 0 && <div><p className="text-xs font-medium text-red-600 mb-1">Pelanggaran</p>{Object.entries(violBreakdown).map(([k, v]) => <div key={k} className="flex justify-between text-xs py-0.5"><span>{k}</span><span className="font-medium text-red-600">{v}</span></div>)}</div>}
          {Object.keys(goodBreakdown).length > 0 && <div><p className="text-xs font-medium text-green-600 mb-1">Kebaikan</p>{Object.entries(goodBreakdown).map(([k, v]) => <div key={k} className="flex justify-between text-xs py-0.5"><span>{k}</span><span className="font-medium text-green-600">{v}</span></div>)}</div>}
        </div>
      </CardContent></Card>

      <div className="clear-both">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Riwayat Kehadiran</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-56 overflow-y-auto">{attendances.slice(0, 14).map(a => (
          <div key={a.id} className="flex items-center justify-between py-2 px-4 border-b last:border-0">
            <div><span className="text-sm font-medium">{formatDateShort(a.date)}</span><div className="flex gap-2 text-xs text-gray-500">{a.checkInTime && <span>Masuk: {formatTimeWIB(a.checkInTime)}</span>}{a.checkOutTime && <span>Keluar: {formatTimeWIB(a.checkOutTime)}</span>}</div></div>
            <Badge className={getStatusColor(a.status as any)}>{a.status}</Badge>
          </div>
        ))}{attendances.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Belum ada data kehadiran</p>}</div></CardContent></Card>
      </div>

      <div className="clear-both">
        {me.faceCaptureEnabled !== false && (
          <Card><CardHeader className="pb-2"><div className="flex items-center justify-between"><CardTitle className="text-base">Referensi Wajah</CardTitle><div className="flex items-center gap-2"><Badge variant="outline" className="text-xs">5 capture = optimal</Badge><Badge className="text-[10px] bg-green-100 text-green-800">Aktif</Badge></div></div></CardHeader><CardContent><FaceCaptureSection studentId={me.id} studentName={me.name} /></CardContent></Card>
        )}
        {me.faceCaptureEnabled === false && (
          <Card><CardHeader className="pb-2"><CardTitle className="text-base text-muted-foreground">Referensi Wajah</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground text-center py-4">Fitur wajah dinonaktifkan oleh admin.</p></CardContent></Card>
        )}
      </div>
    </div>
  )
}
