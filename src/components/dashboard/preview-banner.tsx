'use client'

import React from 'react'
import { usePreviewStore } from '@/lib/stores/preview-store'
import { useAuthStore } from '@/lib/stores/auth-store'
import { emitPreviewChanged } from './school-switcher'
import { Button } from '@/components/ui/button'
import { Eye, X } from 'lucide-react'
import { toast } from 'sonner'

/**
 * App-wide banner shown while SUPER_ADMIN preview mode is active: states which
 * school's data is being viewed and offers a one-click exit back to the
 * all-schools view.
 */
export function PreviewBanner() {
  const { user } = useAuthStore()
  const { preview, clearPreview } = usePreviewStore()

  if (!user || user.role !== 'SUPER_ADMIN' || !preview) return null

  const exit = () => {
    clearPreview()
    emitPreviewChanged()
    toast.info('Preview sekolah dinonaktifkan')
  }

  return (
    <div className="border-b border-indigo-300 bg-indigo-50 px-4 py-2 text-sm text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200" role="status">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1">
        <Eye className="h-4 w-4 shrink-0" />
        <span className="font-semibold">Mode Preview — {preview.name} ({preview.code})</span>
        <span className="opacity-90">Data yang Anda lihat dibatasi ke sekolah ini, persis seperti pengguna sekolah tersebut.</span>
        <Button variant="outline" size="sm" className="h-7 ml-auto text-xs" onClick={exit}>
          <X className="h-3 w-3 mr-1" /> Keluar Preview
        </Button>
      </div>
    </div>
  )
}
