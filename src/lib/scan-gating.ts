/**
 * Pure decision logic for the public-scan route's attendance actions.
 *
 * The rules (historically implemented inline in the route, now isolated so
 * they can be unit-tested without a database):
 *  - A completed record today (has check-out time) -> `already_done` (no-op).
 *  - A placeholder record (exists but has NO check-in time — e.g. an
 *    IZIN/ALPHA/SAKIT row seeded for the day) is refused a check-out in every
 *    session: stamping a check-out on a student who never checked in is
 *    meaningless (`no_checkin`).
 *  - An active PAGI session only allows check-in -> a student who already
 *    checked in is refused a check-out.
 *  - The min-checkout-hours guard refuses a check-out shortly after check-in
 *    (configurable via SchoolConfig `min_checkout_hours`, default 4), EXCEPT
 *    during an active SORE session where check-out is the expected dismissal
 *    action.
 *  - An active SORE session only allows check-out -> a student with no record
 *    yet is refused a check-in.
 *  - No active session (or a session without a shift) behaves normally:
 *    check-in when there's no record, check-out (subject to the min-hours
 *    guard) when there is one.
 */

export type ScanDecision =
  | { kind: 'already_done' }
  | { kind: 'refused'; reason: 'pagi_checkout' | 'min_checkout_hours' | 'sore_checkin' | 'no_checkin' }
  | { kind: 'checkout' }
  | { kind: 'checkin' }

export interface ScanGatingInput {
  hasExistingAttendance: boolean
  hasCheckOutTime: boolean
  hasCheckInTime: boolean
  checkInTime: Date | null
  /** 'PAGI' | 'SORE' | null (no active session or no shift = no gating) */
  sessionShift: string | null
  /** Current time, used to measure time since check-in */
  now: Date
  /** SchoolConfig `min_checkout_hours` value (default 4) */
  minCheckoutHours: number
}

export function decideScanAction(input: ScanGatingInput): ScanDecision {
  const {
    hasExistingAttendance,
    hasCheckOutTime,
    hasCheckInTime,
    checkInTime,
    sessionShift,
    now,
    minCheckoutHours,
  } = input

  if (!hasExistingAttendance) {
    // No record today: normal behavior is a check-in, unless the active
    // session is SORE (check-out only).
    if (sessionShift === 'SORE') {
      return { kind: 'refused', reason: 'sore_checkin' }
    }
    return { kind: 'checkin' }
  }

  // A completed record is always a no-op, whatever the session.
  if (hasCheckOutTime) {
    return { kind: 'already_done' }
  }

  // A placeholder record (no check-in time — IZIN/ALPHA/SAKIT row) means the
  // student never checked in today, so a check-out is meaningless. Refuse it
  // in every session, before any session-specific rule can fall through to
  // `checkout` (and before the min-hours guard, so it's never "too early").
  if (!hasCheckInTime) {
    return { kind: 'refused', reason: 'no_checkin' }
  }

  // PAGI sessions are check-in only.
  if (sessionShift === 'PAGI') {
    return { kind: 'refused', reason: 'pagi_checkout' }
  }

  // Min-checkout-hours guard (skipped during SORE, where check-out is the
  // expected dismissal action).
  if (sessionShift !== 'SORE' && checkInTime) {
    const elapsedHours = (now.getTime() - checkInTime.getTime()) / 36e5
    if (elapsedHours < minCheckoutHours) {
      return { kind: 'refused', reason: 'min_checkout_hours' }
    }
  }

  return { kind: 'checkout' }
}
