/**
 * Confidence ladder for findings and identity resolution.
 *
 * The shared scale exists because every rule and every identity resolver
 * makes the same kind of judgment ("how much should downstream trust this
 * value?"), and inline magic numbers drift between modules over time. By
 * naming the rungs we make the ladder visible and tunable in one place
 * when the eval harness gives us recall/precision data to retune against.
 *
 * Ladder semantics, not numerics. Don't read meaning into the gaps —
 * they're calibrated against the rough relative trust we want the UI to
 * convey, not against a probability.
 *
 * Used by:
 *   - lib/rag/rules/aic.ts
 *   - lib/rag/identity.ts
 *   - future rules (sccr, enclosure, ampacity, coordination, spec_drift)
 *   - future identity resolvers (drawing title block, submittal stamp)
 */

/**
 * Confidence the *finding* is correct. Used by rule evaluators.
 *
 * "Strong" means the rule fired with primary evidence on both sides
 * (submitted value + spec citation). "Medium" means one side is a
 * fallback (e.g. project setting). "Weak" means at least one side is
 * absent and the finding is uncertain.
 */
export const FindingConfidence = {
  /** Both sides cited from primary evidence. Spec + submittal. */
  STRONG: 0.95,
  /** Numeric comparison ran but one side is project default, not spec. */
  MEDIUM: 0.7,
  /** Required side known, value side missing. Cool/uncertain. */
  WEAK_MISSING_VALUE: 0.6,
  /** Required side from project default, value side missing. */
  WEAK_FALLBACK_MISSING_VALUE: 0.4,
  /** Value present, no requirement to compare against. Cool/uncertain. */
  WEAK_MISSING_REQUIREMENT: 0.3,
} as const;

/**
 * Confidence the *identity* of a document was correctly resolved.
 * Used by lib/rag/identity.ts and future drawing/submittal resolvers.
 */
export const IdentityConfidence = {
  /** Header / stamp matched cleanly. Single CSI section, sheet number, etc. */
  HEADER: 0.95,
  /** Header matched but multiple sections — common, just slightly less crisp. */
  MULTIPLE_HEADER: 0.9,
  /** No header, fell back to filename hint. Always low-trust by design. */
  FILENAME: 0.5,
  /** Nothing matched. */
  NONE: 0,
} as const;

export type FindingConfidenceLevel =
  (typeof FindingConfidence)[keyof typeof FindingConfidence];
export type IdentityConfidenceLevel =
  (typeof IdentityConfidence)[keyof typeof IdentityConfidence];
