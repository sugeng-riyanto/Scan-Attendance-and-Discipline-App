'use client'

import React, { useEffect, useState } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { usePreviewStore } from '@/lib/stores/preview-store'
import { apiFetch } from '@/lib/api-fetch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Eye } from 'lucide-react'
import { toast } from 'sonner'

interface SchoolOption {
  id: string
  code: string
  name: string
}

/** Fired on the window whenever the preview school changes, so open dashboards refetch. */
export const PREVIEW_CHANGED_EVENT = 'school-preview-changed'

export function emitPreviewChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PREVIEW_CHANGED_EVENT))
}

/**
 * SUPER_ADMIN-only school switcher (header). Picking a school activates preview
 * mode: the server scopes every data API to that school (via the
 * `preview_school_id` cookie), so the super admin sees the app exactly as a
 * user of that school would — without changing accounts.
 */
export function SchoolSwitcher() {
  const { user } = useAuthStore()
  const { preview, setPreview, clearPreview } = usePreviewStore()
  const [schools, setSchools] = useState<SchoolOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user || user.role !== 'SUPER_ADMIN') return
    let cancelled = false
    apiFetch<{ schools: SchoolOption[] }>('/api/super-admin?resource=schools')
      .then((d) => { if (!cancelled) setSchools(d.schools || []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user])

  if (!user || user.role !== 'SUPER_ADMIN') return null

  const current = preview
    ? schools.find((s) => s.id === preview.schoolId)
    : undefined

  const handleChange = (value: string) => {
    if (!value || value === 'none') {
      clearPreview()
      emitPreviewChanged()
      toast.info('Preview sekolah dinonaktifkan — data semua sekolah terlihat lagi')
      return
    }
    const school = schools.find((s) => s.id === value)
    if (!school) return
    setPreview({ schoolId: school.id, name: school.name, code: school.code })
    emitPreviewChanged()
    toast.success(`Mode preview: ${school.name} (${school.code})`)
  }

  return (
    <div className="flex items-center gap-1.5" title="Preview aplikasi sebagai pengguna sekolah ini">
      <Eye className="h-4 w-4 text-muted-foreground" />
      <Select value={current ? current.id : 'none'} onValueChange={handleChange} disabled={loading}>
        <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Preview sekolah">
          <SelectValue placeholder={current ? `${current.code} — ${current.name}` : 'Preview: Semua sekolah'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Semua sekolah (tanpa preview)</SelectItem>
          {schools.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
