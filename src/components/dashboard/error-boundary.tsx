'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { useAppStore } from '@/lib/stores/app-store'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <AlertTriangle className="h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Terjadi Kesalahan</h2>
          <p className="text-gray-500 mb-6 max-w-md">
            Maaf, terjadi kesalahan yang tidak terduga. Silakan coba refresh halaman.
          </p>
          {this.state.error && (
            <details className="mb-6 text-left w-full max-w-md">
              <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-600">
                Detail Error
              </summary>
              <pre className="mt-2 text-xs bg-red-50 p-3 rounded-md overflow-auto max-h-32 text-red-700">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <ErrorBoundaryResetButton />
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function ErrorBoundaryResetButton() {
  const setActivePage = useAppStore((s) => s.setActivePage)
  return (
    <Button onClick={() => { setActivePage('dashboard'); window.location.hash = '' }}>
      <Home className="h-4 w-4 mr-2" /> Ke Dashboard
    </Button>
  )
}
