'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Camera, CameraOff, CheckCircle, AlertCircle, RefreshCw, Shield, ScanLine, X, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import Webcam from 'react-webcam'
import { Student, AccuracyResult, LiveTestResult } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { PageSkeleton } from './page-skeleton'
import { loadFaceApiModels, calculateFaceAccuracy, performLiveTest, FACE_MATCH_THRESHOLD, MIN_ACCURACY_PERCENT } from './face-utils'

export function FaceCapturePage() {
  const { user } = useAuthStore()
  const { data: studentsData, loading } = useApiFetch<{ students: Student[] }>('/api/students')
  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [showCamera, setShowCamera] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [existingRefs, setExistingRefs] = useState<any[]>([])
  const webcamRef = useRef<Webcam>(null)
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [showAccuracyPanel, setShowAccuracyPanel] = useState(false)
  const [accuracyResult, setAccuracyResult] = useState<AccuracyResult | null>(null)
  const [testingAccuracy, setTestingAccuracy] = useState(false)
  const [liveTestMode, setLiveTestMode] = useState(false)
  const [liveTestResult, setLiveTestResult] = useState<LiveTestResult | null>(null)
  const [liveTesting, setLiveTesting] = useState(false)
  const liveWebcamRef = useRef<Webcam>(null)
  const [liveModelsLoaded, setLiveModelsLoaded] = useState(false)
  const [cameraFacing, setCameraFacing] = useState<'user' | 'environment'>('user')
  const [liveCameraFacing, setLiveCameraFacing] = useState<'user' | 'environment'>('user')

  const students = studentsData?.students || []
  const filtered = students.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.nisn.includes(search)
  )

  const descriptorsWithAI = existingRefs.filter((ref: any) => ref.faceDescriptor).length
  const canTestAccuracy = descriptorsWithAI >= 2

  useEffect(() => {
    setLoadingModels(true)
    loadFaceApiModels().then(ok => {
      setModelsLoaded(ok)
      setLoadingModels(false)
    })
  }, [])

  useEffect(() => {
    if (liveTestMode && !liveModelsLoaded) {
      loadFaceApiModels().then(ok => setLiveModelsLoaded(ok))
    }
  }, [liveTestMode, liveModelsLoaded])

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

  const loadRefs = async (studentId: string) => {
    try {
      const res = await fetch(`/api/face-references?studentId=${studentId}`)
      const data = await res.json()
      setExistingRefs(data.faceReferences || [])
      setAccuracyResult(null)
      setLiveTestResult(null)
    } catch {}
  }

  const handleSelectStudent = (s: Student) => {
    setSelectedStudent(s)
    setShowCamera(false)
    setFaceDetected(false)
    setShowAccuracyPanel(false)
    setAccuracyResult(null)
    setLiveTestResult(null)
    loadRefs(s.id)
  }

  const handleCapture = async () => {
    if (!webcamRef.current || !selectedStudent) return
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
            console.error('Face detection error during capture:', e)
            toast.warning('Gagal mendeteksi wajah. Foto disimpan tanpa descriptor.')
          }
        }
      }

      const res = await fetch('/api/face-references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id,
          photoBase64: photo,
          captureIndex: existingRefs.length + 1,
          captureMethod: 'WEBCAM',
          capturedBy: user?.id,
          faceDescriptor,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Gagal menyimpan')
      } else {
        toast.success(data.message || 'Foto wajah berhasil disimpan')
        if (data.warning) toast.warning(data.warning)
        if (faceDescriptor) {
          toast.info('Descriptor wajah berhasil diekstrak untuk verifikasi cepat')
        }
        loadRefs(selectedStudent.id)
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
      setAccuracyResult(null)
    } catch (err: any) {
      toast.error('Gagal menghapus')
    }
  }

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

  const handleTestAccuracy = async () => {
    setTestingAccuracy(true)
    setLiveTestResult(null)
    try {
      const descriptors = getDescriptors()
      if (descriptors.length < 2) {
        toast.error('Minimal 2 foto dengan descriptor AI diperlukan')
        return
      }
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
    } finally {
      setTestingAccuracy(false)
    }
  }

  const handleLiveTest = async () => {
    if (!liveWebcamRef.current) return
    const video = liveWebcamRef.current.video
    if (!video) return
    setLiveTesting(true)
    try {
      const faceapi = await import('@vladmandic/face-api')
      const detection = await faceapi.detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor()
      if (!detection) {
        toast.error('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas.')
        return
      }
      const liveDescriptor = Array.from(detection.descriptor) as number[]
      const storedDescriptors = getDescriptors()
      if (storedDescriptors.length < 1) {
        toast.error('Tidak ada descriptor tersimpan untuk perbandingan')
        return
      }
      const result = performLiveTest(liveDescriptor, storedDescriptors)
      setLiveTestResult(result)
      if (result.matched) {
        toast.success(`Wajah dikenali! Akurasi: ${result.bestAccuracy.toFixed(1)}%`)
      } else {
        toast.error(`Wajah tidak cocok. Akurasi terbaik: ${result.bestAccuracy.toFixed(1)}%`)
      }
    } catch (e) {
      toast.error('Gagal melakukan live test')
    } finally {
      setLiveTesting(false)
    }
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

  if (loading) return <PageSkeleton />

  const captureContent = selectedStudent ? (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Progress value={(existingRefs.length / 5) * 100} className="flex-1 h-2" />
        <span className="text-xs text-muted-foreground">{existingRefs.length}/5</span>
      </div>

      {descriptorsWithAI > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs bg-green-50 border-green-200 text-green-700">
            <CheckCircle className="h-3 w-3 mr-1" /> {descriptorsWithAI} AI Descriptor
          </Badge>
          {existingRefs.length >= 3 && descriptorsWithAI >= 2 && (
            <Badge variant="outline" className="text-xs bg-emerald-50 border-emerald-200 text-emerald-700">
              Siap untuk presensi wajah
            </Badge>
          )}
          {canTestAccuracy && !showAccuracyPanel && (
            <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700 cursor-pointer hover:bg-blue-100" onClick={() => setShowAccuracyPanel(true)}>
              <Shield className="h-3 w-3 mr-1" /> Test Akurasi
            </Badge>
          )}
        </div>
      )}

      {existingRefs.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            Foto Wajah Tersimpan
            <Badge variant="outline" className="text-xs">{existingRefs.length}/5</Badge>
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            {existingRefs.map((ref: any, idx: number) => (
              <div key={ref.id} className="relative group">
                <div className="aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all group-hover:border-emerald-300">
                  <img src={ref.photoBase64} alt={`Capture ${ref.captureIndex}`} className="w-full h-full object-cover" />
                  <div className={`absolute bottom-0 left-0 right-0 py-1 text-center text-xs font-medium text-white ${ref.faceDescriptor ? 'bg-emerald-600' : 'bg-gray-500'}`}>
                    {ref.faceDescriptor ? '✓ AI' : 'Foto'}
                  </div>
                </div>
                <p className="text-xs text-center mt-1 text-muted-foreground">
                  #{ref.captureIndex}
                  {idx === 0 && <span className="text-emerald-600 ml-1">(depan)</span>}
                  {idx === 1 && <span className="text-blue-600 ml-1">(kiri)</span>}
                  {idx === 2 && <span className="text-amber-600 ml-1">(kanan)</span>}
                  {idx === 3 && <span className="text-purple-600 ml-1">(atas)</span>}
                  {idx === 4 && <span className="text-rose-600 ml-1">(bawah)</span>}
                </p>
                <button onClick={() => handleDelete(ref.id)} className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:scale-110 shadow-lg">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {existingRefs.length < 5 && (
        <>
          {!showCamera ? (
            <Button onClick={() => setShowCamera(true)} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-sm">
              <Camera className="h-5 w-5 mr-2" /> Buka Kamera ({5 - existingRefs.length} tersisa)
            </Button>
          ) : (
            <div className="space-y-3">
              {!modelsLoaded && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Memuat model AI...
                </div>
              )}
              <div className="relative rounded-xl overflow-hidden border-2 border-emerald-200 bg-black" style={{ aspectRatio: '4/3' }}>
                <Webcam ref={webcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: cameraFacing, width: 640, height: 480 }} className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-48 h-56 sm:w-56 sm:h-64 rounded-2xl border-2 transition-all duration-300 ${faceDetected ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/50 bg-white/5'}`} />
                  <p className="absolute bottom-8 text-xs text-white/70 bg-black/50 px-3 py-1 rounded-full">Posisikan wajah di dalam bingkai</p>
                </div>
                {modelsLoaded && (
                  <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-medium shadow-lg z-10 ${faceDetected ? 'bg-emerald-500 text-white' : 'bg-gray-700/80 text-gray-200'}`}>
                    <div className="flex items-center gap-1.5">
                      <div className={`h-2 w-2 rounded-full ${faceDetected ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
                      {faceDetected ? 'Wajah Terdeteksi' : 'Mencari wajah...'}
                    </div>
                  </div>
                )}
                <div className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full z-10">Capture {existingRefs.length + 1}/5</div>
                {capturing && <div className="absolute inset-0 bg-white animate-ping opacity-30 pointer-events-none z-20" />}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button onClick={handleCapture} disabled={capturing} className="h-12 bg-emerald-600 hover:bg-emerald-700 text-sm col-span-1">
                  {capturing ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-5 w-5 mr-2" />}
                  {capturing ? 'Menyimpan...' : 'Ambil'}
                </Button>
                <Button variant="outline" onClick={() => setCameraFacing(f => f === 'user' ? 'environment' : 'user')} className="h-12 text-sm" title="Ganti kamera">
                  <RefreshCw className="h-5 w-5" />
                </Button>
                <Button variant="outline" onClick={() => { setShowCamera(false); setFaceDetected(false) }} className="h-12 text-sm">
                  <CameraOff className="h-4 w-4 mr-2" /> Tutup
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground">Ambil dari berbagai sudut: depan, kiri, kanan, atas, bawah</p>
            </div>
          )}
        </>
      )}

      {existingRefs.length >= 5 && !showAccuracyPanel && (
        <div className="text-center py-4 bg-emerald-50 rounded-lg space-y-2">
          <CheckCircle className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
          <p className="text-sm text-emerald-700 font-medium">Foto wajah sudah cukup (5/5)</p>
          {canTestAccuracy && (
            <Button variant="outline" className="border-emerald-300 text-emerald-700" onClick={() => setShowAccuracyPanel(true)}>
              <Shield className="h-4 w-4 mr-2" /> Uji Akurasi Sekarang
            </Button>
          )}
        </div>
      )}

      {showAccuracyPanel && canTestAccuracy && (
        <div className="border rounded-lg p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold flex items-center gap-2"><Shield className="h-4 w-4 text-emerald-600" /> Pengujian Akurasi Wajah</h3>
            <Button variant="ghost" size="sm" onClick={() => { setShowAccuracyPanel(false); setAccuracyResult(null); setLiveTestResult(null) }}><X className="h-4 w-4" /></Button>
          </div>
          <Button onClick={handleTestAccuracy} disabled={testingAccuracy} className="w-full bg-emerald-600 hover:bg-emerald-700">
            {testingAccuracy ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
            {testingAccuracy ? 'Menguji Konsistensi...' : 'Test Konsistensi Referensi'}
          </Button>

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
                <div className="bg-white/60 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Min</p>
                  <p className={`text-sm font-bold ${getAccuracyColor(accuracyResult.minAccuracy)}`}>{accuracyResult.minAccuracy.toFixed(1)}%</p>
                </div>
                <div className="bg-white/60 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Rata-rata</p>
                  <p className={`text-sm font-bold ${getAccuracyColor(accuracyResult.overallAccuracy)}`}>{accuracyResult.overallAccuracy.toFixed(1)}%</p>
                </div>
                <div className="bg-white/60 rounded p-2">
                  <p className="text-[10px] text-muted-foreground">Max</p>
                  <p className={`text-sm font-bold ${getAccuracyColor(accuracyResult.maxAccuracy)}`}>{accuracyResult.maxAccuracy.toFixed(1)}%</p>
                </div>
              </div>
              {accuracyResult.pairwiseResults.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1">Detail Perbandingan:</p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {accuracyResult.pairwiseResults.map((pr, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs bg-white/60 rounded px-2 py-1">
                        <span>Foto #{pr.i + 1} vs #{pr.j + 1}</span>
                        <span className={`font-medium ${getAccuracyColor(pr.accuracy)}`}>{pr.accuracy.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className={`flex items-start gap-2 rounded p-2 text-xs ${accuracyResult.overallAccuracy < MIN_ACCURACY_PERCENT ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {accuracyResult.overallAccuracy < MIN_ACCURACY_PERCENT ? <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                <div>
                  <p className="font-medium">{accuracyResult.overallAccuracy < MIN_ACCURACY_PERCENT ? `Akurasi di bawah minimum (${MIN_ACCURACY_PERCENT}%)` : 'Akurasi memenuhi standar'}</p>
                  <p>{accuracyResult.recommendation}</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium">Live Test</p>
                  <Button variant="outline" size="sm" onClick={() => { setLiveTestMode(!liveTestMode); setLiveTestResult(null) }}>
                    {liveTestMode ? 'Tutup Kamera' : 'Buka Kamera Test'}
                  </Button>
                </div>
                {liveTestMode && (
                  <div className="space-y-3">
                    {!liveModelsLoaded && (
                      <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                        <RefreshCw className="h-3 w-3 animate-spin" /> Memuat model AI...
                      </div>
                    )}
                    <div className="rounded-lg overflow-hidden border relative">
                      <Webcam ref={liveWebcamRef} audio={false} screenshotFormat="image/jpeg" videoConstraints={{ facingMode: liveCameraFacing, width: 320, height: 240 }} style={{ width: '100%', maxHeight: 200, objectFit: 'cover' }} />
                      <Button variant="secondary" size="icon" onClick={() => setLiveCameraFacing(f => f === 'user' ? 'environment' : 'user')} className="absolute bottom-2 right-2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 text-white">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button onClick={handleLiveTest} disabled={liveTesting || !liveModelsLoaded} className="w-full bg-blue-600 hover:bg-blue-700">
                      {liveTesting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <ScanLine className="h-4 w-4 mr-2" />}
                      {liveTesting ? 'Menguji...' : 'Test Sekarang'}
                    </Button>
                    {liveTestResult && (
                      <div className={`rounded-lg border p-3 ${liveTestResult.matched ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                        <p className={`text-lg font-bold text-center ${liveTestResult.matched ? 'text-emerald-600' : 'text-red-600'}`}>
                          {liveTestResult.matched ? '✓ Wajah Dikenali!' : '✗ Wajah Tidak Cocok'}
                        </p>
                        <p className={`text-center font-semibold ${getAccuracyColor(liveTestResult.bestAccuracy)}`}>Akurasi: {liveTestResult.bestAccuracy.toFixed(1)}%</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  ) : null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Capture Wajah Siswa</h2>
          <p className="text-sm text-muted-foreground">Kelola referensi wajah untuk pengenalan otomatis saat presensi</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {loadingModels && (
            <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              <RefreshCw className="h-3 w-3 animate-spin" /> Memuat model AI...
            </span>
          )}
          {modelsLoaded && (
            <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full">
              <CheckCircle className="h-3 w-3" /> Model AI siap
            </span>
          )}
          {!loadingModels && !modelsLoaded && (
            <span className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-full">
              <AlertCircle className="h-3 w-3" /> Model AI gagal dimuat
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-emerald-600">5</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">Capture Optimal</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">3</p>
          <p className="text-[11px] text-blue-700 mt-0.5">Min. Presensi</p>
        </div>
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-purple-600">2</p>
          <p className="text-[11px] text-purple-700 mt-0.5">Test Akurasi</p>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{MIN_ACCURACY_PERCENT}%</p>
          <p className="text-[11px] text-amber-700 mt-0.5">Min. Akurasi</p>
        </div>
      </div>

      {/* Desktop: side-by-side layout */}
      <div className="hidden lg:grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Pilih Siswa</CardTitle></CardHeader>
          <CardContent>
            <Input placeholder="Cari nama/NISN..." value={search} onChange={e => setSearch(e.target.value)} className="mb-3" />
            <ScrollArea className="max-h-[500px]">
              {filtered.map(s => (
                <div key={s.id} className={`flex items-center gap-2 py-2 px-2 border-b last:border-0 cursor-pointer rounded hover:bg-gray-50 ${selectedStudent?.id === s.id ? 'bg-emerald-50 border-emerald-200' : ''}`}
                  onClick={() => handleSelectStudent(s)}>
                  <Avatar className="h-8 w-8">
                    {(s.photoBase64 || s.photoUrl) ? <img src={s.photoBase64 || s.photoUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <AvatarFallback className="text-xs">{s.name.charAt(0)}</AvatarFallback>}
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.class?.name} • {s.nisn}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">{s._count?.faceReferences || 0}/5</Badge>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Tidak ada siswa ditemukan</p>}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{selectedStudent ? `Capture: ${selectedStudent.name}` : 'Pilih siswa untuk mulai'}</CardTitle>
              {selectedStudent && canTestAccuracy && (
                <Button variant={showAccuracyPanel ? 'default' : 'outline'} size="sm" onClick={() => setShowAccuracyPanel(!showAccuracyPanel)} style={showAccuracyPanel ? { backgroundColor: '#10b981' } : {}}>
                  <Shield className="h-4 w-4 mr-1" /> {showAccuracyPanel ? 'Tutup Test' : 'Test Akurasi'}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedStudent ? (
              <div className="text-center py-12">
                <Camera className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-muted-foreground">Pilih siswa dari daftar untuk memulai capture wajah</p>
              </div>
            ) : captureContent}
          </CardContent>
        </Card>
      </div>

      {/* Mobile: student list */}
      <div className="lg:hidden">
        {!selectedStudent ? (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Pilih Siswa</CardTitle></CardHeader>
            <CardContent>
              <Input placeholder="Cari nama/NISN..." value={search} onChange={e => setSearch(e.target.value)} className="mb-3" />
              <ScrollArea className="max-h-[500px]">
                {filtered.map(s => (
                  <div key={s.id} className={`flex items-center gap-2 py-2.5 px-2 border-b last:border-0 cursor-pointer rounded hover:bg-gray-50 active:bg-gray-100 ${selectedStudent?.id === s.id ? 'bg-emerald-50 border-emerald-200' : ''}`}
                    onClick={() => handleSelectStudent(s)}>
                    <Avatar className="h-10 w-10">
                      {(s.photoBase64 || s.photoUrl) ? <img src={s.photoBase64 || s.photoUrl} alt="" className="h-10 w-10 rounded-full object-cover" /> : <AvatarFallback>{s.name.charAt(0)}</AvatarFallback>}
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.class?.name} • {s.nisn}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{s._count?.faceReferences || 0}/5</Badge>
                  </div>
                ))}
                {filtered.length === 0 && <p className="text-center text-muted-foreground py-4 text-sm">Tidak ada siswa ditemukan</p>}
              </ScrollArea>
            </CardContent>
          </Card>
        ) : (
          <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) { setSelectedStudent(null); setShowCamera(false); setFaceDetected(false); setShowAccuracyPanel(false); setAccuracyResult(null); } }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => { setSelectedStudent(null); setShowCamera(false); setFaceDetected(false); setShowAccuracyPanel(false); setAccuracyResult(null); }} className="h-10 w-10 -ml-2">
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <DialogTitle>Capture: {selectedStudent.name}</DialogTitle>
                </div>
              </DialogHeader>
              {captureContent}
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  )
}
