/**
 * Enclosure rule.
 *
 * The compliance question:
 *   Submitted enclosure NEMA rating must be at least as protective as the
 *   spec-required NEMA rating, per the NEMA hierarchy (4X ⊇ 4 ⊇ 3 ⊇ 3R ⊇ 1
 *   for outdoor; 12 ⊇ 1 for indoor with dust/dripping protection).
 *
 * Different shape from AIC/SCCR:
 *   - Comparator is ⊇ (subsumption / hierarchy match), not numeric ≥
 *   - There is NO project-wide fallback — without a spec callout, no
 *     rule fires (enclosure choice is environment-driven, not a global
 *     project parameter)
 *
 * v1 hierarchy is a total ordering on protectiveness. The real semantics
 * is a partial order (NEMA 12 vs NEMA 3R aren't directly comparable —
 * 12 is dust-tight indoor, 3R is rain-tight outdoor, neither subsumes
 * the other), but for the demo target — panelboards/switchboards in
 * controlled environments — the total order is conservative enough.
 * The Phase B spec checklist parser will give us proper enclosure
 * semantics (env tags, location classifications) later.
 *
 * Total ordering used (rank → code):
 *   1: "1"   indoor, basic
 *   2: "12"  indoor + dust + dripping non-corrosive liquid
 *   3: "3R"  outdoor rain-tight
 *   4: "3"   outdoor weather-resistant (windblown dust + ice)
 *   5: "4"   water-tight (indoor or outdoor, hose-directed)
 *   6: "4X"  water-tight + corrosion-resistant
 *
 * TODO(v2): replace the total order with a true partial-order satisfies()
 * lookup per NEMA 250. Known silent-pass: spec=NEMA 12 (indoor + dust)
 * vs submittal=NEMA 3R (outdoor + rain, no dust-tight) rates compliant
 * here but isn't in reality. Demo PDFs don't exercise this case. Frozen
 * per DECISIONS.md U15 — fix after /compare is in prod and we can see
 * which corrections actually move the artifact.
 */

import { FindingConfidence } from "@/lib/rag/confidence";
import { normalizeNemaRating } from "@/lib/rag/normalize";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import { severityFor, type EvidenceQuality, type MagnitudeBand } from "@/lib/rag/severity";
import type { EnclosureTriple, RuleEvidence, RuleResult } from "./types";

const RULE_ID = "enclosure";

/**
 * Protectiveness rank by NEMA code. Higher = more protective. Codes
 * not in the table get rank 0 — treated as "unknown / less than
 * everything", which is the conservative behavior (the rule reports
 * non_compliant rather than silently passing).
 */
const NEMA_RANK: Record<string, number> = {
  "1": 1,
  "12": 2,
  "3R": 3,
  "3": 4,
  "4": 5,
  "4X": 6,
};

/**
 * Look up NEMA protectiveness rank. Returns 0 for unknown codes.
 * Exported for unit tests.
 */
export function nemaRank(code: string | null | undefined): number {
  if (!code) return 0;
  return NEMA_RANK[code.toUpperCase()] ?? 0;
}

/**
 * Extract the required NEMA enclosure code from a spec paragraph's text.
 * Returns the strictest (highest-rank) NEMA code mentioned, or null.
 *
 * Spec language conventions:
 *   "NEMA 1 enclosure"            → "1"
 *   "Type 3R enclosure"           → "3R"
 *   "NEMA 4X stainless steel"     → "4X"
 *   "indoor NEMA 1 / outdoor 3R"  → "3R"   (strictest of the two stated)
 *
 * Why pick max rank: when a spec lists multiple options ("NEMA 1 or 3R")
 * the conservative requirement is the more protective one. If a spec
 * actually means "use whichever fits the location", that nuance belongs
 * to the spec checklist parser, not this rule.
 *
 * Exported for unit tests and for synthesis/enclosure.ts contradictions.
 */
export function extractRequiredNemaFromSpec(content: string): string | null {
  // Capture group covers digits + optional letter suffix (X, R).
  const NEMA_RE = /(?:NEMA|Type)\s+(\d+[A-Z]?)/gi;
  const candidates: string[] = [];
  for (const m of content.matchAll(NEMA_RE)) {
    const code = m[1].toUpperCase();
    if (NEMA_RANK[code] != null) candidates.push(code);
  }
  if (candidates.length === 0) return null;
  // Pick the highest-rank code seen.
  let best = candidates[0];
  let bestRank = nemaRank(best);
  for (const c of candidates.slice(1)) {
    const r = nemaRank(c);
    if (r > bestRank) {
      best = c;
      bestRank = r;
    }
  }
  return best;
}

