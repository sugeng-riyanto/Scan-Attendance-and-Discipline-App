'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api-fetch'

export function useApiFetch<T>(url: string | null, deps: any[] = []) {
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

  return { data, loading, error, refetch }
}
