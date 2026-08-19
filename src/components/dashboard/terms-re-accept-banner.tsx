'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { apiFetch } from '@/lib/api-fetch'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/stores/app-store'
import { AlertTriangle, ExternalLink, Clock, ShieldAlert } from 'lucide-react'

const DEADLINE_DAYS = 30

/**
 * Dashboard banner that nudges users to re-accept the Terms & Conditions
 * when a new version has been published since they last accepted.
 *
 * Shows a deadline countdown with urgency-based colors:
 * - Green/amber: >14 days remaining
 * - Amber: 7-14 days remaining
 * - Red: <7 days remaining
 * - Red + locked: deadline exceeded
 */
export function TermsReAcceptBanner({ themeColor }: { themeColor: string }) {
  const { user } = useAuthStore()
  const [termsInfo, setTermsInfo] = useState<{ version: number; publishedAt: string } | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!user) return
    apiFetch<{ terms: { version: number; createdAt: string } | null }>('/api/terms-content')
      .then(data => {
        if (data?.terms) setTermsInfo({ version: data.terms.version, publishedAt: data.terms.createdAt })
      })
      .catch(() => {})
  }, [user?.id])

  if (!user || !termsInfo || dismissed) return null

  const userVersion = (user as any).termsAcceptedVersion ?? null
  const needsReAccept = userVersion === null || userVersion < termsInfo.version

  if (!needsReAccept) return null

  // Calculate days remaining until deadline
  const publishedAt = new Date(termsInfo.publishedAt)
  const deadline = new Date(publishedAt)
  deadline.setDate(deadline.getDate() + DEADLINE_DAYS)
  const now = new Date()
  const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const isLocked = daysRemaining <= 0

  // Urgency styling
  const isUrgent = daysRemaining <= 7 && daysRemaining > 0
  const isWarning = daysRemaining > 7 && daysRemaining <= 14

  const borderColor = isLocked ? 'border-red-400 dark:border-red-600' : isUrgent ? 'border-red-300 dark:border-red-700' : isWarning ? 'border-amber-300 dark:border-amber-700' : 'border-amber-300 dark:border-amber-700'
  const bgColor = isLocked ? 'bg-red-50 dark:bg-red-950/30' : isUrgent ? 'bg-red-50 dark:bg-red-950/20' : isWarning ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-amber-50 dark:bg-amber-950/30'
  const iconColor = isLocked ? 'text-red-600 dark:text-red-400' : isUrgent ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'
  const textColor = isLocked ? 'text-red-800 dark:text-red-200' : isUrgent ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-200'

  const Icon = isLocked ? ShieldAlert : AlertTriangle

  const deadlineText = isLocked
    ? 'Batas waktu telah habis! Akun Anda akan terkunci pada login berikutnya.'
    : daysRemaining <= 7
      ? `Sisa ${daysRemaining} hari lagi — segera setujui!`
      : daysRemaining <= 14
        ? `Sisa ${daysRemaining} hari untuk menyetujui.`
        : `Sisa ${daysRemaining} hari untuk menyetujui.`

  return (
    <div className={`mx-4 mt-2 flex items-center gap-3 rounded-lg border ${borderColor} ${bgColor} px-4 py-3`}>
      <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
      <div className="flex-1 text-sm">
        <span className={`font-semibold ${textColor}`}>
          Syarat & Ketentuan v{termsInfo.version} perlu disetujui.
        </span>{' '}
        <span className={textColor}>
          {deadlineText}
        </span>
        {!isLocked && (
          <span className="ml-1 inline-flex items-center gap-1 text-xs opacity-75">
            <Clock className="h-3 w-3" /> Deadline: {deadline.toLocaleDateString('id-ID')}
          </span>
        )}
      </div>
      <Button
        size="sm"
        variant="outline"
        className={`shrink-0 ${isLocked ? 'border-red-400 text-red-700 hover:bg-red-100 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/50' : 'border-amber-400 text-amber-800 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-200 dark:hover:bg-amber-900/50'}`}
        onClick={() => {
          useAppStore.getState().setActivePage('terms')
        }}
      >
        <ExternalLink className="h-3 w-3 mr-1" /> {isLocked ? 'Hubungi Admin' : 'Buka Syarat & Ketentuan'}
      </Button>
      {!isLocked && (
        <button
          className="text-xs text-amber-500 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-200"
          onClick={() => setDismissed(true)}
          title="Sembunyikan"
        >
          ✕
        </button>
      )}
    </div>
  )
}
