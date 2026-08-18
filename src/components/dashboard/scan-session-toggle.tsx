'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Camera, RefreshCw, ScanLine } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-fetch'
import { ShiftGateBadge } from '@/components/shared/shift-gate-badge'

type SessionInfo = {
  active: boolean
  activatedBy?: string
  activatedAt?: string
  shift?: string
  defaultMode?: string
}

export function ScanSessionToggle() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const { user } = useAuthStore()

  const fetchSession = useCallback(async () => {
    try {
      const res = await apiFetch<SessionInfo>('/api/scan-session')
      setSession(res)
    } catch (e) {}
  }, [])

  useEffect(() => { fetchSession() }, [fetchSession])

  const toggle = async () => {
    if (!user) return
    setLoading(true)
    try {
      const action = session?.active ? 'deactivate' : 'activate'
      await apiFetch('/api/scan-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, userId: user.id, defaultMode: 'QR', shift: new Date().getHours() < 12 ? 'PAGI' : 'SORE' }),
      })
      toast.success(action === 'activate' ? 'Scanner diaktifkan' : 'Scanner dinonaktifkan')
      fetchSession()
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${session?.active ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
      <span className="text-xs text-muted-foreground whitespace-nowrap">{session?.active ? 'Aktif' : 'Nonaktif'}</span>
      {session?.activatedBy && <span className="text-xs text-muted-foreground truncate max-w-[100px]">({session.activatedBy})</span>}
      {session?.active && session.shift && <ShiftGateBadge shift={session.shift} />}
      {session?.active && session.defaultMode && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 border border-blue-300">
          {session.defaultMode === 'FACE' ? <Camera className="h-3 w-3" /> : <ScanLine className="h-3 w-3" />}
          Mode: {session.defaultMode === 'FACE' ? 'Wajah' : 'QR'}
        </span>
      )}
      <Button size="sm" variant={session?.active ? 'destructive' : 'default'} onClick={toggle} disabled={loading}
        className={`h-9 text-xs px-3 ${session?.active ? '' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
        {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : session?.active ? 'Nonaktifkan' : 'Aktifkan'}
      </Button>
    </div>
  )
}
