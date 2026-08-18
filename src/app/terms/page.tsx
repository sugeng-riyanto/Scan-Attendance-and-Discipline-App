import { TermsPage } from '@/components/dashboard/terms-page'

// Public view of the Syarat & Ketentuan, linked from the login acceptance checkbox.
// No authentication is required to read the terms.
export default function TermsRoute() {
  return (
    <div className="min-h-screen bg-gray-50 py-6 dark:bg-gray-950">
      <TermsPage
        publicView
        user={{ id: 'guest', username: '', name: 'Pengunjung', role: 'GUEST' }}
      />
      <div className="max-w-4xl mx-auto px-4 pb-8 text-center">
        <a href="/" className="text-sm text-muted-foreground hover:underline">
          &larr; Kembali ke halaman login
        </a>
      </div>
    </div>
  )
}
