/**
 * The labels and the writer shapes for per-user T&C acceptance provenance.
 *
 * These need no database or dev server, and they are worth pinning separately
 * from the E2E suite because three surfaces in the admin panel render the same
 * row — the table, the CSV export and the XLSX export — and the sentence shown to
 * the account holder themselves is written from the same fields. A wording change
 * that quietly turned "Not recorded" into "Self" would be a consent record
 * claiming something nobody recorded, so it fails here.
 */
import { describe, expect, it } from 'bun:test'
import {
  acceptanceOnBehalf,
  provenanceKind,
  provenanceRecordedBy,
  provenanceSentence,
  provenanceShortLabel,
  selfAcceptance,
} from '@/lib/terms-provenance'

describe('T&C acceptance provenance', () => {
  it('writes the actor into the self-acceptance shape', () => {
    expect(selfAcceptance({ id: 'u1', username: 'siswa1' })).toEqual({
      termsAcceptedBy: 'siswa1',
      termsAcceptedByUserId: 'u1',
      termsAcceptedOnBehalf: false,
    })
  })

  it('writes the actor into the on-behalf shape, and flags it', () => {
    expect(acceptanceOnBehalf({ id: 'u0', username: 'admin' })).toEqual({
      termsAcceptedBy: 'admin',
      termsAcceptedByUserId: 'u0',
      termsAcceptedOnBehalf: true,
    })
  })

  it('has three kinds, not two: no actor means unknown', () => {
    expect(provenanceKind({ acceptedBy: 'siswa1', onBehalf: false })).toBe('self')
    expect(provenanceKind({ acceptedBy: 'admin', onBehalf: true })).toBe('admin')
    expect(provenanceKind({ acceptedBy: null, onBehalf: false })).toBe('unknown')
    expect(provenanceKind(undefined)).toBe('unknown')
  })

  it('never reports an unrecorded acceptance as self', () => {
    // The row a pre-provenance acceptance leaves behind: accepted, and no actor.
    const legacy = { acceptedBy: null, onBehalf: false }
    expect(provenanceShortLabel(legacy)).toBe('Not recorded')
    expect(provenanceRecordedBy(legacy)).toBe('')
    expect(provenanceSentence(legacy, new Date('2026-09-17T00:00:00Z'))).toContain('unknown')

    // The distinction the whole change exists for: an administrator's act reads
    // differently from the account holder's, in the same column.
    expect(provenanceShortLabel({ acceptedBy: 'admin', onBehalf: true })).toBe('Admin (on behalf)')
    expect(provenanceShortLabel({ acceptedBy: 'siswa1', onBehalf: false })).toBe('Self')
    expect(provenanceRecordedBy({ acceptedBy: 'admin', onBehalf: true })).toBe('admin')
  })

  it('names the administrator and the fact it was not clicked by the user', () => {
    const sentence = provenanceSentence(
      { acceptedBy: 'admin', onBehalf: true },
      new Date('2026-09-17T10:00:00Z'),
    )
    expect(sentence).toContain('admin')
    expect(sentence).toContain('not clicked by the user')

    expect(provenanceSentence({ acceptedBy: 'siswa1', onBehalf: false })).toContain(
      'account holder (siswa1)',
    )
  })
})
