'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { useSocketEvent } from '@/lib/socket-client'
import { CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react'

/**
 * Per-school subscription banner shown on every dashboard page (below the header).
 * Always shows the school's subscription expiry date + a countdown; turns into a
 * warning banner when fewer than 30 days remain (red under 7 days).
 * SUPER_ADMIN has no school -> the API returns `subscription: null` and nothing renders.
 */
interface SubscriptionInfo {
  schoolId: string
  schoolName: string
  schoolCode: string
  plan: string
  status: string
  periodStart: string | null
  periodEnd: string | null
  price: number | null
  notes: string | null
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  TRIAL: 'Masa Percobaan',
  INACTIVE: 'Nonaktif',
  EXPIRED: 'Kedaluwarsa',
}

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysUntil(d: string | Date): number {
  const end = new Date(d).getTime()
  const now = Date.now()
  return Math.max(0, Math.ceil((end - now) / 86_400_000))
}

export function SubscriptionBanner() {
  const [sub, setSub] = useState<SubscriptionInfo | null | undefined>(undefined)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ subscription: SubscriptionInfo | null }>('/api/account')
      setSub(data.subscription ?? null)
    } catch {
      setSub(null)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // A reseed recreates subscriptions (new periodEnds) — refresh the countdown then.
  useSocketEvent('data:reset', load)

  // SUPER_ADMIN school preview: show the previewed school's subscription.
  useEffect(() => {
    const onPreviewChange = () => load()
    window.addEventListener('school-preview-changed', onPreviewChange)
    return () => window.removeEventListener('school-preview-changed', onPreviewChange)
  }, [load])

  if (sub === undefined || sub === null) return null

  const { status } = sub
  const ended = status === 'INACTIVE' || status === 'EXPIRED'
  const daysLeft = sub.periodEnd ? daysUntil(sub.periodEnd) : null
  const urgent = !ended && daysLeft !== null && daysLeft < 30
  const critical = !ended && daysLeft !== null && daysLeft < 7

  // --- Warning banner: fewer than 30 days (or subscription not active) ---
  if (ended || urgent) {
    const tone = ended || critical ? 'red' : 'amber'
    const toneClasses =
      tone === 'red'
        ? 'bg-red-50 border-red-300 text-red-800 dark:bg-red-950/60 dark:border-red-800 dark:text-red-200'
        : 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-200'
    return (
      <div className={`border-b px-4 py-2.5 text-sm ${toneClasses}`} role="alert">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-semibold">
            {ended
              ? `Langganan ${sub.schoolName} (${sub.schoolCode}) ${STATUS_LABEL[status] || status}.`
              : `Langganan ${sub.schoolName} (${sub.schoolCode}) segera berakhir.`}
          </span>
          {!ended && sub.periodEnd && (
            <span className="font-medium">
              Berlaku hingga {formatDate(sub.periodEnd)} — sisa{' '}
              <strong>{daysLeft === 0 ? 'hari terakhir' : `${daysLeft} hari`}</strong>.
            </span>
          )}
          {ended && sub.periodEnd && (
            <span className="font-medium">Berakhir {formatDate(sub.periodEnd)}.</span>
          )}
          <span className="opacity-90">Hubungi administrator untuk memperpanjang langganan.</span>
        </div>
      </div>
    )
  }

  // --- Info bar: subscription active with >30 days left ---
  return (
    <div className="border-b border-gray-200 bg-white px-4 py-1.5 text-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-0.5 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
          <span className="font-medium text-foreground">{sub.schoolName}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium dark:bg-gray-800">
            {STATUS_LABEL[status] || status}
          </span>
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3.5 w-3.5" />
          {sub.periodEnd ? (
            <>
              Langganan berlaku hingga <strong className="text-foreground">{formatDate(sub.periodEnd)}</strong>
              {daysLeft !== null && <span>· sisa <strong className="text-foreground">{daysLeft} hari</strong></span>}
            </>
          ) : (
            'Masa langganan tidak ditetapkan'
          )}
        </span>
      </div>
    </div>
  )
}
