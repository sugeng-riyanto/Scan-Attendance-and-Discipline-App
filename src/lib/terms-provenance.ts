/**
 * Per-user provenance for a T&C acceptance.
 *
 * `termsAcceptedAt` / `termsAcceptedVersion` say *what* was agreed and when. They
 * do not say **who put it there**, and that is the question a consent record has
 * to answer per person: the app's own UU PDP framing means a school must be able
 * to show whether an account holder accepted the terms themselves or an
 * administrator recorded it for them. Three fields carry it, and they mirror what
 * `AuditLog` already does — an id that survives a rename, plus the username the
 * record read as at the time.
 *
 * `termsAcceptedBy` is null for acceptances written before this existed. That is
 * deliberately *not* rendered as "self": it means "not recorded", which is the
 * truth, and it is why the kind below has three states rather than a boolean.
 * Backfilling those rows as self-accepted would be inventing consent, so nothing
 * does — they stay unknown until the user or an administrator accepts again.
 *
 * The writers all take their `data` from here (`selfAcceptance` /
 * `acceptanceOnBehalf`) so the three paths that can record an acceptance cannot
 * drift apart, and every reader labels them from here so the table, the CSV and
 * the XLSX export cannot disagree about what a row means.
 */

export type AcceptanceProvenance = {
  acceptedBy?: string | null
  acceptedByUserId?: string | null
  onBehalf?: boolean | null
}

export type ProvenanceActor = { id: string; username: string }

/** The account holder ticking the box: the login screen, or the T&C page button. */
export function selfAcceptance(actor: ProvenanceActor) {
  return {
    termsAcceptedBy: actor.username,
    termsAcceptedByUserId: actor.id,
    termsAcceptedOnBehalf: false,
  }
}

/**
 * An administrator recording acceptance for an account that is not their own.
 * The caller's *own* row is deliberately never written this way — see
 * `POST /api/terms-accept-bulk`, which splits the two cases: nobody can hold a
 * mandate from themselves, and recording it that way would make the trail claim
 * an authority that was never exercised.
 */
export function acceptanceOnBehalf(actor: ProvenanceActor) {
  return {
    termsAcceptedBy: actor.username,
    termsAcceptedByUserId: actor.id,
    termsAcceptedOnBehalf: true,
  }
}

export type ProvenanceKind = 'self' | 'admin' | 'unknown'

/** `unknown` is a third answer, not a default: no actor was ever recorded. */
export function provenanceKind(p: AcceptanceProvenance | null | undefined): ProvenanceKind {
  if (!p || !p.acceptedBy) return 'unknown'
  return p.onBehalf ? 'admin' : 'self'
}

/** Short label for the acceptance table and the exports. */
export function provenanceShortLabel(p: AcceptanceProvenance | null | undefined): string {
  switch (provenanceKind(p)) {
    case 'admin':
      return 'Admin (on behalf)'
    case 'self':
      return 'Self'
    default:
      return 'Not recorded'
  }
}

/** The username the acceptance is attributable to, or `''` when unknown. */
export function provenanceRecordedBy(p: AcceptanceProvenance | null | undefined): string {
  return p?.acceptedBy ?? ''
}

/**
 * One sentence for a tooltip or a record's own page — the long form of
 * `provenanceShortLabel`, and the only place that phrasing lives.
 */
export function provenanceSentence(
  p: AcceptanceProvenance | null | undefined,
  acceptedAt?: Date | string | null,
): string {
  const when = acceptedAt ? ` on ${new Date(acceptedAt).toLocaleDateString()}` : ''
  switch (provenanceKind(p)) {
    case 'admin':
      return `Recorded${when} by administrator ${p!.acceptedBy} for this account — not clicked by the user.`
    case 'self':
      return `Accepted${when} by the account holder (${p!.acceptedBy}).`
    default:
      return 'No provenance recorded — this acceptance predates provenance tracking, so who recorded it is unknown.'
  }
}
