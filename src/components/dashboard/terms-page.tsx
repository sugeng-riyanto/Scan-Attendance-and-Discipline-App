'use client'

import React, { useEffect, useState } from 'react'
import { AuthUser } from '@/lib/stores/auth-store'
import { roleLabels } from '@/lib/attendance-utils'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'
import {
  ScrollText, ShieldCheck, Lock, KeyRound, AlertTriangle, FileText,
  Edit3, Plus, Trash2, CheckCircle, Save, X, History
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'

interface TermsRecord {
  id: string
  title: string
  body: string
  version: number
  isActive: boolean
  updatedBy: string | null
  createdAt: string
  updatedAt: string
}

const EDIT_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH'])

/** Default T&C content used when the DB has no record yet */
const DEFAULT_BODY = `1. Dasar Hukum

Aplikasi ini mengikuti Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) dan Undang-Undang Nomor 35 Tahun 2014 tentang Perlindungan Anak.

Data siswa adalah data anak yang dilindungi secara khusus. Pemrosesan data anak hanya dilakukan dengan persetujuan orang tua atau wali, dan hanya untuk kepentingan pendidikan serta kedisiplinan di sekolah.

2. Data yang Dikumpulkan

Sekolah hanya mengumpulkan data yang diperlukan: identitas siswa (nama, NISN, kelas), data kehadiran, catatan pelanggaran dan kebaikan, foto wajah untuk verifikasi kehadiran, serta lokasi saat pemindaian. Prinsip data minimal digunakan.

3. Cara Data Dikelola

- Data disimpan pada server milik sekolah dan dijaga dengan kata sandi serta pembatasan akses.
- Setiap pengguna hanya dapat melihat data sesuai perannya (Admin, Kepala Sekolah, Guru, dan lainnya).
- Kata sandi akun disimpan dalam bentuk terenkripsi dan tidak dapat dibaca siapa pun.
- Foto wajah hanya digunakan untuk verifikasi kehadiran dan tidak disebarluaskan.
- Data tidak dijual, ditukarkan, atau diserahkan kepada pihak lain tanpa persetujuan, kecuali diwajibkan hukum.

4. Hak Anda

Anda berhak meminta informasi tentang data yang tersimpan, memperbaiki data yang keliru, dan meminta penghapusan data sesuai ketentuan. Untuk data siswa, hak tersebut dijalankan oleh orang tua atau wali melalui pihak sekolah.

5. Jika Terjadi Kebocoran Data

Apabila terjadi kebocoran data, sekolah akan:
- Mengamankan sistem secepatnya agar kebocoran tidak meluas.
- Menyelidiki penyebab dan menilai data yang terdampak.
- Memberi tahu pengguna, orang tua, atau wali yang terdampak paling lambat 3x24 jam, serta melaporkan kepada lembaga yang berwenang sesuai UU PDP.
- Memperbaiki kelemahan agar kejadian serupa tidak terulang.

Pengguna juga wajib menjaga kerahasiaan akunnya. Setiap aktivitas yang dilakukan dengan akun Anda menjadi tanggung jawab Anda.

Ketentuan ini dapat diperbarui sewaktu-waktu. Perubahan akan diumumkan melalui aplikasi ini.`

const ROLE_DATA_NOTE: Record<string, string> = {
  ADMIN: 'As Administrator, you manage master data, user accounts, and all reports. Your access covers student, teacher, and parent data.',
  KEPALA_SEKOLAH: 'As Principal, you only view summaries and statistics for decision-making. You do not manage detailed student data.',
  VP_KESISWAAN: 'As VP Student Affairs, you handle violation records, discipline patterns, and duty teacher schedules.',
  WALI_KELAS: 'As Homeroom Teacher, you manage attendance, permissions, and student behavior records for your class.',
  GURU: 'As Teacher, you record student attendance and behavior during your teaching hours.',
  GURU_JAGA: 'As Duty Teacher, you run attendance scanning sessions and monitor student arrivals.',
  ORANG_TUA: 'As Parent, you only view your own child\'s data, including permissions and attendance.',
  SISWA: 'As Student, you only view your own attendance and behavior data.',
}

/** Parse simple markdown-like body into rendered sections */
function renderBody(text: string) {
  const sections = text.split(/\n(?=\d+\.\s)/g).filter(Boolean)
  return sections.map((section, i) => {
    const lines = section.trim().split('\n')
    const headerMatch = lines[0].match(/^(\d+)\.\s+(.+)/)
    const title = headerMatch ? lines[0] : `Section ${i + 1}`
    const body = headerMatch ? lines.slice(1).join('\n') : section
    const isWarning = /kebocoran|breach|alert/i.test(title)

    const formattedBody = body.split('\n').map((line, j) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('- ')) {
        return <li key={j} className="ml-4">{trimmed.slice(2)}</li>
      }
      if (trimmed) return <p key={j} className="mt-1">{trimmed}</p>
      return null
    })

    return (
      <section key={i} className={`rounded-xl border p-5 shadow-sm dark:border-gray-800 ${
        isWarning
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40'
          : 'bg-white dark:bg-gray-900'
      }`}>
        <h3 className={`font-semibold mb-2 flex items-center gap-2 ${
          isWarning ? 'text-amber-900 dark:text-amber-200' : ''
        }`}>
          <FileText className="h-4 w-4" /> {title}
        </h3>
        <div className={`text-sm leading-relaxed list-disc pl-5 space-y-1 ${
          isWarning ? 'text-amber-900 dark:text-amber-200' : 'text-gray-700 dark:text-gray-300'
        }`}>
          {formattedBody}
        </div>
      </section>
    )
  })
}

