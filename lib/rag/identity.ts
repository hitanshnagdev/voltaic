/**
 * Document identity resolution.
 *
 * Every ingested PDF needs a structured "identity" — the handle the rest of
 * the system uses to join it into the project (CSI sections for specs, sheet
 * number for drawings, submittal log entry for submittals). Getting this right
 * is what lets the cross-reference step ask deterministic questions like
 * "which submittals apply to 26 24 16" without relying on filenames.
 *
 * This module is the first pass: regex-first, deterministic, and confined to
 * spec documents. Drawing title-block vision and submittal-stamp vision land
 * as separate PRs.
 *
 * Layering (per CLAUDE.md Stage 2a):
 *   1. header / stamp extraction — this module (header regex only for specs)
 *   2. seed-map inference — future, after equipment extraction
 *   3. LLM inference — future, when regex recall is measured
 *   4. filename hint — implemented here as a last-resort fallback, always
 *      flagged in `identified_via` so downstream knows to treat it skeptically
 *
 * The `DocumentIdentity` shape matches the jsonb column documented in
 * `documents.identity`.
 */

import { IdentityConfidence } from "./confidence";
import { matchSection, normalizeCsiNumber } from "./parse/csi";

// ----------------------------------------------------------------------------
// types
// ----------------------------------------------------------------------------

export type IdentifiedVia =
  | "header"
  | "stamp"
  | "seed_map"
  | "llm"
  | "filename"
  | "multiple"
  | "none";

export type DocumentIdentity = {
  /** CSI section numbers in canonical "NN NN NN" form. Specs only today. */
  csi_sections?: string[];
  /** Sheet number, e.g. "E2.01". Drawings — not populated by this module. */
  sheet_number?: string;
  /** Drawing discipline, e.g. "E" for electrical. Drawings — future. */
  drawing_discipline?: string;
  /** Drawing revision tag. Drawings — future. */
  drawing_rev?: string;
  /** Submittal log entry, e.g. "26 24 16-001". Submittals — future. */
  submittal_log?: string;
  /** Submittal revision counter. Submittals — future. */
  submittal_rev?: string;
  identified_via: IdentifiedVia;
  /**
   * 0..1. How much downstream should trust this identity. Header matches:
   * high. Filename hints: low, always. No match: 0.
   */
  identity_confidence: number;
};

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

/**
 * Scan free-text for every CSI section *header* (e.g. lines that look like
 * "SECTION 26 24 16 - PANELBOARDS") and return unique section numbers in
 * first-seen order. Header form is strict to avoid collecting inline
 * references like "See Section 26 24 16 for details."
 */
export function findSectionHeaders(text: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\u00A0/g, " ");
    const header = matchSection(line);
    if (!header) continue;
    if (seen.has(header.section)) continue;
    seen.add(header.section);
    ordered.push(header.section);
  }
  return ordered;
}

// Filename CSI hint: look for six digits grouped as "NN NN NN", "NN-NN-NN",
// "NN_NN_NN", or "NNNNNN". Must not be preceded or followed by another digit
// (which would make it a longer number that happens to contain six).
const FILENAME_CSI_RE = /(?<!\d)(\d{2})[\s_\-]?(\d{2})[\s_\-]?(\d{2})(?!\d)/;

/**
 * Last-resort CSI guess from a filename. Returns the first match only;
 * downstream should flag these with low confidence. Returns null if no match.
 */
export function extractCsiFromFilename(filename: string): string | null {
  // Strip extension so "26-24-16_panelboards.pdf" doesn't trip on ".pdf".
  const base = filename.replace(/\.[^.]+$/, "");
  const m = base.match(FILENAME_CSI_RE);
  if (!m) return null;
  const [, d1, d2, d3] = m;
  return normalizeCsiNumber(d1, d2, d3);
}

// ----------------------------------------------------------------------------
// public API
// ----------------------------------------------------------------------------

export type ResolveSpecIdentityInput = {
  /** Per-page text extracted from the PDF. */
  pages: string[];
  /** Original filename; used only as a fallback. */
  filename: string;
  /** How many leading pages to scan for headers. Default 3. */
  maxPagesToScan?: number;
};

/**
 * Resolve the identity of a spec document. Scans the first N pages for CSI
 * section headers. If none found, falls back to a filename CSI hint. If that
 * also misses, returns identity_confidence=0 and identified_via="none".
 *
 * Confidence values come from `lib/rag/confidence.ts` so the ladder is
 * shared with future drawing/submittal resolvers and tunable in one place.
 */
export function resolveSpecIdentity(
  input: ResolveSpecIdentityInput,
): DocumentIdentity {
  const { pages, filename, maxPagesToScan = 3 } = input;
  const scannedPages = pages.slice(0, maxPagesToScan);
  const combined = scannedPages.join("\n");
  const headers = findSectionHeaders(combined);

  if (headers.length === 1) {
    return {
      csi_sections: headers,
      identified_via: "header",
      identity_confidence: IdentityConfidence.HEADER,
    };
  }
  if (headers.length > 1) {
    return {
      csi_sections: headers,
      identified_via: "multiple",
      identity_confidence: IdentityConfidence.MULTIPLE_HEADER,
    };
  }

  const filenameHint = extractCsiFromFilename(filename);
  if (filenameHint) {
    return {
      csi_sections: [filenameHint],
      identified_via: "filename",
      identity_confidence: IdentityConfidence.FILENAME,
    };
  }

  return {
    identified_via: "none",
    identity_confidence: IdentityConfidence.NONE,
  };
}
