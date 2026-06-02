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
          demo_show_admin: map.demo_show_admin || prev.demo_show_admin,
          demo_show_kepsek: map.demo_show_kepsek || prev.demo_show_kepsek,
          demo_show_vpkes: map.demo_show_vpkes || prev.demo_show_vpkes,
          demo_show_walikelas: map.demo_show_walikelas || prev.demo_show_walikelas,
          demo_show_guru: map.demo_show_guru || prev.demo_show_guru,
          demo_show_gurujaga: map.demo_show_gurujaga || prev.demo_show_gurujaga,
          demo_show_ortu: map.demo_show_ortu || prev.demo_show_ortu,
          demo_show_siswa: map.demo_show_siswa || prev.demo_show_siswa,
        }))
      }).catch(() => {})
  }, [])
  return config
}
