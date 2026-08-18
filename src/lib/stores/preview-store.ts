'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * SUPER_ADMIN school-preview state (client side).
 *
 * `setPreview` stores the selected school AND writes the `preview_school_id`
 * cookie the server reads (see src/lib/school-scope.ts) so every data API is
 * scoped to that school — the super admin previews the app exactly as a user
 * of that school sees it, without changing accounts. `clearPreview` removes
 * both. The store is persisted so the preview survives page reloads; it is
 * cleared on logout.
 */
export interface PreviewSchool {
  schoolId: string
  name: string
  code: string
}

interface PreviewState {
  preview: PreviewSchool | null
  setPreview: (school: PreviewSchool) => void
  clearPreview: () => void
}

const COOKIE = 'preview_school_id'

function writeCookie(schoolId: string | null) {
  if (typeof document === 'undefined') return
  if (schoolId) {
    document.cookie = `${COOKIE}=${schoolId}; path=/; max-age=86400; samesite=lax`
  } else {
    document.cookie = `${COOKIE}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      preview: null,
      setPreview: (school) => {
        writeCookie(school.schoolId)
        set({ preview: school })
      },
      clearPreview: () => {
        writeCookie(null)
        set({ preview: null })
      },
    }),
    { name: 'school-preview-storage' }
  )
)
