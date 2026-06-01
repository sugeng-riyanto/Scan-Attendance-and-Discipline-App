'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Scanner } from '@yudiel/react-qr-scanner'
import Webcam from 'react-webcam'
import { toast } from 'sonner'
import {
  ScanLine, Camera, UserCheck, AlertCircle, CheckCircle, Clock, MapPin,
  Volume2, RefreshCw, GraduationCap, Eye, X, Wifi, WifiOff,
  Power, PowerOff, ToggleLeft, ToggleRight, Monitor, Zap, Maximize2, Minimize2, Home
} from 'lucide-react'

// ============================================
// PUBLIC SCAN PAGE - No login required
// Real-time face detection with descriptor-based matching
// ============================================

// Face API loader singleton
let scanFaceApiLoaded = false;
let scanFaceApiLoading = false;

async function loadScanFaceApiModels(): Promise<boolean> {
  if (scanFaceApiLoaded) return true;
  if (scanFaceApiLoading) {
    while (scanFaceApiLoading) await new Promise(r => setTimeout(r, 100));
    return scanFaceApiLoaded;
  }
  scanFaceApiLoading = true;
  try {
    const faceapi = await import('@vladmandic/face-api');
    await faceapi.nets.ssdMobilenetv1.loadFromUri('/models');
    await faceapi.nets.faceLandmark68Net.loadFromUri('/models');
    await faceapi.nets.faceRecognitionNet.loadFromUri('/models');
    scanFaceApiLoaded = true;
    return true;
  } catch (e) {
    console.error('Failed to load face-api models for scan page:', e);
    return false;
  } finally {
    scanFaceApiLoading = false;
  }
}

interface ScanResult {
  found: boolean;
  student?: {
    id: string;
    name: string;
    nisn: string;
    className: string;
    photoUrl?: string;
    status?: string;
  };
  action?: 'checkin' | 'checkout';
  isLate?: boolean;
  status?: string;
  message: string;
  welcomeMessage?: string;
  alreadyDone?: boolean;
  canCheckIn?: boolean;
  attendance?: {
    checkInTime?: string;
    checkOutTime?: string;
    status?: string;
  };
  error?: string;
  isAutoDetected?: boolean;
  confidence?: string;
  distance?: string;
}

interface ScanSessionInfo {
  active: boolean;
  defaultMode?: string;
  activatedBy?: string;
  activatedAt?: string;
  shift?: string;
  notes?: string;
  history?: Array<{
    id: string;
    isActive: boolean;
    defaultMode: string;
    activatedBy: string;
    activatedAt: string;
    deactivatedBy?: string;
    deactivatedAt?: string;
    shift?: string;
    notes?: string;
  }>;
}

interface DetectedFace {
  box: { x: number; y: number; width: number; height: number };
  descriptor: Float32Array;
}

function useSchoolConfig() {
  const [config, setConfig] = useState({
    school_name: 'SMP-SMA Nusantara',
    school_address: 'Jl. Pendidikan No. 1, Indonesia',
    school_logo: '',
    theme_color: '#10b981',
    timezone: 'Asia/Jakarta',
    welcome_voice_enabled: 'true',
    welcome_voice_lang: 'id-ID',
    welcome_voice_rate: '1',
  })
  useEffect(() => {
    fetch('/api/school-config')
      .then(r => r.json())
      .then(data => {
        const map: Record<string, string> = {}
        ;(data.configs || []).forEach((c: any) => { map[c.key] = c.value })
        setConfig(prev => ({
          ...prev,
          school_name: map.school_name || prev.school_name,
          school_address: map.school_address || prev.school_address,
          school_logo: map.school_logo || prev.school_logo,
          theme_color: map.theme_color || prev.theme_color,
          timezone: map.timezone || prev.timezone,
          welcome_voice_enabled: map.welcome_voice_enabled || prev.welcome_voice_enabled,
          welcome_voice_lang: map.welcome_voice_lang || prev.welcome_voice_lang,
          welcome_voice_rate: map.welcome_voice_rate || prev.welcome_voice_rate,
        }))
      })
      .catch(() => {})
  }, [])
  return config
}

function useGeolocation() {
  const [location, setLocation] = useState<{ lat: number; lng: number; accuracy: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setError(null)
      },
      (err) => { setError(err.message) },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return { location, error }
}

