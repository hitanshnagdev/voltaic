/**
 * Per-field hallucination guard for citation-backed extraction.
 *
 * The shape: every typed field the model returns is `{value, evidence_quote}`
 * (or null). The `evidence_quote` is the verbatim text the model claims to
 * have read from the document. With Anthropic's citations API enabled,
 * Sonnet attaches `cited_text` spans to its own quoted output. The guard
 * drops any field whose `evidence_quote` doesn't overlap with at least
 * one `cited_text` span — that's the model claiming evidence the API
 * couldn't verify, which is the precise hallucination signature.
 *
 * Why this matters: without the guard, the model can return
 * `{value: 65, evidence_quote: "65 kAIC at 480V"}` even when no such
 * span exists in the PDF. Sonnet hallucinates conservative-looking
 * values when it can't read a field — silent and high-trust. The guard
 * turns those into explicit drops the compare page renders as
 * "missing", not as "65".
 *
 * Reference: docs/DECISIONS.md U13.
 */

import type { DocumentPageCitation } from "@/lib/llm";

/**
 * Citation-backed value the model returns for a single field.
 * `value` carries the data we want; `evidence_quote` is the verbatim
 * quote we verify against citations.
 */
export type CitableField<T> = {
  value: T;
  evidence_quote: string;
} | null;

/**
 * One field that survived the guard, plus the page number from the
 * citation that backs it.
 */
export type VerifiedField<T> = {
  value: T;
  evidenceQuote: string;
  /** Page from the citation whose `cited_text` contains the quote (1-indexed). */
  pageNum: number;
};

/**
 * One field the guard rejected, with the reason. Caller can log these
 * for debugging without persisting them.
 */
export type DroppedField = {
  fieldName: string;
  reason: "no_citation_support" | "malformed" | "empty_quote";
  evidenceQuote: string | null;
  rawValue: unknown;
};

/**
 * Marks a field that survived the guard via the empty-citations
 * fallback path: the model produced an evidence_quote, but the API
 * returned no citations to verify against. We accept the field with
 * the model's own primary_page (or 1) and flag it so callers can log
 * how often this fallback fires (regression signal if it spikes).
 */
export type FallbackInfo = {
  fieldName: string;
  reason: "no_citations_returned";
  evidenceQuote: string;
};

/**
 * Threshold for token-overlap matching. The quote must share at least
 * this fraction of its significant tokens with a citation to count as
 * supported. 0.5 catches paraphrasing but rejects "model invented a
 * quote that shares one or two filler words with the doc".
 *
 * Why 0.5 and not stricter: in practice Sonnet's evidence_quote often
 * mixes verbatim spans with light rewording (e.g. quote says "AIC: 42
 * kA at 480V", citation says "AIC: 42 kA RMS symmetrical at 480Y/277V
 * (series-rated)"). The numeric core matches verbatim; surrounding
 * prose drifts. 0.5 lets the numeric core carry the day without being
 * fooled by garbage like "AIC: 100 kA at 240V" vs a citation about
 * 65 kA — the distinctive tokens (100, 240) miss entirely.
 */
const OVERLAP_THRESHOLD = 0.5;

/**
 * Tokenize for overlap. Splits on non-alphanumeric, lowercases,
 * drops single-char tokens (mostly punctuation noise like `&`, `-`).
 * Numeric tokens are kept regardless of length — "1" and "65" are
 * both meaningful (NEMA 1, AIC 65).
 */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => {
      if (!t) return false;
      // Keep numerics of any length; require alphas to be 2+ chars.
      if (/^\d/.test(t)) return true;
      return t.length >= 2;
    });
}

/**
 * Symmetric overlap score. Returns the larger of:
 *   - fraction of quote tokens present in the citation
 *   - fraction of citation tokens present in the quote
 *
 * Symmetric matters because quote and citation can be either direction:
 *   - Citation longer (model quotes a slice): "Series-rated combination"
 *     in quote "Series-rated combination with 65 kAIC upstream breaker"
 *     → citation 3/3 covered, quote 3/8 covered → max = 1.0
 *   - Quote longer (model paraphrases the doc tightly): "65 kAIC at 480V"
 *     in citation "AIC: 65 kAIC at 480Y/277V (fully rated)"
 *     → quote 3/4 covered, citation 3/9 covered → max = 0.75
 *
 * The shorter side fully contained in the longer signals a real match;
 * one-direction-only lets one of those cases drop a legitimate quote.
 */
function overlapFraction(quoteTokens: string[], citationTokens: string[]): number {
  if (quoteTokens.length === 0 || citationTokens.length === 0) return 0;
  const qSet = new Set(quoteTokens);
  const cSet = new Set(citationTokens);
  let qInC = 0;
  for (const t of qSet) if (cSet.has(t)) qInC++;
  // qInC also equals cInQ when computed over sets, but we still want
  // separate fractions because qSet.size and cSet.size differ.
  const qFrac = qInC / qSet.size;
  const cFrac = qInC / cSet.size;
  return Math.max(qFrac, cFrac);
}

