'use client'

import React from 'react'
import { useParams } from 'next/navigation'
import SchoolApp from '@/components/dashboard/school-app'

// Per-school landing page: /s/:code opens straight into that school's branded
// login (name, address, logo, accent color) when logged out — each school has
// its own shareable URL instead of sharing one picker — and shows the
// dashboard when already authenticated (e.g. after the middleware rewrites a
// school's subdomain root "/" here). Unknown codes render the login screen's
// "sekolah tidak ditemukan" card with a link back to the directory at "/".
export default function SchoolLandingPage() {
  const params = useParams<{ code: string }>()
  const code = Array.isArray(params.code) ? params.code[0] : params.code
  return <SchoolApp initialSchoolCode={code} />
}
