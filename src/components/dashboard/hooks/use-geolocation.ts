'use client'

import { useState, useEffect } from 'react'
import { GeoLocation } from '@/lib/geo-utils'

export function useGeolocation() {
  const [location, setLocation] = useState<GeoLocation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [watching, setWatching] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy })
        setError(null)
        setWatching(true)
      },
      (err) => {
        setError(err.message)
        setWatching(false)
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  return { location, error, watching }
}
