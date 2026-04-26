/**
 * Hardcoded panelboard attribute schema for the v0 compare page.
 *
 * Per docs/DECISIONS.md U12 Phase A: the compare page renders a fixed
 * panelboard expectation set. The spec-driven checklist (Phase B) will
 * obsolete this hardcode by extracting the attribute list per spec
 * section. Until that lands, this is the canonical "what to render"
 * list, and the spec-side VALUES on the page still come from real
 * retrieval against `spec_paragraphs` (per U15 condition 3 — no
 * hardcoded spec values).
 *
 * Three attribute kinds with different verdict pathways:
 *
 *   rule_driven      The compliance check is a deterministic rule that
 *                    already runs (AIC, SCCR, enclosure). The verdict +
 *                    severity come from the matching `findings` row;
 *                    the spec citation comes from the finding's evidence.
 *
 *   value_equality   No rule, but spec value should equal submittal value
 *                    (UL listing, voltage system, ampacity, main type).
 *                    Spec-side value comes from a per-attribute retrieve()
 *                    call with `requirementType` filter and a tuned query.
 *                    Verdict computed inline by `inlineCheck`.
 *
 *   not_extracted    We don't extract this attribute yet (bus material,
 *                    bus plating). Always renders as MISSING — exactly
 *                    the failure-visibility surface the post-mortem
 *                    flagged. Looks ugly on purpose so the gap is
 *                    visible to the PM and to us.
 */

import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";

export type AttributeKind = "rule_driven" | "value_equality" | "not_extracted";

export type AttributeGroup = "Ratings & listings" | "Construction";

export type InlineVerdict =
  | "compliant"
  | "non_compliant"
  | "uncertain"
  | "informational";

export type AttributeDef = {
  /** Display name shown to the user. */
  display: string;
  group: AttributeGroup;
  kind: AttributeKind;

  // ---- rule_driven attributes ----
  /** Matches `findings.rule_id`. Required when kind === 'rule_driven'. */
  ruleId?: "aic" | "sccr" | "enclosure";

  // ---- value_equality + rule_driven attributes ----
  /**
   * Read the submitted value from `submittal_fields.fields`. Returns
   * the formatted display string, or null when the field is absent.
   * The whole `fields` bag is passed (some attributes are derived from
   * multiple keys — e.g. voltage shows "480Y/277V · 3φ · 4w").
   */
  readSubmitted: (fields: Record<string, unknown>) => string | null;

  // ---- value_equality attributes ----
  /**
   * Tuned query phrase fed into hybrid retrieval to find the spec
   * paragraph that states the requirement.
   */
  retrievalQuery?: string;
  /**
   * Filter passed to retrieve(). Only paragraphs with this
   * `requirement_type` are considered. Use null to skip filtering
   * (broader recall, more noise — appropriate for attributes the
   * spec parser doesn't have a typed bucket for).
   */
  requirementType?: string | null;
  /**
   * Extract the spec-required display string from the retrieved atom.
   * Returns null when the atom doesn't actually express the
   * requirement (filters out false retrievals).
   */
  extractRequired?: (atom: RetrievedAtom) => string | null;
  /**
   * Inline equality / compatibility check. Returns the verdict given
   * the submitted display string and the spec-required display string.
   * Both strings are post-format, so this is a string-level check; the
   * normalizers/formatters do the heavy lifting upstream.
   */
  inlineCheck?: (
    submitted: string | null,
    required: string | null,
  ) => InlineVerdict;
};

// ---------- value formatters used by readSubmitted ----------

function fmtKa(v: unknown): string | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return `${v} kA`;
}

function fmtListings(v: unknown): string | null {
  if (!Array.isArray(v)) return null;
  const cleaned = v.filter((s): s is string => typeof s === "string");
  return cleaned.length > 0 ? cleaned.join(", ") : null;
}

