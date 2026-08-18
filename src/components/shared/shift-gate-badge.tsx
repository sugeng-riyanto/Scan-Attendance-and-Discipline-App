'use client'

import { Clock } from 'lucide-react'

/**
 * Pill showing which gate the active scan session enforces, matching the
 * /scan kiosk display: PAGI = check-in only (yellow), SORE = check-out only
 * (orange). Used by the kiosk status bar and the dashboard widget.
 */
export function ShiftGateBadge({ shift }: { shift: string }) {
  const isPag = shift === 'PAGI'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
      isPag
        ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
        : 'bg-orange-100 text-orange-700 border border-orange-300'
    }`}>
      <Clock className="h-3 w-3" />
      {isPag ? 'PAGI · Check-in' : 'SORE · Check-out'}
    </span>
  )
}