type Requirement = {
  kind: "spec";
  requiredCode: string;
  atom: RetrievedAtom;
};

function pickRequirement(triple: EnclosureTriple): Requirement | null {
  let best: { code: string; rank: number; atom: RetrievedAtom } | null = null;
  for (const atom of triple.specRequirements) {
    const code = extractRequiredNemaFromSpec(atom.content);
    if (!code) continue;
    const r = nemaRank(code);
    if (!best || r > best.rank) best = { code, rank: r, atom };
  }
  if (best) return { kind: "spec", requiredCode: best.code, atom: best.atom };
  return null;
}

export function evaluateEnclosure(triple: EnclosureTriple): RuleResult | null {
  // Submitted is normalized at parse time, but defense-in-depth: re-normalize.
  const submitted = normalizeNemaRating(triple.equipment.submittedNema);
  const requirement = pickRequirement(triple);

  if (submitted == null && requirement == null) return null;

  const evidence: RuleEvidence[] = [];
  if (submitted != null) {
    evidence.push({
      sourceKind: "submittal_field",
      sourceId: triple.equipment.submittedSourceId,
      documentId: triple.equipment.submittedDocumentId,
      pageNum: triple.equipment.submittedPageNum,
      role: "primary",
      snippet: `submitted enclosure = NEMA ${submitted}`,
    });
  }
  if (requirement) {
    evidence.push({
      sourceKind: "spec_paragraph",
      sourceId: requirement.atom.id,
      documentId: requirement.atom.documentId,
      pageNum: requirement.atom.pageNum,
      role: "primary",
      snippet: requirement.atom.content.slice(0, 240),
    });
  }

  // Case 1: requirement exists but no submitted value — uncertain.
  if (submitted == null) {
    return {
      ruleId: RULE_ID,
      verdict: "uncertain",
      confidence: FindingConfidence.WEAK_MISSING_VALUE,
      severity: severityFor({
        evidenceQuality: "incomplete",
        magnitude: "uncertain",
      }),
      summary: `Cannot evaluate enclosure for ${triple.equipment.tag ?? "equipment"}: required NEMA ${requirement!.requiredCode} but no submittal enclosure value found.`,
      inputs: {
        submittedNema: null,
        requiredNema: requirement!.requiredCode,
        requirementSource: "spec",
      },
      comparator: "⊇",
      evidence,
    };
  }

  // Case 2: submitted exists but no requirement — uncertain.
  // (No project fallback for enclosure — environment-driven, not global.)
  if (requirement == null) {
    return {
      ruleId: RULE_ID,
      verdict: "uncertain",
      confidence: FindingConfidence.WEAK_MISSING_REQUIREMENT,
      severity: severityFor({
        evidenceQuality: "incomplete",
        magnitude: "uncertain",
      }),
      summary: `Submitted enclosure NEMA ${submitted} for ${triple.equipment.tag ?? "equipment"} but no required value (no spec citation).`,
      inputs: {
        submittedNema: submitted,
        requiredNema: null,
        requirementSource: "none",
      },
      comparator: "⊇",
      evidence,
    };
  }

  // Case 3: both present — hierarchy comparison.
  const submittedRank = nemaRank(submitted);
  const requiredRank = nemaRank(requirement.requiredCode);
  const passed = submittedRank >= requiredRank;
  const exactMatch = submittedRank === requiredRank;

  // Spec-cited primary evidence on both sides → "primary" quality.
  const evidenceQuality: EvidenceQuality = "primary";
  const magnitude: MagnitudeBand = !passed
    ? "non_compliant"
    : exactMatch
      ? "compliant_zero_margin"
      : "compliant_margin";
  const severity = severityFor({ evidenceQuality, magnitude });

  return {
    ruleId: RULE_ID,
    verdict: passed ? "compliant" : "non_compliant",
    confidence: FindingConfidence.STRONG,
    severity,
    summary: passed
      ? `${triple.equipment.tag ?? "Equipment"} enclosure NEMA ${submitted} ⊇ required NEMA ${requirement.requiredCode}${exactMatch ? " (exact match)" : " (more protective)"}.`
      : `${triple.equipment.tag ?? "Equipment"} enclosure NEMA ${submitted} does not meet required NEMA ${requirement.requiredCode}. Submitted enclosure is less protective than the spec calls for.`,
    inputs: {
      submittedNema: submitted,
      requiredNema: requirement.requiredCode,
      submittedRank,
      requiredRank,
      requirementSource: "spec",
    },
    comparator: "⊇",
    evidence,
  };
}