// Offline queue for autosave
function saveToOfflineQueue(action: string, entity: string, payload: any) {
  try {
    const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]')
    queue.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      action,
      entity,
      payload,
      userId: localStorage.getItem('currentUserId') || null,
      timestamp: Date.now(),
      synced: false,
    })
    localStorage.setItem('offline_queue', JSON.stringify(queue))
  } catch (e) { console.error('Offline save failed:', e) }
}

async function syncOfflineQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]')
    const pending = queue.filter((item: any) => !item.synced)
    if (pending.length === 0) return

    const res = await fetch('/api/offline-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: pending }),
    })
    const data = await res.json()
    if (data.synced > 0) {
      const updatedQueue = queue.map((item: any) => {
        if (pending.includes(item)) item.synced = true
        return item
      })
      localStorage.setItem('offline_queue', JSON.stringify(updatedQueue))
      toast.success(`${data.synced} data berhasil disinkronkan`)
    }
    if (data.failed > 0) {
      toast.error(`${data.failed} data gagal disinkronkan`)
    }
  } catch (e) {
    // Still offline, will retry later
  }
}

export default function PublicScanPage() {
  const config = useSchoolConfig()
  const geo = useGeolocation()
  const [mounted, setMounted] = useState(false)
  const [scanMode, setScanMode] = useState<'qr' | 'face'>('qr')
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [manualNisn, setManualNisn] = useState('')
  const webcamRef = useRef<Webcam>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [currentTime, setCurrentTime] = useState<Date | null>(null)
  const [scanSession, setScanSession] = useState<ScanSessionInfo | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const [showLoginDialog, setShowLoginDialog] = useState(false)
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {})
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {})
    }
  }
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // Face detection state
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [loadingModels, setLoadingModels] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [detectedFaceData, setDetectedFaceData] = useState<DetectedFace | null>(null)
  const [autoDetect, setAutoDetect] = useState(false)
  const [faceBox, setFaceBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Fix hydration: only render time after mount
  useEffect(() => {
    setMounted(true)
    setCurrentTime(new Date())
  }, [])

  // Update clock every second
  useEffect(() => {
    if (!mounted) return
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [mounted])

  // Load face-api models on-demand (only when user switches to face mode)
  useEffect(() => {
    if (scanMode !== 'face' || modelsLoaded || loadingModels) return
    setLoadingModels(true)
    loadScanFaceApiModels().then(ok => {
      setModelsLoaded(ok)
      setLoadingModels(false)
      if (!ok) {
        console.error('Failed to load face-api models')
      }
    })
  }, [scanMode])

  // Continuous face detection loop
  useEffect(() => {
    if (scanMode !== 'face' || !modelsLoaded || processing || !webcamRef.current) return
    let active = true
    let lastDescriptor: Float32Array | null = null

    const detectLoop = async () => {
      if (!active || !webcamRef.current) return
      const video = webcamRef.current.video
      if (!video || video.readyState < 2) {
        if (active) requestAnimationFrame(detectLoop)
        return
      }
      try {
        const faceapi = await import('@vladmandic/face-api')
        const detection = await faceapi.detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
          .withFaceLandmarks()
          .withFaceDescriptor()

        if (detection) {
          setFaceDetected(true)
          setDetectedFaceData({
            box: {
              x: detection.detection.box.x,
              y: detection.detection.box.y,
              width: detection.detection.box.width,
              height: detection.detection.box.height,
            },
            descriptor: detection.descriptor,
          })
          // Update face box position relative to video display
          const videoEl = video
          const displayWidth = videoEl.clientWidth
          const displayHeight = videoEl.clientHeight
          const videoWidth = videoEl.videoWidth
          const videoHeight = videoEl.videoHeight
          const scaleX = displayWidth / videoWidth
          const scaleY = displayHeight / videoHeight
          setFaceBox({
            x: detection.detection.box.x * scaleX,
            y: detection.detection.box.y * scaleY,
            w: detection.detection.box.width * scaleX,
            h: detection.detection.box.height * scaleY,
          })

          // Auto-detect mode: automatically verify face
          if (autoDetect && !processing && lastDescriptor !== detection.descriptor) {
            lastDescriptor = detection.descriptor
            handleFaceDescriptorVerify(Array.from(detection.descriptor) as number[])
          }
        } else {
          setFaceDetected(false)
          setDetectedFaceData(null)
          setFaceBox(null)
          lastDescriptor = null
        }
      } catch (e) {
        // Ignore detection errors in loop
      }
      if (active) {
        setTimeout(detectLoop, 300) // Poll every 300ms
      }
    }
    detectLoop()
    return () => { active = false }
  }, [scanMode, modelsLoaded, processing, autoDetect])

  // Check online status
  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); syncOfflineQueue() }
    const handleOffline = () => setIsOnline(false)
    if (typeof window !== 'undefined') {
      setIsOnline(navigator.onLine)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Check pending offline items
  useEffect(() => {
    try {
      const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]')
      setPendingCount(queue.filter((i: any) => !i.synced).length)
    } catch (e) {}
  }, [])

  // Fetch scan session status
  const fetchScanSession = useCallback(async () => {
    try {
      const res = await fetch('/api/scan-session')
      const data = await res.json()
      setScanSession(data)
      if (data.active && data.defaultMode) {
        setScanMode(data.defaultMode === 'QR' ? 'qr' : 'face')
      }
    } catch (e) {
      const cached = localStorage.getItem('scan_session_cache')
      if (cached) {
        try { setScanSession(JSON.parse(cached)) } catch (e2) {}
      }
    }
  }, [])

  useEffect(() => { fetchScanSession() }, [fetchScanSession])

  // Cache session for offline use
  useEffect(() => {
    if (scanSession) {
      localStorage.setItem('scan_session_cache', JSON.stringify(scanSession))
    }
  }, [scanSession])

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      const interval = setInterval(syncOfflineQueue, 30000)
      return () => clearInterval(interval)
    }
  }, [isOnline])

  // Speak welcome message
  const speakWelcome = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return
    if (config.welcome_voice_enabled === 'false') return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = config.welcome_voice_lang || 'id-ID'
    utterance.rate = parseFloat(config.welcome_voice_rate || '1')
    utterance.pitch = 1
    window.speechSynthesis.speak(utterance)
  }, [config])

  // Process scan result
  const processResult = useCallback((data: ScanResult) => {
    setResult(data)
    if (data.welcomeMessage) {
      setShowWelcome(true)
      speakWelcome(data.welcomeMessage)
      setTimeout(() => setShowWelcome(false), 8000)
    }
  }, [speakWelcome])

  // Handle QR scan
  const handleQRScan = useCallback(async (qrCode: string) => {
    if (processing || !qrCode) return
    setProcessing(true)
    setResult(null)
    try {
      const body: any = { qrCode, method: 'QR' }
      if (geo.location) {
        body.latitude = geo.location.lat
        body.longitude = geo.location.lng
        body.accuracy = geo.location.accuracy
      }

      if (isOnline) {
        const res = await fetch('/api/public-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Gagal memproses')
          setResult({ found: false, message: data.error || 'Gagal memproses' })
        } else {
          processResult(data)
          if (data.action) toast.success(data.message)
        }
      } else {
        saveToOfflineQueue('CREATE', 'attendance', body)
        toast.warning('Tidak ada internet. Data disimpan lokal, akan disinkronkan saat online.')
        setResult({ found: true, message: 'Presensi tersimpan lokal (offline)', alreadyDone: false })
      }
    } catch (err: any) {
      if (!isOnline) {
        saveToOfflineQueue('CREATE', 'attendance', { qrCode, method: 'QR' })
        toast.warning('Data disimpan lokal (offline)')
      } else {
        toast.error('Gagal menghubungi server')
        setResult({ found: false, message: 'Gagal menghubungi server' })
      }
    } finally {
      setProcessing(false)
    }
  }, [processing, geo.location, processResult, isOnline])

  // Handle manual NISN input
  const handleManualScan = async () => {
    if (!manualNisn.trim()) {
      toast.error('Masukkan NISN')
      return
    }
    setProcessing(true)
    setResult(null)
    try {
      const body: any = { nisn: manualNisn.trim(), method: 'MANUAL' }
      if (geo.location) {
        body.latitude = geo.location.lat
        body.longitude = geo.location.lng
        body.accuracy = geo.location.accuracy
      }

      if (isOnline) {
        const res = await fetch('/api/public-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Gagal memproses')
          setResult({ found: false, message: data.error || 'Gagal memproses' })
        } else {
          processResult(data)
          if (data.action) toast.success(data.message)
        }
      } else {
        saveToOfflineQueue('CREATE', 'attendance', body)
        toast.warning('Data disimpan lokal (offline)')
        setResult({ found: true, message: 'Presensi tersimpan lokal (offline)', alreadyDone: false })
      }
    } catch (err: any) {
      if (!isOnline) {
        saveToOfflineQueue('CREATE', 'attendance', { nisn: manualNisn.trim(), method: 'MANUAL' })
      } else {
        toast.error('Gagal menghubungi server')
      }
    } finally {
      setProcessing(false)
    }
  }

  // Handle face descriptor verification (used by both manual capture and auto-detect)
  const handleFaceDescriptorVerify = useCallback(async (descriptor: number[]) => {
    if (processing) return
    setProcessing(true)
    setResult(null)
    try {
      const body: any = {
        method: 'FACE',
        descriptor,
      }
      // Add NISN if provided (for targeted matching)
      if (manualNisn.trim()) {
        body.nisn = manualNisn.trim()
      }
      if (geo.location) {
        body.latitude = geo.location.lat
        body.longitude = geo.location.lng
        body.accuracy = geo.location.accuracy
      }

      if (isOnline) {
        const res = await fetch('/api/public-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok || !data.found) {
          toast.error(data.message || data.error || 'Wajah tidak dikenali')
          setResult({ found: false, message: data.message || data.error || 'Wajah tidak dikenali' })
        } else {
          if (data.isAutoDetected) {
            toast.success(`Wajah dikenali: ${data.student?.name || 'Siswa'}`)
          }
          processResult(data)
          if (data.action) toast.success(data.message)
        }
      } else {
        if (!manualNisn.trim()) {
          toast.error('Mode offline memerlukan NISN')
          setProcessing(false)
          return
        }
        saveToOfflineQueue('CREATE', 'attendance', body)
        toast.warning('Data disimpan lokal (offline)')
        setResult({ found: true, message: 'Presensi tersimpan lokal (offline)', alreadyDone: false })
      }
    } catch (err: any) {
      if (!isOnline) {
        saveToOfflineQueue('CREATE', 'attendance', { nisn: manualNisn.trim(), method: 'FACE' })
      } else {
        toast.error('Gagal menghubungi server')
      }
    } finally {
      setProcessing(false)
    }
  }, [processing, manualNisn, geo.location, processResult, isOnline])

  // Handle face capture button click
  const handleFaceCapture = async () => {
    if (!modelsLoaded) {
      toast.error('Model AI belum siap. Tunggu hingga selesai dimuat.')
      return
    }
    if (!webcamRef.current) return

    const video = webcamRef.current.video
    if (!video) return

    try {
      const faceapi = await import('@vladmandic/face-api')
      const detection = await faceapi.detectSingleFace(video)
        .withFaceLandmarks()
        .withFaceDescriptor()

      if (!detection) {
        toast.error('Wajah tidak terdeteksi. Pastikan wajah terlihat jelas di kamera.')
        return
      }

      const descriptor = Array.from(detection.descriptor) as number[]
      await handleFaceDescriptorVerify(descriptor)
    } catch (e) {
      console.error('Face capture error:', e)
      toast.error('Gagal mendeteksi wajah. Coba lagi.')
    }
  }

  // Handle scan session toggle
  const handleToggleScanSession = async (activate: boolean) => {
    if (!isOnline) {
      toast.error('Tidak dapat mengubah status scan saat offline')
      return
    }
    setShowLoginDialog(true)
  }

  const handleLoginAndToggle = async () => {
    if (!loginUsername || !loginPassword) {
      toast.error('Masukkan username dan password')
      return
    }
    setLoginLoading(true)
    try {
      const authRes = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      })
      const authData = await authRes.json()
      if (!authRes.ok) {
        toast.error(authData.error || 'Login gagal')
        return
      }

      const allowedRoles = ['ADMIN', 'KEPALA_SEKOLAH', 'VP_KESISWAAN', 'WALI_KELAS', 'GURU', 'GURU_JAGA']
      if (!allowedRoles.includes(authData.user.role)) {
        toast.error('Anda tidak memiliki akses untuk mengubah status scan')
        return
      }

      localStorage.setItem('currentUserId', authData.user.id)

      const action = scanSession?.active ? 'deactivate' : 'activate'
      const sessionRes = await fetch('/api/scan-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          userId: authData.user.id,
          defaultMode: 'FACE',
          shift: new Date().getHours() < 12 ? 'PAGI' : 'SORE',
        }),
      })
      const sessionData = await sessionRes.json()
      if (!sessionRes.ok) {
        toast.error(sessionData.error || 'Gagal mengubah status')
        return
      }

      toast.success(action === 'activate' ? 'Scanner presensi diaktifkan' : 'Scanner presensi dinonaktifkan')
      fetchScanSession()
      setShowLoginDialog(false)
      setLoginUsername('')
      setLoginPassword('')
    } catch (err: any) {
      toast.error('Gagal: ' + err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const timeStr = mounted && currentTime ? currentTime.toLocaleTimeString('id-ID', {
    timeZone: config.timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) : '--:--:--'

  const dateStr = mounted && currentTime ? currentTime.toLocaleDateString('id-ID', {
    timeZone: config.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }) : ''

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b" style={{ borderTop: `4px solid ${config.theme_color}` }}>
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {config.school_logo ? (
              <img src={config.school_logo} alt="Logo" className="h-10 w-10 rounded-full object-contain" />
            ) : (
              <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: config.theme_color }}>
                <GraduationCap className="h-6 w-6" />
              </div>
            )}
            <div>
              <h1 className="text-sm font-bold" style={{ color: config.theme_color }}>{config.school_name}</h1>
              <p className="text-xs text-gray-500">Scanner Presensi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleFullscreen} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <div className={`flex items-center gap-1 text-xs ${isOnline ? 'text-green-600' : 'text-orange-500'}`}>
              {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              {isOnline ? 'Online' : 'Offline'}
            </div>
            <a href="/" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
              <Home className="h-3 w-3" /> Beranda
            </a>
          </div>
        </div>
      </div>

      {/* Scan Session Status Bar */}
      <div className="max-w-lg mx-auto px-4 mt-2">
        <div className={`flex items-center justify-between p-2 rounded-lg text-xs ${
          scanSession?.active ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${scanSession?.active ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className={scanSession?.active ? 'text-green-700' : 'text-red-700'}>
              {scanSession?.active ? 'Scanner Aktif' : 'Scanner Nonaktif'}
            </span>
            {scanSession?.active && scanSession.activatedBy && (
              <span className="text-gray-500">oleh {scanSession.activatedBy}</span>
            )}
            {scanSession?.active && scanSession.shift && (
              <Badge shift={scanSession.shift} />
            )}
          </div>
          <button
            onClick={() => handleToggleScanSession(!scanSession?.active)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
              scanSession?.active ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {scanSession?.active ? <><PowerOff className="h-3 w-3" /> Nonaktifkan</> : <><Power className="h-3 w-3" /> Aktifkan</>}
          </button>
        </div>
      </div>

      {/* Clock */}
      <div className="max-w-lg mx-auto px-4 mt-4 text-center" suppressHydrationWarning>
        <p className="text-3xl font-bold" style={{ color: config.theme_color }}>{timeStr}</p>
        <p className="text-sm text-gray-500 mt-1" suppressHydrationWarning>{dateStr}</p>
        {geo.location && (
          <div className="flex items-center justify-center gap-1 mt-2">
            <MapPin className="h-3 w-3 text-green-500" />
            <span className="text-xs text-green-600">Lokasi terdeteksi (akurasi: {Math.round(geo.location.accuracy)}m)</span>
          </div>
        )}
        {geo.error && (
          <div className="flex items-center justify-center gap-1 mt-2">
            <MapPin className="h-3 w-3 text-yellow-500" />
            <span className="text-xs text-yellow-600">GPS tidak tersedia</span>
          </div>
        )}
        {!isOnline && pendingCount > 0 && (
          <div className="flex items-center justify-center gap-1 mt-2">
            <RefreshCw className="h-3 w-3 text-orange-500" />
            <span className="text-xs text-orange-600">{pendingCount} data menunggu sinkronisasi</span>
          </div>
        )}
      </div>

      {/* AI Model Status */}
      {scanMode === 'face' && (
        <div className="max-w-lg mx-auto px-4 mt-2">
          <div className={`flex items-center justify-center gap-2 text-xs p-2 rounded-lg ${
            loadingModels ? 'bg-amber-50 text-amber-700 border border-amber-200' :
            modelsLoaded ? 'bg-green-50 text-green-700 border border-green-200' :
            'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {loadingModels ? (
              <><RefreshCw className="h-3 w-3 animate-spin" /> Memuat model AI deteksi wajah...</>
            ) : modelsLoaded ? (
              <><CheckCircle className="h-3 w-3" /> Model AI siap - Deteksi wajah aktif</>
            ) : (
              <><AlertCircle className="h-3 w-3" /> Model AI gagal dimuat - Verifikasi wajah tidak tersedia</>
            )}
          </div>
        </div>
      )}

      {/* Login Dialog for Toggle */}
      {showLoginDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800">
                {scanSession?.active ? 'Nonaktifkan Scanner' : 'Aktifkan Scanner'}
              </h3>
              <button onClick={() => setShowLoginDialog(false)}><X className="h-5 w-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Masukkan akun staff untuk {scanSession?.active ? 'menonaktifkan' : 'mengaktifkan'} scanner presensi.
            </p>
            <div className="space-y-3">
              <input
                type="text"
                value={loginUsername}
                onChange={e => setLoginUsername(e.target.value)}
                placeholder="Username"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                onKeyDown={e => e.key === 'Enter' && handleLoginAndToggle()}
              />
              <input
                type="password"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
                placeholder="Password"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                onKeyDown={e => e.key === 'Enter' && handleLoginAndToggle()}
              />
              <button
                onClick={handleLoginAndToggle}
                disabled={loginLoading}
                className="w-full py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: config.theme_color }}
              >
                {loginLoading ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome Card */}
      {showWelcome && result?.student && (
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="rounded-xl p-6 text-center shadow-lg animate-in fade-in slide-in-from-bottom-4" style={{ backgroundColor: result.isLate ? '#fef3c7' : '#ecfdf5', border: `2px solid ${result.isLate ? '#f59e0b' : '#10b981'}` }}>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: result.isLate ? '#fbbf24' : '#34d399' }}>
              {result.isLate ? <AlertCircle className="h-8 w-8 text-white" /> : <CheckCircle className="h-8 w-8 text-white" />}
            </div>
            <h3 className="text-xl font-bold mb-1" style={{ color: result.isLate ? '#92400e' : '#065f46' }}>
              {result.action === 'checkin' ? (result.isLate ? 'Terlambat' : 'Selamat Datang!') : 'Selamat Pulang!'}
            </h3>
            <p className="text-lg font-semibold">{result.student.name}</p>
            <p className="text-sm text-gray-600">{result.student.nisn} • {result.student.className}</p>
            {result.confidence && (
              <p className="text-xs text-gray-500 mt-1">Akurasi wajah: {(parseFloat(result.confidence) * 100).toFixed(1)}%</p>
            )}
            {result.welcomeMessage && (
              <p className="mt-3 text-sm italic" style={{ color: result.isLate ? '#92400e' : '#065f46' }}>
                &ldquo;{result.welcomeMessage}&rdquo;
              </p>
            )}
            <div className="mt-3 flex items-center justify-center gap-1 text-xs text-gray-500">
              <Volume2 className="h-3 w-3" /> Pesan suara aktif
            </div>
          </div>
        </div>
      )}

      {/* Scan Result Card */}
      {result && !showWelcome && (
        <div className="max-w-lg mx-auto px-4 mt-4">
          <div className="rounded-xl p-4 shadow border" style={{
            backgroundColor: result.found ? (result.alreadyDone ? '#eff6ff' : '#ecfdf5') : '#fef2f2',
            borderColor: result.found ? (result.alreadyDone ? '#93c5fd' : '#6ee7b7') : '#fca5a5'
          }}>
            <div className="flex items-start gap-3">
              {result.found ? (
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              )}
              <div>
                <p className="font-semibold text-sm">{result.message}</p>
                {result.student && (
                  <div className="mt-2 text-sm">
                    <p><strong>Nama:</strong> {result.student.name}</p>
                    <p><strong>NISN:</strong> {result.student.nisn}</p>
                    <p><strong>Kelas:</strong> {result.student.className}</p>
                    {result.confidence && (
                      <div className="flex items-center gap-2 mt-1">
                        <strong>Akurasi:</strong>
                        <span className={`font-semibold ${
                          parseFloat(result.confidence) >= 0.8 ? 'text-emerald-600' :
                          parseFloat(result.confidence) >= 0.6 ? 'text-blue-600' :
                          parseFloat(result.confidence) >= 0.4 ? 'text-amber-600' :
                          'text-red-600'
                        }`}>
                          {(parseFloat(result.confidence) * 100).toFixed(1)}%
                        </span>
                        {result.isAutoDetected && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Auto-detect</span>
                        )}
                      </div>
                    )}
                    {result.distance && (
                      <p className="text-xs text-muted-foreground">Jarak: {result.distance} (threshold: 0.6)</p>
                    )}
                    {result.attendance?.checkInTime && (
                      <p><strong>Masuk:</strong> {new Date(result.attendance.checkInTime).toLocaleTimeString('id-ID', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit' })} WIB</p>
                    )}
                    {result.attendance?.checkOutTime && (
                      <p><strong>Keluar:</strong> {new Date(result.attendance.checkOutTime).toLocaleTimeString('id-ID', { timeZone: config.timezone, hour: '2-digit', minute: '2-digit' })} WIB</p>
                    )}
                    {result.attendance?.status && (
                      <p><strong>Status:</strong> {result.attendance.status}</p>
                    )}
                  </div>
                )}
              </div>
              <button onClick={() => setResult(null)} className="ml-auto"><X className="h-4 w-4 text-gray-400" /></button>
            </div>
          </div>
        </div>
      )}

      {/* Scanner Inactive Message */}
      {!scanSession?.active && mounted && (
        <div className="max-w-lg mx-auto px-4 mt-8 text-center">
          <div className="bg-white rounded-xl p-8 shadow border">
            <Monitor className="h-16 w-16 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-semibold text-gray-600 mb-2">Scanner Presensi Nonaktif</h3>
            <p className="text-sm text-gray-500 mb-4">
              Scanner sedang tidak aktif. Hubungi Guru Jaga, Admin, atau staff yang berwenang untuk mengaktifkan.
            </p>
            <p className="text-xs text-gray-400">
              Role yang dapat mengaktifkan: Admin, Kepala Sekolah, VP Kesiswaan, Wali Kelas, Guru, Guru Jaga
            </p>
          </div>
        </div>
      )}

      {/* Scan Section - Only shown when session is active */}
      {scanSession?.active && mounted && (
        <div className="max-w-lg mx-auto px-4 mt-6 pb-8">
          {/* Mode Toggle — QR is default, Face is optional */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              onClick={() => setScanMode('qr')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                scanMode === 'qr'
                  ? 'text-white shadow-md'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
              style={scanMode === 'qr' ? { backgroundColor: config.theme_color } : {}}
            >
              <ScanLine className="h-5 w-5" /> Scan QR <span className="text-[10px] opacity-80 ml-1">(default)</span>
            </button>
            <button
              onClick={() => setScanMode('face')}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-medium transition-all ${
                scanMode === 'face'
                  ? 'text-white shadow-md'
                  : 'bg-white border text-gray-600 hover:bg-gray-50'
              }`}
              style={scanMode === 'face' ? { backgroundColor: config.theme_color } : {}}
            >
              <Camera className="h-5 w-5" /> Scan Wajah <span className="text-[10px] opacity-80 ml-1">(uji coba)</span>
            </button>
          </div>

          {/* Manual NISN Input - Always visible */}
          <div className="bg-white rounded-xl p-4 shadow border mb-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Input Manual NISN</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualNisn}
                onChange={e => setManualNisn(e.target.value)}
                placeholder="Masukkan NISN"
                className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"
                style={{ borderColor: config.theme_color }}
                onKeyDown={e => e.key === 'Enter' && handleManualScan()}
              />
              <button
                onClick={handleManualScan}
                disabled={processing}
                className="px-4 py-2 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: config.theme_color }}
              >
                {processing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* QR Scanner Mode */}
          {scanMode === 'qr' && (
            <div className="space-y-4">
              <div className="rounded-xl overflow-hidden border-2 shadow-lg" style={{ borderColor: config.theme_color }}>
                <Scanner
                  onScan={(result) => {
                    if (result && result.length > 0) {
                      const val = (result[0] as any).rawValue || (result[0] as any).value || String(result[0])
                      if (val) handleQRScan(val)
                    }
                  }}
                  styles={{ container: { width: '100%', height: 320 } }}
                />
              </div>
              <p className="text-center text-sm text-gray-500">Arahkan QR code siswa ke kamera</p>
            </div>
          )}

          {/* Face Scanner Mode */}
          {scanMode === 'face' && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-4 shadow border">
                <p className="text-sm font-medium text-gray-700 mb-1">NISN (Opsional - kosongkan untuk auto-detect)</p>
                <p className="text-xs text-gray-500 mb-2">Jika NISN diisi, verifikasi lebih akurat. Jika dikosongkan, sistem akan mengenali wajah secara otomatis.</p>
                <input
                  type="text"
                  value={manualNisn}
                  onChange={e => setManualNisn(e.target.value)}
                  placeholder="Masukkan NISN (opsional)"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2"
                />
              </div>

              {/* Webcam with face detection overlay */}
              <div className="rounded-xl overflow-hidden border-2 shadow-lg relative" style={{ borderColor: config.theme_color }}>
                <Webcam
                  ref={webcamRef}
                  audio={false}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{ facingMode: 'user', width: 640, height: 480 }}
                  style={{ width: '100%', height: 320, objectFit: 'cover' }}
                />

                {/* Face detection overlay */}
                {faceDetected && faceBox && (
                  <div
                    className="absolute border-2 border-green-400 rounded-lg pointer-events-none transition-all duration-150"
                    style={{
                      left: faceBox.x,
                      top: faceBox.y,
                      width: faceBox.w,
                      height: faceBox.h,
                      boxShadow: '0 0 10px rgba(74, 222, 128, 0.5)',
                    }}
                  >
                    {/* Corner markers */}
                    <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-green-300 rounded-tl" />
                    <div className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-green-300 rounded-tr" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-green-300 rounded-bl" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-green-300 rounded-br" />
                  </div>
                )}

                {/* Face detection status badge */}
                <div className={`absolute top-3 right-3 px-3 py-1 rounded-full text-xs font-medium shadow ${
                  faceDetected ? 'bg-green-500 text-white' : 'bg-gray-600/80 text-white'
                }`}>
                  {faceDetected ? '✓ Wajah Terdeteksi' : 'Mencari wajah...'}
                </div>

                {/* Processing overlay */}
                {processing && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <div className="bg-white rounded-xl px-6 py-4 flex items-center gap-3 shadow-xl">
                      <RefreshCw className="h-6 w-6 animate-spin" style={{ color: config.theme_color }} />
                      <span className="text-sm font-medium">Memverifikasi wajah...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Auto-detect toggle */}
              <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow border">
                <div className="flex items-center gap-2">
                  <Zap className={`h-4 w-4 ${autoDetect ? 'text-amber-500' : 'text-gray-400'}`} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Auto-Detect</p>
                    <p className="text-xs text-gray-500">Otomatis verifikasi saat wajah terdeteksi</p>
                  </div>
                </div>
                <button
                  onClick={() => setAutoDetect(!autoDetect)}
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    autoDetect ? 'bg-amber-500' : 'bg-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 ${autoDetect ? 'right-0.5' : 'left-0.5'} w-5 h-5 bg-white rounded-full shadow transition-all`} />
                </button>
              </div>

              {/* Capture button */}
              {!autoDetect && (
                <button
                  onClick={handleFaceCapture}
                  disabled={processing || !modelsLoaded || !faceDetected}
                  className="w-full py-3 text-white rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ backgroundColor: config.theme_color }}
                >
                  {processing ? (
                    <RefreshCw className="h-5 w-5 animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5" />
                  )}
                  {processing ? 'Memverifikasi...' : !modelsLoaded ? 'Memuat model AI...' : !faceDetected ? 'Menunggu wajah...' : manualNisn.trim() ? 'Capture & Verifikasi Wajah' : 'Capture & Auto-Detect Wajah'}
                </button>
              )}

              {autoDetect && (
                <div className="text-center py-2 px-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <Zap className="h-4 w-4 inline mr-1" />
                  Auto-detect aktif. Wajah akan diverifikasi secara otomatis saat terdeteksi.
                  {processing && <span className="ml-2 font-medium">Sedang memverifikasi...</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Badge({ shift }: { shift: string }) {
  const colors: Record<string, string> = {
    PAGI: 'bg-yellow-100 text-yellow-700',
    SORE: 'bg-orange-100 text-orange-700',
  }
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[shift] || 'bg-gray-100 text-gray-600'}`}>
      {shift}
    </span>
  )
}