/**
 * Returns true when at least one citation in `citations` shares
 * `OVERLAP_THRESHOLD` of the quote's significant tokens. This catches
 * paraphrased quotes (model summarized) while rejecting fabricated
 * quotes that share only filler words with the doc.
 *
 * Real-world examples:
 *   - Quote `"65 kAIC at 480V"`
 *     Citation `"AIC: 65 kAIC at 480Y/277V (fully rated standalone)"`
 *     → quote tokens [65, kaic, at, 480v]; citation has 65, kaic, at;
 *       480v misses (citation has 480y instead) → 3/4 = 0.75 ≥ 0.5 ✓
 *   - Quote `"AIC: 100 kA at 240V"` (HALLUCINATION — doc says 65/480)
 *     Citation `"AIC: 65 kAIC at 480Y/277V"`
 *     → quote tokens [aic, 100, ka, at, 240v]; citation matches aic, at;
 *       100, ka, 240v all miss → 2/5 = 0.4 < 0.5 ✗
 *
 * Exported for unit tests.
 */
export function hasSupportingCitation(
  quote: string | null | undefined,
  citations: DocumentPageCitation[],
): boolean {
  if (typeof quote !== "string") return false;
  const qTokens = tokenize(quote);
  if (qTokens.length === 0) return false;
  for (const c of citations) {
    const cTokens = tokenize(c.citedText);
    if (cTokens.length === 0) continue;
    if (overlapFraction(qTokens, cTokens) >= OVERLAP_THRESHOLD) return true;
  }
  return false;
}

/**
 * Find the citation with the highest token overlap to the quote. Used
 * to pick a per-field page number — better than relying on the model's
 * self-reported `primary_page` since it's API-verified. Returns null
 * when no citation meets the threshold.
 */
export function findCitationForQuote(
  quote: string,
  citations: DocumentPageCitation[],
): DocumentPageCitation | null {
  const qTokens = tokenize(quote);
  if (qTokens.length === 0) return null;
  let best: { c: DocumentPageCitation; score: number } | null = null;
  for (const c of citations) {
    const cTokens = tokenize(c.citedText);
    if (cTokens.length === 0) continue;
    const score = overlapFraction(qTokens, cTokens);
    if (score < OVERLAP_THRESHOLD) continue;
    if (!best || score > best.score) best = { c, score };
  }
  return best?.c ?? null;
}

/**
 * Apply the guard to one field. Returns a verified field (with the
 * page from its supporting citation) or null + a dropped record.
 *
 * Type guard semantics:
 *   - field is `null`                        → returned as null, NOT dropped
 *   - field is malformed (missing keys)      → dropped (reason: malformed)
 *   - quote is empty/whitespace              → dropped (reason: empty_quote)
 *   - citations is non-empty + no overlap    → dropped (reason: no_citation_support)
 *   - citations is empty + non-empty quote   → ACCEPTED via fallback path
 *
 * Why the fallback: in practice Anthropic's citations API doesn't
 * always return cited_text spans for every PDF (image-rendered pages,
 * complex form layouts, certain fonts). When the API returns zero
 * citations across the entire response, we can't distinguish "model
 * hallucinated" from "API didn't have anything to cite" — and the
 * pessimistic default (drop everything) is silently catastrophic:
 * the user sees an empty submittal_fields row carrying just an
 * extraction_notes blob, even though the model extracted everything
 * correctly from the document.
 *
 * The fallback is conservative: requires a non-empty evidence_quote
 * (so the model committed to specific text), passes the field through
 * with the optional fallbackPage (model's primary_page is the typical
 * caller value), and emits a FallbackInfo record so the caller can
 * log the rate of empty-citations fallbacks for monitoring. If the
 * citations array is non-empty, the strict overlap check still runs
 * and hallucinated quotes still get dropped.
 */
export function verifyField<T>(
  fieldName: string,
  field: unknown,
  citations: DocumentPageCitation[],
  fallbackPage = 1,
): {
  verified: VerifiedField<T> | null;
  dropped: DroppedField | null;
  fallback: FallbackInfo | null;
} {
  if (field == null) {
    return { verified: null, dropped: null, fallback: null };
  }
  if (
    typeof field !== "object" ||
    !("value" in field) ||
    !("evidence_quote" in field)
  ) {
    return {
      verified: null,
      dropped: {
        fieldName,
        reason: "malformed",
        evidenceQuote: null,
        rawValue: field,
      },
      fallback: null,
    };
  }
  const f = field as { value: unknown; evidence_quote: unknown };
  const quote = typeof f.evidence_quote === "string" ? f.evidence_quote : "";
  if (!quote.trim()) {
    return {
      verified: null,
      dropped: {
        fieldName,
        reason: "empty_quote",
        evidenceQuote: null,
        rawValue: f.value,
      },
      fallback: null,
    };
  }

  // Empty-citations fallback: API returned no spans to verify against,
  // so we can't distinguish hallucination from API limitation. Trust
  // the model's evidence_quote; tag with FallbackInfo for monitoring.
  if (citations.length === 0) {
    return {
      verified: {
        value: f.value as T,
        evidenceQuote: quote,
        pageNum: fallbackPage > 0 ? fallbackPage : 1,
      },
      dropped: null,
      fallback: { fieldName, reason: "no_citations_returned", evidenceQuote: quote },
    };
  }

  const citation = findCitationForQuote(quote, citations);
  if (!citation) {
    return {
      verified: null,
      dropped: {
        fieldName,
        reason: "no_citation_support",
        evidenceQuote: quote,
        rawValue: f.value,
      },
      fallback: null,
    };
  }
  return {
    verified: {
      value: f.value as T,
      evidenceQuote: quote,
      pageNum: citation.startPageNumber,
    },
    dropped: null,
    fallback: null,
  };
}
