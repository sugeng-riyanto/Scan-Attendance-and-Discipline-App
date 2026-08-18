'use client'

import React, { useEffect } from 'react'
import { useAuthStore } from '@/lib/stores/auth-store'
import { useSchoolConfig } from './hooks/use-school-config'
import { LoginScreen } from './login-screen'
import { MainApp } from './main-app'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'

export default function SchoolApp({ initialSchoolCode }: { initialSchoolCode?: string }) {
  const { isAuthenticated, user } = useAuthStore()
  const schoolConfig = useSchoolConfig()
  // After login, the user's own school branding wins (each school has its own
  // name/logo/accent on its login page and app header).
  const brandedConfig = user?.school
    ? {
        ...schoolConfig,
        school_name: user.school.name || schoolConfig.school_name,
        school_address: user.school.address || schoolConfig.school_address,
        school_logo: user.school.logo || schoolConfig.school_logo,
      }
    : schoolConfig
  const themeColor = user?.school?.themeColor || schoolConfig.theme_color || '#10b981'

  useEffect(() => {
    if (schoolConfig.school_logo) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link')
      link.rel = 'icon'
      link.type = 'image/png'
      link.href = schoolConfig.school_logo
      document.head.appendChild(link)
    }
  }, [schoolConfig.school_logo])

  // The sonner <Toaster /> normally lives inside the dashboard shell, so
  // without this the login screen's toasts (T&C gate, login errors, setup
  // feedback) would be silent no-ops.
  return (
    <div style={{ ['--theme-color' as string]: themeColor }} suppressHydrationWarning>
      {isAuthenticated ? (
        <MainApp schoolConfig={brandedConfig} themeColor={themeColor} />
      ) : (
        <>
          <LoginScreen schoolConfig={schoolConfig} themeColor={themeColor} initialSchoolCode={initialSchoolCode} />
          <SonnerToaster />
        </>
      )}
    </div>
  )
}
