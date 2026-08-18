import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Clock, GraduationCap, Mail, Phone } from 'lucide-react'

// The public profile fields the school landing page (/s/:code) shows. Kept in
// sync with School + SchoolForm so the Super Admin edit dialog can preview the
// exact same card the landing page renders.
export interface SchoolLandingData {
  code?: string | null
  name?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  hasJhs?: boolean
  hasShs?: boolean
  vision?: string | null
  mission?: string | null
  description?: string | null
  headerImage?: string | null
  logo?: string | null
  themeColor?: string | null
  jhsStart?: string | null
  jhsEnd?: string | null
  shsStart?: string | null
  shsEnd?: string | null
}

export function SchoolLandingProfile({
  school,
  fallbackTheme,
}: {
  school: SchoolLandingData
  fallbackTheme: string
}) {
  const displayTheme = school.themeColor || fallbackTheme
  const displayName = school.name || 'Sekolah'
  const displayAddress = school.address || undefined
  const displayLogo = school.logo || undefined

  return (
    <Card className="mb-4 overflow-hidden">
      {school.headerImage && (
        <img src={school.headerImage} alt={`Header ${displayName}`}
          className="h-32 sm:h-40 w-full object-cover" />
      )}
      <CardContent className="p-5">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white" style={{ backgroundColor: displayTheme }}>
            {displayLogo ? (
              <img src={displayLogo} alt="Logo" className="h-10 w-10 rounded-full object-contain" />
            ) : (
              <GraduationCap className="h-8 w-8" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold" style={{ color: displayTheme }}>{displayName}</h3>
              {school.code && <Badge variant="outline" className="text-xs">{school.code}</Badge>}
            </div>
            {displayAddress && <p className="text-sm text-muted-foreground mt-1">{displayAddress}</p>}
            {(school.phone || school.email) && (
              <p className="text-xs text-muted-foreground mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {school.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {school.phone}</span>}
                {school.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {school.email}</span>}
              </p>
            )}
            {(school.hasJhs || school.hasShs) && (
              <div className="flex flex-wrap gap-2 mt-2">
                {school.hasJhs && <Badge className="text-xs" style={{ backgroundColor: `${displayTheme}20`, color: displayTheme }}>JHS (SMP)</Badge>}
                {school.hasShs && <Badge className="text-xs" style={{ backgroundColor: `${displayTheme}20`, color: displayTheme }}>SHS (SMA)</Badge>}
              </div>
            )}
          </div>
        </div>

        {school.description && <p className="text-sm leading-relaxed mt-4">{school.description}</p>}

        {(school.vision || school.mission) && (
          <div className="grid sm:grid-cols-2 gap-4 mt-4">
            {school.vision && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visi</p>
                <p className="text-sm mt-1 italic leading-relaxed">{school.vision}</p>
              </div>
            )}
            {school.mission && (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Misi</p>
                <p className="text-sm mt-1 leading-relaxed whitespace-pre-line">{school.mission}</p>
              </div>
            )}
          </div>
        )}

        {(school.hasJhs || school.hasShs) && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Jadwal Masuk & Pulang</p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800/50">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Jenjang</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Jam Masuk</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Jam Pulang</th>
                  </tr>
                </thead>
                <tbody>
                  {school.hasJhs && (
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">JHS (SMP)</td>
                      <td className="px-3 py-2">{school.jhsStart || '07:00'}</td>
                      <td className="px-3 py-2">{school.jhsEnd || '14:50'}</td>
                    </tr>
                  )}
                  {school.hasShs && (
                    <tr className="border-t">
                      <td className="px-3 py-2 font-medium">SHS (SMA)</td>
                      <td className="px-3 py-2">{school.shsStart || '07:00'}</td>
                      <td className="px-3 py-2">{school.shsEnd || '15:30'}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
