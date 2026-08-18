'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { subscribeSocketEvent } from '@/lib/socket-client'

/**
 * Fetch JSON from an API endpoint with refetch support.
 *
 * @param url          Endpoint to fetch, or null to stay idle.
 * @param deps         Extra dependencies that trigger a refetch.
 * @param liveEvents   Socket events (from the attendance-socket mini-service)
 *                     that automatically trigger a refetch, e.g. ['attendance:update'].
 */
export function useApiFetch<T>(url: string | null, deps: any[] = [], liveEvents: string[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = useCallback(async () => {
    if (!url) { setLoading(false); return }
    setLoading(true); setError(null)
    try {
      const result = await apiFetch<T>(url)
      setData(result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => { refetch() }, [refetch, ...deps])

  // Live updates: refetch whenever one of the socket events arrives. Every
  // hook also listens for 'data:reset' (emitted by /api/setup after a
  // re-seed), so all open dashboards refresh as soon as the database is
  // wiped and re-seeded instead of showing stale data.
  const liveKey = liveEvents.join(',')
  useEffect(() => {
    const events = liveKey ? [...liveEvents, 'data:reset'] : ['data:reset']
    const unsubs = events.map((ev) => subscribeSocketEvent(ev, () => refetch()))
    // SUPER_ADMIN school preview: refetch when the previewed school changes.
    const onPreviewChange = () => refetch()
    window.addEventListener('school-preview-changed', onPreviewChange)
    return () => {
      unsubs.forEach((u) => u())
      window.removeEventListener('school-preview-changed', onPreviewChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, refetch])

  return { data, loading, error, refetch }
}