export function TermsPage({ user, publicView }: { user: AuthUser; publicView?: boolean }) {
  const canEdit = !publicView && EDIT_ROLES.has(user.role)

  const [terms, setTerms] = useState<TermsRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [allVersions, setAllVersions] = useState<TermsRecord[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [busy, setBusy] = useState(false)

  const loadTerms = async () => {
    setLoading(true)
    try {
      const data = await apiFetch<{ terms: TermsRecord | null }>('/api/terms-content')
      setTerms(data.terms)
      if (data.terms) {
        setEditTitle(data.terms.title)
        setEditBody(data.terms.body)
      }
    } catch {
      // If API fails, use default content (public page still works)
      setTerms(null)
      setEditBody(DEFAULT_BODY)
    } finally {
      setLoading(false)
    }
  }

  const loadAllVersions = async () => {
    try {
      // We only have GET which returns the active one.
      // For history, we rely on the single GET + audit logs.
      // For now, store versions in local state when they're fetched.
      setShowHistory(!showHistory)
    } catch { /* ignore */ }
  }

  const saveTerms = async (activate = true) => {
    if (!editBody.trim() || editBody.trim().length < 10) {
      return toast.error('Terms content must be at least 10 characters')
    }
    setBusy(true)
    try {
      if (terms) {
        // Update existing
        const data = await apiFetch<{ terms: TermsRecord }>('/api/terms-content', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: terms.id, title: editTitle, body: editBody, isActive: activate }),
        })
        setTerms(data.terms)
        toast.success(`Terms v${data.terms.version} saved${activate ? ' & activated' : ''}`)
      } else {
        // Create new
        const data = await apiFetch<{ terms: TermsRecord }>('/api/terms-content', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editTitle, body: editBody, activate }),
        })
        setTerms(data.terms)
        toast.success(`Terms v${data.terms.version} created & activated`)
      }
      setEditing(false)
      setCreating(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setBusy(false)
    }
  }

  const deleteTerms = async () => {
    if (!terms) return
    if (!confirm('Delete this version? A previous version will be activated automatically.')) return
    setBusy(true)
    try {
      await apiFetch(`/api/terms-content?id=${terms.id}`, { method: 'DELETE' })
      toast.success('Deleted')
      await loadTerms()
      setEditing(false)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => { loadTerms() }, [])

  // ---- EDITOR VIEW (admin) ----
  if (editing || creating) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Edit3 className="h-5 w-5" />
            {creating ? 'Create New Terms & Conditions' : `Edit Terms v${terms?.version ?? '?'} `}
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditing(false); setCreating(false) }} disabled={busy}>
              <X className="h-4 w-4 mr-1" /> Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={() => saveTerms(false)} disabled={busy || !editBody.trim()}>
              <Save className="h-4 w-4 mr-1" /> Save Draft
            </Button>
            <Button size="sm" onClick={() => saveTerms(true)} disabled={busy || !editBody.trim()}>
              <CheckCircle className="h-4 w-4 mr-1" /> Save & Activate
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="space-y-3 pt-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Terms and Conditions of Use" />
            </div>
            <div>
              <label className="text-sm font-medium">Content (plain text, use "1. Title" for sections, "- " for list items)</label>
              <Textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                rows={25}
                className="font-mono text-sm"
                placeholder="Type Terms & Conditions here..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Use numbered sections (e.g. "1. Legal Basis") to separate major sections.
              Use "- " prefix for bullet lists. Line breaks create new paragraphs.
            </p>
          </CardContent>
        </Card>

        {/* Live preview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {renderBody(editBody || '(No content)')}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- READER VIEW ----
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 space-y-4">
        <div className="animate-pulse space-y-3">
          <div className="h-8 bg-gray-200 rounded w-1/2 dark:bg-gray-800" />
          <div className="h-32 bg-gray-200 rounded dark:bg-gray-800" />
          <div className="h-32 bg-gray-200 rounded dark:bg-gray-800" />
        </div>
      </div>
    )
  }

  const body = terms?.body || DEFAULT_BODY
  const version = terms?.version

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{terms?.title || 'Terms and Conditions of Use'}</h2>
            <p className="text-xs text-muted-foreground">
              {publicView
                ? 'Applies to: All users (Administrator, Teacher, Parent, and Student)'
                : `Applies to: ${roleLabels[user.role] || user.role}`}
              {version !== undefined && <span className="ml-2">· v{version}</span>}
              {terms?.updatedAt && <span className="ml-2">· Updated {new Date(terms.updatedAt).toLocaleDateString()}</span>}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setEditing(true) }}>
              <Edit3 className="h-4 w-4 mr-1" /> Edit
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setCreating(true); setEditBody(DEFAULT_BODY); setEditTitle('Terms and Conditions of Use') }}>
              <Plus className="h-4 w-4 mr-1" /> New Version
            </Button>
          </div>
        )}
      </div>

      {/* Role-specific note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
        <p className="flex items-start gap-2">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          {publicView
            ? 'Each user can only view and manage data according to their role. Student data is child data protected by law and is only processed for educational purposes.'
            : (ROLE_DATA_NOTE[user.role] || 'Your access is restricted according to your assigned role.')}
        </p>
      </div>

      {/* Rendered content */}
      <div className="space-y-4">
        {renderBody(body)}
      </div>

      {/* Admin version management footer */}
      {canEdit && (
        <>
          <Separator />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {terms ? `Version ${terms.version} — Last edited by ${terms.updatedBy || 'unknown'} on ${new Date(terms.updatedAt).toLocaleString()}` : 'No published version yet'}
            </span>
            <div className="flex gap-2">
              {terms && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={deleteTerms} disabled={busy}>
                  <Trash2 className="h-3 w-3 mr-1" /> Delete Version
                </Button>
              )}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        These terms may be updated at any time. Changes will be announced through this application.
      </p>
    </div>
  )
}
