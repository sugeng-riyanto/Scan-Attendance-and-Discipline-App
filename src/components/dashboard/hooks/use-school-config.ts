'use client'

import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api-fetch'
import { SchoolConfigType, DEFAULT_SCHOOL_CONFIG } from '@/lib/types'

export function useSchoolConfig() {
  const [config, setConfig] = useState<SchoolConfigType>(DEFAULT_SCHOOL_CONFIG)
  useEffect(() => {
    apiFetch<{ configs: { key: string; value: string }[] }>('/api/school-config')
      .then(data => {
        const map: Record<string, string> = {}
        data.configs.forEach(c => { map[c.key] = c.value })
        setConfig(prev => ({
          school_name: map.school_name || prev.school_name,
          school_address: map.school_address || prev.school_address,
          school_logo: map.school_logo || prev.school_logo,
          theme_color: map.theme_color || prev.theme_color,
          timezone: map.timezone || prev.timezone,
          checkin_cutoff_hour: map.checkin_cutoff_hour || prev.checkin_cutoff_hour,
        }))
      }).catch(() => {})
  }, [])
  return config
}
