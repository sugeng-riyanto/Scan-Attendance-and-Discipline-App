'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/stores/app-store'
import { AlertTriangle, ExternalLink } from 'lucide-react'

/**
 * Dashboard banner that nudges users to re-accept the Terms & Conditions
 * when a new version has been published since they last accepted.
 *
 * Fetches the current active T&C version on mount and compares it to the
 * user's stored `termsAcceptedVersion`.  If outdated, a dismissible banner
 * appears with a direct link to the Terms page where they can re-accept.
 */
export function TermsReAcceptBanner({ themeColor }: { themeColor: string }) {
  const { user } = useAuthStore()
  const [currentVersion, setCurrentVersion] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!user) return
    apiFetch<{ terms: { version: number } | null }>('/api/terms-content')
      .then(data => {
        if (data?.terms) setCurrentVersion(data.terms.version)
      })
      .catch(() => {})
  }, [user?.id])

  if (!user || currentVersion === null || dismissed) return null

  const userVersion = (user as any).termsAcceptedVersion ?? null
  const needsReAccept = userVersion === null || userVersion < currentVersion

  if (!needsReAccept) return null

  return (
    <div className="mx-4 mt-2 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/30">
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 text-sm">
        <span className="font-semibold text-amber-800 dark:text-amber-200">
          Syarat & Ketentuan telah diperbarui (v{currentVersion}).
        </span>{' '}
        <span className="text-amber-700 dark:text-amber-300">
          Silakan baca dan setujui versi terbaru agar penggunaan aplikasi sesuai ketentuan terkini.
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0 border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/50"
        onClick={() => {
          useAppStore.getState().setActivePage('terms')
        }}
      >
        <ExternalLink className="h-3 w-3 mr-1" /> Buka Syarat & Ketentuan
      </Button>
      <button
        className="text-xs text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
        onClick={() => setDismissed(true)}
        title="Sembunyikan"
      >
        ✕
      </button>
    </div>
  )
}
