'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { generateQRCode, generateQRString } from '@/lib/qr-utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Image, Download, User, CreditCard, GraduationCap, BookOpen, CheckSquare, Square, Shield, Camera, Upload, Calendar } from 'lucide-react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { apiFetch } from '@/lib/api-fetch'
import { Student, ClassInfo } from './types'
import { useApiFetch } from './hooks/use-api-fetch'
import { useSchoolConfig } from './hooks/use-school-config'
import { PageSkeleton } from './page-skeleton'

// ── Shared helpers ────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function uploadStudentPhoto(studentId: string, file: File): Promise<void> {
  const base64 = await readFileAsBase64(file)
  await apiFetch('/api/students', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: studentId, photoBase64: base64 }),
  })
}

// ── Card component (responsive, no fixed aspectRatio) ────────────

function IdCardFace({ student, qrDataUrl, schoolConfig, themeColor, showPhotoUpload, onPhotoUpload }:
  { student: Student; qrDataUrl: string; schoolConfig: any; themeColor: string; showPhotoUpload?: boolean; onPhotoUpload?: (file: File) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const classLevel = student.class?.level || ''
  const academicYearName = student.class?.academicYear?.name || ''
  const eduType = ['VII','VIII','IX'].includes(classLevel) ? 'SMP' : ['X','XI','XII'].includes(classLevel) ? 'SMA' : classLevel

  return (
    <div className="rounded-2xl overflow-hidden shadow-xl border-2 w-full max-w-sm sm:max-w-md mx-auto" style={{ borderColor: themeColor + '40' }}>
      {/* Header */}
      <div className="relative px-3 py-2 sm:px-5 sm:py-3 text-white overflow-hidden" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}dd, ${themeColor}99)` }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)', backgroundSize: '16px 16px' }} />
        <div className="relative flex items-center gap-2 mb-0.5">
          {schoolConfig.school_logo ? (
            <img src={schoolConfig.school_logo} alt="Logo" className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-white p-0.5 object-contain shadow-md" />
          ) : (
            <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-white/25 backdrop-blur flex items-center justify-center shadow-md">
              <GraduationCap className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
            </div>
          )}
          <div className="text-left min-w-0">
            <p className="font-bold text-xs sm:text-sm leading-tight drop-shadow-sm truncate">{schoolConfig.school_name}</p>
            <p className="text-[9px] sm:text-[10px] opacity-90 leading-tight truncate">{schoolConfig.school_address}</p>
          </div>
        </div>
        <p className="relative text-center text-[9px] sm:text-[11px] font-semibold tracking-wider opacity-80">KARTU IDENTITAS SISWA</p>
      </div>

      {/* Body */}
      <div className="bg-white p-2 sm:p-4">
        <div className="flex flex-row gap-2 sm:gap-3 items-start">
          {/* Photo */}
          <div className="relative w-14 h-[68px] sm:w-20 sm:h-24 rounded-lg border-2 overflow-hidden shadow-sm shrink-0" style={{ borderColor: themeColor + '30' }}>
            {student.photoBase64 || student.photoUrl ? (
              <img src={student.photoBase64 || student.photoUrl} alt="Foto" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-b from-gray-50 to-gray-100 flex items-center justify-center">
                <User className="h-6 w-6 sm:h-8 sm:w-8 text-gray-300" />
              </div>
            )}
            {showPhotoUpload && onPhotoUpload && (
              <>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onPhotoUpload(f); e.target.value = '' }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-center justify-center text-white opacity-0 hover:opacity-100">
                  <Camera className="h-4 w-4" />
                </button>
              </>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-0.5">
            <p className="font-bold text-gray-900 text-xs sm:text-sm leading-tight truncate">{student.name}</p>
            <div className="text-[10px] sm:text-xs text-gray-700 space-y-0.5">
              <p className="flex items-center gap-1"><CreditCard className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-gray-400 shrink-0" /> NISN: <span className="font-semibold">{student.nisn}</span></p>
              <p className="flex items-center gap-1"><GraduationCap className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-gray-400 shrink-0" /> Kelas: <span className="font-semibold">{student.class?.name}</span></p>
              <p className="flex items-center gap-1"><BookOpen className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-gray-400 shrink-0" /> Status: <Badge className={`text-[9px] sm:text-[10px] px-1 py-0 ${student.status === 'AKTIF' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{student.status || 'AKTIF'}</Badge></p>
              {eduType && <p className="flex items-center gap-1"><Calendar className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-gray-400 shrink-0" /> Tingkat: <Badge className="text-[9px] sm:text-[10px] px-1 py-0 bg-blue-100 text-blue-800">{eduType}{academicYearName ? ` / ${academicYearName}` : ''}</Badge></p>}
            </div>
          </div>

          {/* QR */}
          <div className="flex flex-col items-center shrink-0">
            <div className="w-[52px] h-[52px] sm:w-[72px] sm:h-[72px] rounded-lg border p-0.5 shadow-sm" style={{ borderColor: themeColor + '30' }}>
              {qrDataUrl ? <img src={qrDataUrl} alt="QR" className="w-full h-full" /> : <div className="w-full h-full bg-gray-50 rounded animate-pulse" />}
            </div>
            <p className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5 whitespace-nowrap text-center">Scan presensi</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 sm:px-4 py-1.5 border-t flex items-center justify-between" style={{ background: `linear-gradient(to right, ${themeColor}08, ${themeColor}15, ${themeColor}08)` }}>
        <p className="text-[8px] sm:text-[9px] text-gray-400 whitespace-nowrap">Dicetak: {new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        <p className="text-[7px] sm:text-[9px] text-gray-400 font-medium whitespace-nowrap text-right">{schoolConfig.school_name}</p>
      </div>
    </div>
  )
}

// ── Print/PDF (primary): flatten computed styles → new window → browser renders lab() natively ─

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function flattenComputedStyles(root: HTMLElement): HTMLElement {
  const flatClone = root.cloneNode(true) as HTMLElement
  const apply = (clone: HTMLElement, original: HTMLElement) => {
    const cs = getComputedStyle(original)
    for (let i = 0; i < cs.length; i++) {
      const val = cs.getPropertyValue(cs[i])
      if (val) clone.style.setProperty(cs[i], val)
    }
    clone.removeAttribute('class')
    for (let i = 0; i < Math.min(clone.children.length, original.children.length); i++)
      apply(clone.children[i] as HTMLElement, original.children[i] as HTMLElement)
  }
  apply(flatClone, root)
  return flatClone
}

function applyFlatStyles(clone: HTMLElement, original: HTMLElement): void {
  const cs = getComputedStyle(original)
  for (let i = 0; i < cs.length; i++) {
    const prop = cs[i]
    const val = cs.getPropertyValue(prop)
    if (val) clone.style.setProperty(prop, val)
  }
  clone.removeAttribute('class')
  for (let i = 0; i < Math.min(clone.children.length, original.children.length); i++) {
    applyFlatStyles(clone.children[i] as HTMLElement, original.children[i] as HTMLElement)
  }
}

function openPrintWindow(title: string, html: string, landscape = true) {
  const w = window.open('', '_blank')
  if (!w) { toast.error('Gagal membuka jendela cetak. Izinkan popup.'); return }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  @page { size: ${landscape ? 'landscape' : 'A4'}; margin: 0.5cm; }
  body { margin: 0; padding: 16px; background: #f5f5f5; font-family: Arial, Helvetica, sans-serif; }
  @media print { body { background: #fff; padding: 0; } }
  .print-grid { display: flex; flex-wrap: wrap; gap: 16px; justify-content: center; }
  .print-grid > * { break-inside: avoid; page-break-inside: avoid; }
</style></head><body><div class="print-grid">${html}</div></body></html>`)
  w.document.close()
  setTimeout(() => { w.focus(); w.print(); }, 500)
}

function cardHtmlForPrint(elementId: string): string | null {
  const el = document.getElementById(elementId)
  if (!el) return null
  const clone = flattenComputedStyles(el)
  // Remove interactive elements (buttons, inputs, svg icons) from the clone
  clone.querySelectorAll('button, input, label, svg:not([id])').forEach(el => {
    if (!el.closest('[class*="qr"]') && !el.closest('[class*="logo"]')) el.remove()
  })
  return clone.outerHTML
}

function batchCardsHtmlForPrint(elementIds: string[]): string {
  return elementIds.map(id => {
    const el = document.getElementById(id)
    if (!el) return ''
    const clone = flattenComputedStyles(el)
    return clone.outerHTML
  }).filter(Boolean).join('')
}

// ── SVG download: flatten + SVG foreignObject → browser native render (same as PDF) ─

function serializeXml(node: Node): string {
  return new XMLSerializer().serializeToString(node)
}

function buildSvgString(elementId: string): { svg: string; width: number; height: number } | null {
  const src = document.getElementById(elementId)
  if (!src) return null
  const rect = src.getBoundingClientRect()
  const pad = 16
  const cw = Math.round(rect.width)
  const ch = Math.round(rect.height)
  const sw = cw + pad * 2
  const sh = ch + pad * 2
  const clone = flattenComputedStyles(src)
  const html = serializeXml(clone)
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${sw}" height="${sh}" viewBox="0 0 ${sw} ${sh}">`,
    `<foreignObject x="${pad}" y="${pad}" width="${cw}" height="${ch}">${html}</foreignObject></svg>`,
  ].join('\n')
  return { svg, width: sw, height: sh }
}

function downloadSvg(elementId: string, filename: string): boolean {
  const result = buildSvgString(elementId)
  if (!result) return false
  const blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename; link.href = url
  document.body.appendChild(link); link.click(); document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

async function downloadPngFromSvg(elementId: string, filename: string): Promise<boolean> {
  const result = buildSvgString(elementId)
  if (!result) return false
  try {
    const blob = new Blob([result.svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('SVG render failed'))
      img.src = url
    })
    const canvas = document.createElement('canvas')
    const scale = 3
    canvas.width = result.width * scale
    canvas.height = result.height * scale
    const ctx = canvas.getContext('2d')!
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    const pngUrl = canvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = filename; link.href = pngUrl
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    return true
  } catch (err) {
    console.error('[IDCard] SVG→PNG failed:', err)
    return false
  }
}

function openPdfFromSvg(elementId: string, title: string) {
  const result = buildSvgString(elementId)
  if (!result) return
  const w = window.open('', '_blank')
  if (!w) { toast.error('Gagal membuka jendela cetak. Izinkan popup.'); return }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>@page{size:landscape;margin:0}body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5}@media print{body{background:#fff}}</style></head><body>${result.svg}</body></html>`)
  w.document.close()
  setTimeout(() => w.print(), 500)
}

function flattenStylesRgb(element: HTMLElement, culori: any): HTMLElement {
  const apply = (clone: HTMLElement, original: HTMLElement) => {
    const cs = getComputedStyle(original)
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i]
      let val = cs.getPropertyValue(prop)
      if (val) {
        if (/lab\(|oklch\(|color\(|hwb\(/.test(val)) {
          try {
            const parsed = culori.parse(val)
            if (parsed) {
              const rgb = culori.toRgb(parsed)
              val = `rgb(${Math.round(rgb.r*255)},${Math.round(rgb.g*255)},${Math.round(rgb.b*255)})`
            }
          } catch {}
        }
        clone.style.setProperty(prop, val)
      }
    }
    clone.removeAttribute('class')
    for (let i = 0; i < Math.min(clone.children.length, original.children.length); i++)
      apply(clone.children[i] as HTMLElement, original.children[i] as HTMLElement)
  }
  const clone = element.cloneNode(true) as HTMLElement
  apply(clone, element)
  return clone
}

async function captureCardDirectly(elementId: string): Promise<string | null> {
  const src = document.getElementById(elementId)
  if (!src) { console.error('[IDCard] Source element not found:', elementId); return null }

  console.log('[IDCard] Starting capture for:', elementId)

  // ── Load culori & flatten styles ─
  let culori: any
  try {
    culori = await getCulori()
  } catch (e) {
    console.error('[IDCard] Failed to load culori:', e)
    return null
  }

  // Clone and flatten (lab→rgb via culori)
  const clone = flattenStylesRgb(src, culori)
  if (!clone || !clone.firstChild) {
    console.error('[IDCard] Clone is empty')
    return null
  }

  // BRUTE FORCE: replace ANY remaining lab()/oklch()/color()/hwb() in ANY attribute
  // across ALL elements in the clone. This ensures html2canvas NEVER sees these.
  clone.querySelectorAll('*').forEach(el => {
    for (let i = 0; i < el.attributes.length; i++) {
      const attr = el.attributes[i]
      if (typeof attr.value === 'string' && /lab\(|oklch\(|color\(|hwb\(/i.test(attr.value)) {
        attr.value = attr.value
          .replace(/lab\([^)]*\)/gi, 'rgb(128,128,128)')
          .replace(/oklch\([^)]*\)/gi, 'rgb(128,128,128)')
          .replace(/color\([^)]*\)/gi, 'rgb(128,128,128)')
          .replace(/hwb\([^)]*\)/gi, 'rgb(128,128,128)')
      }
    }
  })

  // Add crossOrigin to non-data images (for canvas taint protection)
  clone.querySelectorAll('img:not([src^="data"])').forEach(img => {
    img.setAttribute('crossOrigin', 'anonymous')
  })

  // Render off-screen (absolute+opacity keeps layout, doesn't flash)
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:absolute;left:0;top:0;z-index:-1;opacity:0;pointer-events:none;background:#fff;'
  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)

  try {
    // Let browser layout the off-screen element
    await new Promise(r => setTimeout(r, 500))

    // Check dimensions
    const w = clone.scrollWidth, h = clone.scrollHeight
    console.log('[IDCard] Clone dimensions:', w, 'x', h)
    if (!w || !h) {
      console.error('[IDCard] Clone has zero dimensions')
      return null
    }

    // Wait for all images to load
    const imgs = Array.from(clone.querySelectorAll('img'))
    if (imgs.length > 0) {
      console.log('[IDCard] Waiting for', imgs.length, 'images')
      await Promise.allSettled(imgs.map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = () => r(undefined); img.onerror = () => r(undefined) })
      ))
      await new Promise(r => setTimeout(r, 300))
    }

    // ── html2canvas ─
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(clone, {
      scale: 2,
      backgroundColor: '#ffffff',
      width: w,
      height: h,
      logging: false,
      useCORS: true,
    })

    // Get data URL (might throw SecurityError if canvas is tainted)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      console.log('[IDCard] Capture successful, dataUrl length:', dataUrl.length)
      return dataUrl
    } catch (taintErr) {
      console.error('[IDCard] Canvas tainted (CORS issue):', taintErr)
      return null
    }
  } catch (err) {
    console.error('[IDCard] html2canvas failed:', err)
    return null
  } finally {
    if (wrapper.parentNode) document.body.removeChild(wrapper)
  }
}

// ── Siswa: single card with download ──────────────────────────────

function StudentSingleCardView({ initialStudent }: { initialStudent?: Student } = {}) {
  const schoolConfig = useSchoolConfig()
  const themeColor = schoolConfig.theme_color || '#10b981'
  const { user } = useAuthStore()
  const { data: studentsData, loading: sLoad } = useApiFetch<{ students: Student[]; total: number }>('/api/students?limit=500')
  const me = initialStudent || studentsData?.students?.find(s => s.user?.id === user?.id) || studentsData?.students?.find(s => s.nisn === user?.username)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [fullscreenId, setFullscreenId] = useState<string | null>(null)

  useEffect(() => {
    if (me?.nisn) {
      generateQRCode(generateQRString(me.nisn)).then(url => setQrDataUrl(url))
    }
  }, [me?.nisn])

  if (sLoad) return <PageSkeleton />
  if (!me) return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Kartu Identitas Siswa</h2>
      <Card><CardContent className="p-8 text-center">
        <User className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-muted-foreground">Data siswa tidak ditemukan</p>
        <p className="text-xs text-gray-400 mt-2">Pastikan akun siswa sudah terhubung dengan data siswa di database. Hubungi admin jika masalah berlanjut.</p>
      </CardContent></Card>
    </div>
  )
  // Check visibility for students
  if (user?.role === 'SISWA' && me.idCardVisibleToStudent === false)
    return <div className="text-center py-12 text-gray-400"><p>Kartu ID tidak tersedia. Hubungi admin.</p></div>

  const handleDownloadSvg = () => {
    const ok = downloadSvg('student-id-card', `ID-Card-${me.nisn}.svg`)
    toast[ok ? 'success' : 'error'](ok ? 'Kartu berhasil diunduh (SVG)' : 'Gagal mengunduh')
  }

  const handlePrintPdf = () => {
    openPdfFromSvg('student-id-card', `ID Card - ${me.nisn}`)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-800">Kartu Identitas Siswa</h2>
      <div className="flex justify-center">
        <div id="student-id-card" className="inline-block cursor-pointer" onClick={() => setFullscreenId('student-id-card')}>
          <IdCardFace student={me} qrDataUrl={qrDataUrl} schoolConfig={schoolConfig} themeColor={themeColor} />
        </div>
      </div>
      <div className="flex justify-center gap-3">
        <Button variant="outline" style={{ borderColor: themeColor, color: themeColor }} onClick={handlePrintPdf}>
          <Download className="h-4 w-4 mr-2" /> PDF
        </Button>
        <Button className="text-white" style={{ backgroundColor: themeColor }} onClick={handleDownloadSvg}>
          <Image className="h-4 w-4 mr-2" /> SVG
        </Button>
      </div>

      {/* Fullscreen overlay */}
      {fullscreenId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setFullscreenId(null)}>
          <div className="relative max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setFullscreenId(null)} className="absolute -top-10 right-0 text-white text-sm hover:text-gray-300 z-10">✕ Tutup</button>
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl p-4 sm:p-8">
              <IdCardFace student={me} qrDataUrl={qrDataUrl} schoolConfig={schoolConfig} themeColor={themeColor} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Admin/staff: batch view ───────────────────────────────────────

function BatchIdCardView() {
  const schoolConfig = useSchoolConfig()
  const themeColor = schoolConfig.theme_color || '#10b981'
  const { user } = useAuthStore()
  const [selectedClassId, setSelectedClassId] = useState<string>('all')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())
  const [qrCache, setQrCache] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const bulkFileRef = useRef<HTMLInputElement>(null)

  const { data: classesData, loading: cLoad } = useApiFetch<{ classes: ClassInfo[] }>('/api/classes')
  // Auto-select Wali Kelas's class
  const myClass = classesData?.classes?.find(c => c.homeroomTeacherId === user?.id)
  const effectiveClassId = (user?.role === 'WALI_KELAS' && myClass) ? myClass.id : selectedClassId

  const { data: studentsData, loading: sLoad, refetch: refetchStudents } = useApiFetch<{ students: Student[]; total: number }>(`/api/students?classId=${effectiveClassId}&limit=500`)

  const students = studentsData?.students || []
  const classes = classesData?.classes || []
  const selectedStudents = students.filter(s => selectedStudentIds.has(s.id))

  useEffect(() => { setSelectedStudentIds(new Set()); setQrCache({}) }, [selectedClassId])

  useEffect(() => {
    const pending = selectedStudents.filter(s => !qrCache[s.id])
    if (pending.length === 0) return
    let cancelled = false
    const load = async () => {
      for (const s of pending) {
        if (cancelled) break
        const url = await generateQRCode(generateQRString(s.nisn))
        if (!cancelled) setQrCache(prev => ({ ...prev, [s.id]: url }))
      }
    }
    load()
    return () => { cancelled = true }
  }, [selectedStudentIds])

  const toggleAll = () => {
    if (selectedStudentIds.size === students.length) setSelectedStudentIds(new Set())
    else setSelectedStudentIds(new Set(students.map(s => s.id)))
  }

  const toggleStudent = (id: string) => {
    const next = new Set(selectedStudentIds)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelectedStudentIds(next)
  }

  const handleUploadPhoto = async (student: Student, file: File) => {
    setUploading(student.id)
    try {
      await uploadStudentPhoto(student.id, file)
      toast.success(`Foto ${student.name} berhasil diupload`)
      refetchStudents()
    } catch { toast.error(`Gagal upload foto ${student.name}`) } finally { setUploading(null) }
  }

  const handleToggleIdCardVisibility = async (student: Student, target: 'student' | 'parent') => {
    const field = target === 'student' ? 'idCardVisibleToStudent' : 'idCardVisibleToParent'
    const newVal = !(target === 'student' ? student.idCardVisibleToStudent : student.idCardVisibleToParent)
    try {
      await apiFetch('/api/students', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id, [field]: newVal }),
      })
      toast.success(`ID Card ${newVal ? 'ditampilkan' : 'disembunyikan'} untuk ${target === 'student' ? 'Siswa' : 'Orang Tua'} (${student.name})`)
      refetchStudents()
    } catch { toast.error('Gagal mengubah visibilitas ID Card') }
  }

  const handleToggleFaceCapture = async (student: Student) => {
    try {
      await apiFetch('/api/students', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: student.id, faceCaptureEnabled: !student.faceCaptureEnabled }),
      })
      toast.success(`Face capture ${!student.faceCaptureEnabled ? 'diaktifkan' : 'dinonaktifkan'} untuk ${student.name}`)
      refetchStudents()
    } catch { toast.error('Gagal mengubah status face capture') }
  }

  const handleToggleAllFaceCapture = async (enable: boolean) => {
    const targets = selectedStudentIds.size > 0 ? selectedStudents : students
    if (targets.length === 0) { toast.error('Tidak ada siswa'); return }
    toast.info(`${enable ? 'Mengaktifkan' : 'Menonaktifkan'} face capture untuk ${targets.length} siswa...`)
    let ok = 0, fail = 0
    for (const s of targets) {
      try {
        await apiFetch('/api/students', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: s.id, faceCaptureEnabled: enable }),
        })
        ok++
      } catch { fail++ }
    }
    toast.success(`${ok} berhasil${fail ? `, ${fail} gagal` : ''}`)
    refetchStudents()
  }

  const handleBulkUpload = async (files: FileList) => {
    const fileArr = Array.from(files)
    const targets = selectedStudentIds.size > 0 ? selectedStudents : students
    let ok = 0, fail = 0
    for (let i = 0; i < Math.min(fileArr.length, targets.length); i++) {
      try {
        await uploadStudentPhoto(targets[i].id, fileArr[i])
        ok++
      } catch { fail++ }
    }
    toast.success(`${ok} foto berhasil, ${fail} gagal`)
    refetchStudents()
  }

  const handleDownloadSingle = (student: Student) => {
    toast.info(`Menyiapkan ${student.name}...`)
    const ok = downloadSvg(`card-${student.id}`, `ID-Card-${student.nisn}.svg`)
    toast[ok ? 'success' : 'error'](ok ? `${student.name} diunduh (SVG)` : `Gagal ${student.name}`)
  }

  const handleDownloadAll = () => {
    if (selectedStudents.length === 0) { toast.error('Pilih siswa terlebih dahulu'); return }
    if (selectedStudents.length === 1) {
      handleDownloadSingle(selectedStudents[0])
    } else {
      handleDownloadZipSvg()
    }
  }

  const handleDownloadZipSvg = async () => {
    if (selectedStudents.length === 0) return
    toast.info(`Membuat ZIP ${selectedStudents.length} kartu...`)
    let ok = 0, fail = 0
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    for (const s of selectedStudents) {
      const svgResult = buildSvgString(`card-${s.id}`)
      if (!svgResult) { fail++; continue }
      zip.file(`ID-Card-${s.nisn}.svg`, svgResult.svg); ok++
    }
    if (ok === 0) { toast.error('Gagal membuat ZIP'); return }
    const content = await zip.generateAsync({ type: 'blob' })
    const link = document.createElement('a')
    link.download = `ID-Cards-${effectiveClassId === 'all' ? 'SemuaKelas' : effectiveClassId}.zip`
    link.href = URL.createObjectURL(content)
    document.body.appendChild(link); link.click(); document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
    toast.success(`ZIP berhasil (${ok} kartu)`)
  }

  const handlePrintAll = () => {
    if (selectedStudents.length === 0) return
    const svgs = selectedStudents.map(s => buildSvgString(`card-${s.id}`)).filter(Boolean) as { svg: string }[]
    if (svgs.length === 0) return
    const allSvg = svgs.map(s => s.svg).join('\n')
    const w = window.open('', '_blank')
    if (!w) { toast.error('Gagal membuka jendela cetak'); return }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>ID Cards ${selectedStudents.length} siswa</title>
<style>@page{size:landscape;margin:0.3cm}body{margin:0;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;background:#f5f5f5}@media print{body{background:#fff}}svg{width:45%;break-inside:avoid}</style></head><body>${allSvg}</body></html>`)
    w.document.close()
    setTimeout(() => w.print(), 500)
  }

  if (sLoad || cLoad) return <PageSkeleton />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-xl font-bold text-gray-800">Cetak Kartu ID Siswa</h2>
        {selectedStudents.length > 0 && (
          <Badge variant="secondary" className="text-sm px-3 py-1">{selectedStudents.length} siswa dipilih</Badge>
        )}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <label className="text-sm font-medium text-gray-700 shrink-0">Kelas:</label>
              {user?.role === 'WALI_KELAS' && myClass ? (
                <div className="flex-1 sm:w-48 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-md text-gray-700 font-medium">
                  {myClass.name} ({students.length} siswa)
                </div>
              ) : (
                <select className="flex-1 sm:w-48 rounded-md border border-gray-300 px-3 py-2 text-sm bg-white"
                  value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                  <option value="all">Semua Kelas</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c._count?.students || 0} siswa)</option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={toggleAll} className="h-10 text-xs">
                {selectedStudentIds.size === students.length
                  ? <><Square className="h-4 w-4 mr-1" /> Deselect All</>
                  : <><CheckSquare className="h-4 w-4 mr-1" /> Select All</>}
              </Button>
              <Button size="sm" onClick={handlePrintAll} disabled={selectedStudents.length === 0} className="h-10 text-xs">
                <Download className="h-4 w-4 mr-1" /> Cetak PDF ({selectedStudents.length})
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadAll} disabled={selectedStudents.length === 0} className="h-10 text-xs">
                <Image className="h-4 w-4 mr-1" /> Download ({selectedStudents.length})
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleToggleAllFaceCapture(true)} className="h-10 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                <Camera className="h-4 w-4 mr-1" /> Wajah ON All
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleToggleAllFaceCapture(false)} className="h-10 text-xs text-gray-500">
                <Camera className="h-4 w-4 mr-1" /> Wajah OFF All
              </Button>
              <input ref={bulkFileRef} type="file" multiple accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files; if (f && f.length) handleBulkUpload(f); e.target.value = '' }} />
              <Button variant="outline" size="sm" onClick={() => bulkFileRef.current?.click()} className="h-10 text-xs">
                <Upload className="h-4 w-4 mr-1" /> Upload Foto
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toggle info */}
      <div className="text-xs text-gray-500 flex items-center gap-3 px-1 flex-wrap">
        <span className="font-medium">Pengaturan tampilan:</span>
        <span className="inline-flex items-center gap-1 text-emerald-600"><span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 font-medium">✓ Wajah</span></span>
        <span className="inline-flex items-center gap-1 text-gray-400"><span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100">✗ Wajah</span></span>
        <span className="text-blue-700"><span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 font-medium">◉ Siswa</span> ID Card utk siswa</span>
        <span className="text-purple-700"><span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 font-medium">◉ Ortu</span> ID Card utk ortu</span>
      </div>

      {/* Student list */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {students.map(student => (
          <Card key={student.id}
            className={`cursor-pointer transition-all ${selectedStudentIds.has(student.id) ? 'ring-2 ring-offset-1' : 'hover:border-gray-300'}`}
            style={selectedStudentIds.has(student.id) ? { borderColor: themeColor, borderWidth: 2 } : {}}>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Checkbox checked={selectedStudentIds.has(student.id)} onCheckedChange={() => toggleStudent(student.id)} onClick={e => e.stopPropagation()} />
                <div className="relative w-10 h-12 rounded-md overflow-hidden bg-gray-100 shrink-0 group">
                  {student.photoBase64 || student.photoUrl ? (
                    <img src={student.photoBase64 || student.photoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><User className="h-5 w-5 text-gray-300" /></div>
                  )}
                  <label className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center cursor-pointer text-white opacity-0 group-hover:opacity-100">
                    <Camera className="h-4 w-4" />
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPhoto(student, f); e.target.value = '' }}
                      disabled={uploading === student.id} />
                  </label>
                </div>
                <div className="flex-1 min-w-0" onClick={() => toggleStudent(student.id)}>
                  <p className="text-sm font-medium truncate">{student.name}</p>
                  <p className="text-xs text-gray-500">NISN: {student.nisn}</p>
                  <p className="text-xs text-gray-500">{student.class?.name}</p>
                </div>
                <button onClick={e => { e.stopPropagation(); handleToggleFaceCapture(student) }}
                  className={`text-[10px] px-2 py-1 rounded-md shrink-0 font-medium whitespace-nowrap ${student.faceCaptureEnabled !== false ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                  title={student.faceCaptureEnabled !== false ? 'Klik nonaktifkan face capture' : 'Klik aktifkan face capture'}>
                  {student.faceCaptureEnabled !== false ? '✓ Wajah' : '✗ Wajah'}
                </button>
                <button onClick={e => { e.stopPropagation(); handleToggleIdCardVisibility(student, 'student') }}
                  className={`text-[10px] px-1.5 py-1 rounded-md shrink-0 font-medium whitespace-nowrap ${student.idCardVisibleToStudent !== false ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}
                  title={student.idCardVisibleToStudent !== false ? 'ID Card tampil di siswa - klik sembunyikan' : 'ID Card disembunyikan dari siswa - klik tampilkan'}>
                  {student.idCardVisibleToStudent !== false ? '◉ Siswa' : '○ Siswa'}
                </button>
                <button onClick={e => { e.stopPropagation(); handleToggleIdCardVisibility(student, 'parent') }}
                  className={`text-[10px] px-1.5 py-1 rounded-md shrink-0 font-medium whitespace-nowrap ${student.idCardVisibleToParent !== false ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}
                  title={student.idCardVisibleToParent !== false ? 'ID Card tampil di orang tua - klik sembunyikan' : 'ID Card disembunyikan dari orang tua - klik tampilkan'}>
                  {student.idCardVisibleToParent !== false ? '◉ Ortu' : '○ Ortu'}
                </button>
              </div>
            </CardContent>
          </Card>
        ))}
        {students.length === 0 && (
          <div className="col-span-full text-center py-12 text-gray-400">
            <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Tidak ada siswa di kelas ini</p>
          </div>
        )}
      </div>

      {/* Preview + Download */}
      {selectedStudents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Preview Kartu ({selectedStudents.length})</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handlePrintAll} className="h-10 text-xs">
                  <Download className="h-4 w-4 mr-1" /> Cetak PDF ({selectedStudents.length})
                </Button>
                <Button size="sm" onClick={handleDownloadAll} className="h-10 text-xs">
                  <Image className="h-4 w-4 mr-1" /> Download ({selectedStudents.length})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedStudents.map(student => (
                <div key={student.id} className="space-y-2">
                  <div id={`card-${student.id}`}>
                    <IdCardFace student={student} qrDataUrl={qrCache[student.id] || ''} schoolConfig={schoolConfig} themeColor={themeColor} />
                  </div>
                  <div className="flex justify-center gap-2">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => handleDownloadSingle(student)}>
                      <Download className="h-3 w-3 mr-1" /> PNG
                    </Button>
                    <label className="cursor-pointer">
                      <Button variant="ghost" size="sm" className="h-8 text-xs">
                        <Camera className="h-3 w-3 mr-1" /> Foto
                      </Button>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadPhoto(student, f); e.target.value = '' }} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Entry point ───────────────────────────────────────────────────

export function IdCardPage() {
  const { user } = useAuthStore()
  const { data: studentsData } = useApiFetch<{ students: Student[] }>('/api/students?limit=500')
  const isStaff = user && ['ADMIN', 'WALI_KELAS', 'VP_KESISWAAN', 'GURU', 'KEPALA_SEKOLAH', 'GURU_JAGA'].includes(user.role)
  const isParent = user?.role === 'ORANG_TUA'

  if (isStaff) return <BatchIdCardView />

  // For parents: find their child
  if (isParent) {
    const child = studentsData?.students?.find(s => s.parents?.some(p => p.user.id === user?.id))
    if (!child) return <div className="text-center py-12 text-gray-400"><p>Data anak tidak ditemukan</p></div>
    if (child.idCardVisibleToParent === false) return <div className="text-center py-12 text-gray-400"><p>Kartu ID siswa tidak tersedia untuk orang tua.</p></div>
    return <StudentSingleCardView initialStudent={child} />
  }

  // For students
  return <StudentSingleCardView />
}
