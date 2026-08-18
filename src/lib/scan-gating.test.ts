import { describe, expect, it } from 'bun:test'
import { decideScanAction, type ScanGatingInput } from './scan-gating'

// Fixed "now" and a check-in 2 hours earlier (below the default 4h guard).
const NOW = new Date('2026-08-17T02:00:00.000Z')
const CHECK_IN_2H_AGO = new Date('2026-08-17T00:00:00.000Z')

function base(input: Partial<ScanGatingInput> = {}): ScanGatingInput {
  return {
    hasExistingAttendance: false,
    hasCheckOutTime: false,
    hasCheckInTime: false,
    checkInTime: null,
    sessionShift: null,
    now: NOW,
    minCheckoutHours: 4,
    ...input,
  }
}

describe('decideScanAction — shift gating', () => {
  it('PAGI session refuses a check-out for a student who already checked in', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: true,
        checkInTime: CHECK_IN_2H_AGO,
        sessionShift: 'PAGI',
      })
    )
    expect(decision).toEqual({ kind: 'refused', reason: 'pagi_checkout' })
  })

  it('PAGI session still allows the normal check-in for a student with no record', () => {
    const decision = decideScanAction(base({ sessionShift: 'PAGI' }))
    expect(decision).toEqual({ kind: 'checkin' })
  })

  it('SORE session refuses a check-in for a student with no record', () => {
    const decision = decideScanAction(base({ sessionShift: 'SORE' }))
    expect(decision).toEqual({ kind: 'refused', reason: 'sore_checkin' })
  })

  it('SORE session allows check-out even right after check-in (min-hours guard skipped)', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: true,
        checkInTime: CHECK_IN_2H_AGO, // only 2h ago < default 4h
        sessionShift: 'SORE',
      })
    )
    expect(decision).toEqual({ kind: 'checkout' })
  })

  it('completed record is a no-op regardless of the session', () => {
    for (const sessionShift of ['PAGI', 'SORE', null]) {
      const decision = decideScanAction(
        base({
          hasExistingAttendance: true,
          hasCheckOutTime: true,
          hasCheckInTime: true,
          checkInTime: CHECK_IN_2H_AGO,
          sessionShift,
        })
      )
      expect(decision).toEqual({ kind: 'already_done' })
    }
  })
})

describe('decideScanAction — no active session behaves normally', () => {
  it('student with no record gets a check-in', () => {
    const decision = decideScanAction(base({}))
    expect(decision).toEqual({ kind: 'checkin' })
  })

  it('check-out is allowed once the min hours have elapsed', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: true,
        checkInTime: new Date('2026-08-16T10:00:00.000Z'), // 16h before NOW
      })
    )
    expect(decision).toEqual({ kind: 'checkout' })
  })

  it('check-out is refused within the min-hours guard', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: true,
        checkInTime: CHECK_IN_2H_AGO, // 2h ago < 4h
      })
    )
    expect(decision).toEqual({ kind: 'refused', reason: 'min_checkout_hours' })
  })
})

describe('decideScanAction — min-checkout-hours guard details', () => {
  it('respects the configured threshold', () => {
    // 2h after check-in with a 1h threshold -> allowed
    const allowed = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: true,
        checkInTime: CHECK_IN_2H_AGO,
        minCheckoutHours: 1,
      })
    )
    expect(allowed.kind).toBe('checkout')

    // Same elapsed time with a 3h threshold -> refused
    const refused = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: true,
        checkInTime: CHECK_IN_2H_AGO,
        minCheckoutHours: 3,
      })
    )
    expect(refused).toEqual({ kind: 'refused', reason: 'min_checkout_hours' })
  })

  it('check-out exactly at the threshold is allowed', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: true,
        checkInTime: new Date(NOW.getTime() - 4 * 36e5), // exactly 4h
      })
    )
    expect(decision).toEqual({ kind: 'checkout' })
  })

  it('placeholder record (IZIN/ALPHA) is refused as no_checkin, never by the min-hours guard', () => {
    // Even with an absurdly tiny threshold the placeholder is refused before
    // the guard runs — it can never be "too early" because it's no_checkin.
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: false,
        checkInTime: null,
        minCheckoutHours: 0.1,
      })
    )
    expect(decision).toEqual({ kind: 'refused', reason: 'no_checkin' })
  })
})

describe('decideScanAction — IZIN/ALPHA placeholder records (no check-in today)', () => {
  it('refuses a check-out with no active session', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: false,
        checkInTime: null,
      })
    )
    expect(decision).toEqual({ kind: 'refused', reason: 'no_checkin' })
  })

  it('refuses during a SORE session too (student never checked in)', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: false,
        checkInTime: null,
        sessionShift: 'SORE',
      })
    )
    expect(decision).toEqual({ kind: 'refused', reason: 'no_checkin' })
  })

  it('refuses during a PAGI session with the no-check-in reason', () => {
    const decision = decideScanAction(
      base({
        hasExistingAttendance: true,
        hasCheckInTime: false,
        checkInTime: null,
        sessionShift: 'PAGI',
      })
    )
    expect(decision).toEqual({ kind: 'refused', reason: 'no_checkin' })
  })
})
