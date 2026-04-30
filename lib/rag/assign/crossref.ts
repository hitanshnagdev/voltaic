import "server-only";

/**
 * Cross-reference detector — does the submittal explicitly cite a
 * CSI section that maps to one of the project's spec PDFs?
 *
 * This is a *deterministic, free* signal — pure regex, no LLM call.
 * When it hits, we have direct textual evidence the submittal answers
 * a specific spec section: the cover transmittal, stamp, or first
 * page literally names "Section 26 24 16" or similar.
 *
 * That's a strictly stronger signal than the Sonnet cover-text matcher
 * (which is "what is this submittal *about*"). Cross-ref says "this
 * submittal claims to answer this spec," not just "this submittal
 * looks like it could be about panelboards."
 *
 * Output is the set of CSI section strings found in the input text,
 * in canonical "26 24 16" form. Caller intersects against the
 * project's spec identities to find a real pair.
 */

// CSI MasterFormat: division-section-subsection, all 2-digit numerics.
// Accepts both space-delimited ("26 24 16") and hyphen-delimited
// ("26-24-16") because both appear in the wild.
//
// Negative lookarounds prevent matching mid-number runs like phone
// numbers ("415 555 1234") or timestamps. The boundary on either end
// is "not another digit / not the start of a longer numeric run".
const CSI_SECTION_RE = /(?<![0-9-])(\d{2})[\s-](\d{2})[\s-](\d{2})(?![0-9-])/g;

/**
 * CSI divisions that are within Voltaic v1 scope. Restricting the
 * extraction prevents false positives from random "20 25 30" style
 * numerics in tables, addresses, etc.
 *
 * 26 — Electrical (primary v1 focus)
 * 27 — Communications
 * 28 — Electronic safety + security
 *
 * Expand when MEP scope opens up (CLAUDE.md "explicitly NOT in v1").
 */
const IN_SCOPE_DIVISIONS = new Set(["26", "27", "28"]);

/**
 * Extract canonical CSI section strings from arbitrary text.
 *
 * - Returns deduped, in-scope CSI section ids in "DD DD DD" form
 *   (single space between groups).
 * - Order matches first-occurrence order for stable downstream
 *   tie-breaking when multiple sections are referenced.
 */
export function extractCsiCrossRefs(text: string): string[] {
  if (!text || text.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(CSI_SECTION_RE)) {
    const [, a, b, c] = match;
    if (!IN_SCOPE_DIVISIONS.has(a)) continue;
    const canonical = `${a} ${b} ${c}`;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

export type CrossRefMatch = {
  specDocumentId: string;
  csiSection: string;
};

/**
 * Match extracted cross-refs against project spec identities. A spec
 * matches when one of its declared `identity.csi_sections` equals any
 * of the cross-refs found in the submittal text.
 *
 * Returns the first matching pair (or null). When the submittal cites
 * multiple sections, we pick the one matching the earliest-occurring
 * cross-ref — that's typically the "primary" section called out on
 * the cover/stamp.
 *
 * If multiple specs claim the same CSI section, we pick the first
 * candidate by input order. The caller sorts candidates by recency
 * (uploaded_at desc) so the most recent spec wins; that's the right
 * default for revisions.
 */
export function matchCrossRefAgainstSpecs(args: {
  refs: string[];
  candidates: { documentId: string; csiSections: string[] }[];
}): CrossRefMatch | null {
  for (const ref of args.refs) {
    for (const c of args.candidates) {
      if (c.csiSections.includes(ref)) {
        return { specDocumentId: c.documentId, csiSection: ref };
      }
    }
  }
  return null;
}