function fmtVoltage(fields: Record<string, unknown>): string | null {
  const v = fields.voltage;
  const phase = fields.phase;
  const wires = fields.wires;
  const parts: string[] = [];
  if (typeof v === "string" && v) parts.push(v);
  if (typeof phase === "number") parts.push(`${phase}φ`);
  if (typeof wires === "number") parts.push(`${wires}w`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function fmtMainRating(fields: Record<string, unknown>): string | null {
  const a = fields.ampacity_a;
  const t = fields.main_type;
  const parts: string[] = [];
  if (typeof a === "number" && Number.isFinite(a)) parts.push(`${a} A`);
  if (typeof t === "string" && t) parts.push(t);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function fmtEnclosure(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return `NEMA ${v}`;
}

function fmtSeriesRated(v: unknown): string | null {
  if (typeof v !== "boolean") return null;
  return v ? "Yes (series-rated combination)" : "No (fully rated standalone)";
}

// ---------- spec-side extractors used by extractRequired ----------

/** Return the first UL/NEMA/IEEE listing found in the spec paragraph. */
function extractListing(atom: RetrievedAtom): string | null {
  const m = atom.content.match(
    /\b(UL|NEMA|IEEE|ANSI(?:\/\w+)?)\s+(\d+(?:[A-Z]{1,3})?)\b/i,
  );
  return m ? `${m[1].toUpperCase()} ${m[2]}` : null;
}

/** Return the spec voltage label, e.g. "480Y/277V". */
function extractVoltage(atom: RetrievedAtom): string | null {
  const m = atom.content.match(/\b(\d{2,4}(?:Y\/\d{2,4})?V?)\b/);
  if (!m) return null;
  // Filter out plausible false matches (small numbers, ages).
  const num = Number(m[1].replace(/\D/g, "").slice(0, 3));
  if (Number.isFinite(num) && num >= 100 && num <= 1000) return m[1];
  return null;
}

/** Return the spec ampacity, e.g. "≥ 225 A". */
function extractAmpacity(atom: RetrievedAtom): string | null {
  const m = atom.content.match(/\b(\d{2,5})\s*A(?:mp(?:ere)?s?)?\s+(?:main|frame|trip)\b/i);
  if (m) return `≥ ${Number(m[1]).toLocaleString()} A`;
  return null;
}

/** Return "MLO" / "MCB" / similar from the spec paragraph. */
function extractMainType(atom: RetrievedAtom): string | null {
  const m = atom.content.match(/\b(MLO|MCB|MCCB)\b/);
  return m ? m[1] : null;
}

// ---------- inline checks for value_equality kind ----------

/**
 * One side contains the other — covers cases like submitted "UL 891"
 * vs required "UL 891 listed and labeled". Strict-equality matching
 * is too fragile for spec/submittal text drift; subsumption is the
 * pragmatic v0 default. Phase B's spec checklist parser will give us
 * proper typed comparators (numeric ≥, enum match, etc.) that don't
 * need this fuzziness.
 */
function eqSubsumed(a: string | null, b: string | null): InlineVerdict {
  if (!a && !b) return "informational";
  if (!a || !b) return "uncertain";
  const na = a.toLowerCase().replace(/\s+/g, " ").trim();
  const nb = b.toLowerCase().replace(/\s+/g, " ").trim();
  return na.includes(nb) || nb.includes(na) ? "compliant" : "non_compliant";
}

// ---------- the hardcoded panelboard attribute list ----------

export const PANELBOARD_ATTRIBUTES: AttributeDef[] = [
  // Ratings & listings
  {
    display: "UL listing",
    group: "Ratings & listings",
    kind: "value_equality",
    readSubmitted: (f) => fmtListings(f.listings),
    retrievalQuery: "UL listed labeled panelboard listing standard",
    requirementType: null, // listings often classify as 'other'
    extractRequired: extractListing,
    inlineCheck: eqSubsumed,
  },
  {
    display: "AIC rating",
    group: "Ratings & listings",
    kind: "rule_driven",
    ruleId: "aic",
    readSubmitted: (f) => fmtKa(f.aic_ka),
  },
  {
    display: "Series-rated",
    group: "Ratings & listings",
    kind: "value_equality",
    readSubmitted: (f) => fmtSeriesRated(f.series_rated),
    retrievalQuery: "series-rated combination prohibited acceptable AIC",
    requirementType: "aic",
    // Spec usually says "series-rated combinations are not acceptable"
    // → required value is "Not acceptable". Submitted is yes/no boolean.
    extractRequired: (atom) => {
      if (
        /series[-\s]?rated.*(not\s+acceptable|prohibit|disallow)/i.test(
          atom.content,
        )
      )
        return "Not acceptable";
      if (
        /series[-\s]?rated.*(allowed|acceptable|permitted)/i.test(atom.content)
      )
        return "Acceptable";
      return null;
    },
    inlineCheck: (sub, req) => {
      if (!sub || !req) return "uncertain";
      const subYes = sub.toLowerCase().startsWith("yes");
      const reqProhibited = req.toLowerCase().includes("not");
      if (subYes && reqProhibited) return "non_compliant";
      return "compliant";
    },
  },
  {
    display: "SCCR / bus bracing",
    group: "Ratings & listings",
    kind: "rule_driven",
    ruleId: "sccr",
    readSubmitted: (f) => fmtKa(f.sccr_ka),
  },
  {
    display: "Voltage / phase",
    group: "Ratings & listings",
    kind: "value_equality",
    readSubmitted: (f) => fmtVoltage(f),
    retrievalQuery: "voltage rated 480Y/277V 208Y/120V three-phase wye delta",
    requirementType: null,
    extractRequired: extractVoltage,
    inlineCheck: eqSubsumed,
  },
  {
    display: "Main rating",
    group: "Ratings & listings",
    kind: "value_equality",
    readSubmitted: (f) => fmtMainRating(f),
    retrievalQuery: "main lugs MLO main breaker MCB ampacity rating frame",
    requirementType: null,
    extractRequired: (atom) => {
      const a = extractAmpacity(atom);
      const t = extractMainType(atom);
      if (!a && !t) return null;
      return [a, t].filter(Boolean).join(" · ");
    },
    inlineCheck: eqSubsumed,
  },

  // Construction
  {
    display: "Enclosure",
    group: "Construction",
    kind: "rule_driven",
    ruleId: "enclosure",
    readSubmitted: (f) => fmtEnclosure(f.enclosure_nema),
  },
  {
    display: "Bus material",
    group: "Construction",
    kind: "not_extracted",
    readSubmitted: () => null,
  },
  {
    display: "Joint plating",
    group: "Construction",
    kind: "not_extracted",
    readSubmitted: () => null,
  },
  {
    display: "Number of poles",
    group: "Construction",
    kind: "value_equality",
    readSubmitted: (f) =>
      typeof f.poles === "number" ? `${f.poles} poles` : null,
    retrievalQuery: "poles 3-pole 4-pole panelboard",
    requirementType: null,
    extractRequired: (atom) => {
      const m = atom.content.match(/\b(\d)\s*[-]?\s*pole\b/i);
      return m ? `${m[1]} poles` : null;
    },
    inlineCheck: eqSubsumed,
  },
];

export const ATTRIBUTE_GROUPS: AttributeGroup[] = [
  "Ratings & listings",
  "Construction",
];
