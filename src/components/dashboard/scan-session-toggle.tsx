'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-fetch'

export function ScanSessionToggle() {
  const [session, setSession] = useState<{ active: boolean; activatedBy?: string; activatedAt?: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const { user } = useAuthStore()

  const fetchSession = useCallback(async () => {
    try {
      const res = await apiFetch<{ active: boolean; activatedBy?: string; activatedAt?: string }>('/api/scan-session')
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
    <div className="flex items-center gap-2">
      <div className={`h-2.5 w-2.5 rounded-full ${session?.active ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
      <span className="text-xs text-muted-foreground">{session?.active ? 'Aktif' : 'Nonaktif'}</span>
      {session?.activatedBy && <span className="text-xs text-muted-foreground">({session.activatedBy})</span>}
      <Button size="sm" variant={session?.active ? 'destructive' : 'default'} onClick={toggle} disabled={loading}
        className={session?.active ? '' : 'bg-emerald-600 hover:bg-emerald-700'}>
        {loading ? <RefreshCw className="h-3 w-3 animate-spin" /> : session?.active ? 'Nonaktifkan' : 'Aktifkan'}
      </Button>
    </div>
  )
}
