'use client'

import React, { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useSchoolConfig } from './hooks/use-school-config'
import { LoginScreen } from './login-screen'
import { MainApp } from './main-app'

export default function SchoolApp() {
  const { isAuthenticated } = useAuthStore()
  const schoolConfig = useSchoolConfig()
  const themeColor = schoolConfig.theme_color || '#10b981'

  useEffect(() => {
    if (schoolConfig.school_logo) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/png'
      link.href = schoolConfig.school_logo
      document.head.appendChild(link)
    }
  }, [schoolConfig.school_logo])

  return (
    <div style={{ ['--theme-color' as string]: themeColor }}>
      {isAuthenticated ? <MainApp schoolConfig={schoolConfig} themeColor={themeColor} /> : <LoginScreen schoolConfig={schoolConfig} themeColor={themeColor} />}
    </div>
  )
}
