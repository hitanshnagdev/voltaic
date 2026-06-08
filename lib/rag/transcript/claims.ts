/**
 * Transcript claim extraction (meeting layer).
 *
 * Interpretive step — spoken language is messy, so an LLM resolves the
 * claim ("let's drop the main panel to 42 kAIC") into a structured
 * {equipmentTag, value} tuple, grounded against the project's *known*
 * equipment tags (it must return one of them, never invent). The
 * downstream comparison against the spec is then fully deterministic
 * (reuses lib/rag/rules/aic.ts `extractRequiredKaFromSpec`), matching the
 * codebase principle: LLM where necessary, deterministic where possible.
 *
 * Increment 2 scope: AIC / interrupting-rating claims only (the path with a
 * spec-side extractor today). The shape generalizes to SCCR / NEMA / voltage
 * when their extractors land.
 */

export type TranscriptAicClaim = {
  /** Ordinal (idx) of the utterance the claim came from. */
  utteranceIdx: number;
  /** Resolved to one of the project's known equipment tags. */
  equipmentTag: string;
  /** The rating exactly as spoken, e.g. "42 kAIC". */
  valueRaw: string;
  /** The relevant phrase from the utterance. */
  quote: string;
};

export type ClaimExtraction = { claims: TranscriptAicClaim[] };

export const CLAIM_SYSTEM = `You extract spoken equipment interrupting-rating (AIC / kAIC) claims from a construction project meeting transcript.

You are given numbered utterances and the project's KNOWN equipment tags. Return ONLY explicit spoken claims where someone states a numeric AIC / interrupting rating for a specific piece of equipment (e.g. "let's value-engineer the main panel down to 42 kAIC", "the switchboard is rated 65 kA").

Rules:
- equipmentTag MUST be exactly one of the provided known tags. If the speaker's reference cannot be confidently matched to a known tag, OMIT the claim — never invent a tag.
- valueRaw is the rating exactly as said, including units (e.g. "42 kAIC").
- quote is the relevant phrase from the utterance.
- Never invent values. Ignore hypotheticals that don't name a number.
- If there are no qualifying claims, return {"claims": []}.

Reply with JSON only:
{"claims":[{"utteranceIdx":<int>,"equipmentTag":"<one of the known tags>","valueRaw":"<text>","quote":"<text>"}]}`;
