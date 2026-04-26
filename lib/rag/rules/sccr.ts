/**
 * SCCR (Short-Circuit Current Rating) rule.
 *
 * The compliance question:
 *   The bus assembly's submitted SCCR kA must be ≥ the available fault
 *   current at its installation point. SCCR governs the panel/switchboard
 *   structure; AIC (separate rule) governs the breakers inside it. Both
 *   rules defend against the same upstream short-circuit condition, so
 *   both fall back to project.available_fault_current_ka when the spec
 *   doesn't pin a number.
 *
 * Why a separate rule from AIC: SCCR and AIC are physically different
 * ratings even when their numeric values usually coincide on a panel. A
 * 65 kA AIC breaker inside a 22 kA SCCR panel is a real failure mode —
 * the breaker is rated to interrupt 65 kA but the bus structure can't
 * survive the let-through. Conflating them would silently mask that.
 *
 * Spec-language signals for SCCR (different from AIC — see classify.ts):
 *   - "SCCR"
 *   - "short-circuit current rating"
 *   - "withstand rating"
 *   - "bus bracing" (on switchboards/panelboards, "bus bracing" is the
 *     SCCR — the bus assembly's withstand)
 */

import { FindingConfidence } from "@/lib/rag/confidence";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import { severityFor, type EvidenceQuality, type MagnitudeBand } from "@/lib/rag/severity";
import type { RuleEvidence, RuleResult, SccrTriple } from "./types";

const RULE_ID = "sccr";

/**
 * Extract the highest kA value cited in a spec paragraph as an SCCR /
 * withstand requirement. Mirrors the AIC extractor's structure but the
 * "is this paragraph about SCCR" gate keys on different terminology.
 *
 * Conventions seen in real Division 26 specs:
 *   "Minimum 65 kA SCCR"                              → 65
 *   "65 kAIC short-circuit current rating"            → 65   (yes, "kAIC"
 *                                                              shows up in
 *                                                              SCCR
 *                                                              callouts too)
 *   "withstand rating not less than 65,000 A"         → 65   (Amps with SCCR
 *                                                              context)
 *   "bus bracing: 65 kA"                              → 65
 *
 * Returns the largest kA value found in atoms whose paragraph mentions
 * SCCR / withstand / bus-bracing terminology, or null if none.
 *
 * Exported for unit tests and for synthesis/sccr.ts contradiction detection.
 */
export function extractRequiredSccrKaFromSpec(content: string): number | null {
  // Gate: the paragraph must be about SCCR / withstand / bus bracing.
  const hasSccrContext =
    /\bSCCR\b/i.test(content) ||
    /\bshort[-\s]?circuit\s+current\s+rating\b/i.test(content) ||
    /\bwithstand\s+rating\b/i.test(content) ||
    /\bbus\s+bracing\b/i.test(content);
  if (!hasSccrContext) return null;

  const candidates: number[] = [];

  // 1. "<num> kA" or "<num> kAIC" — definitive kA labeling.
  const KA_RE = /(\d+(?:\.\d+)?)\s*k\s*A(?:IC)?\b/gi;
  for (const m of content.matchAll(KA_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  }

  // 2. "<num,nnn> A" — Amps form. Realistic SCCR range 5,000–200,000 A.
  // Context already gates on SCCR keywords above, so we don't need to
  // re-check inside the regex.
  const A_RE = /(\d{1,3}(?:,\d{3})+|\d{4,6})\s*A\b/g;
  for (const m of content.matchAll(A_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(n)) continue;
    if (n >= 5_000 && n <= 200_000) {
      candidates.push(n / 1000);
    }
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

type Requirement =
  | { kind: "spec"; requiredKa: number; atom: RetrievedAtom }
  | { kind: "project"; requiredKa: number };

function pickRequirement(triple: SccrTriple): Requirement | null {
  let best: { ka: number; atom: RetrievedAtom } | null = null;
  for (const atom of triple.specRequirements) {
    const ka = extractRequiredSccrKaFromSpec(atom.content);
    if (ka == null) continue;
    if (!best || ka > best.ka) best = { ka, atom };
  }
  if (best) return { kind: "spec", requiredKa: best.ka, atom: best.atom };
  if (
    triple.projectFaultCurrentKa != null &&
    triple.projectFaultCurrentKa > 0
  ) {
    return { kind: "project", requiredKa: triple.projectFaultCurrentKa };
  }
  return null;
}

export function evaluateSccr(triple: SccrTriple): RuleResult | null {
  const submitted = triple.equipment.submittedSccrKa;
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
      snippet: `submitted SCCR = ${submitted} kA`,
    });
  }
  if (requirement?.kind === "spec") {
    evidence.push({
      sourceKind: "spec_paragraph",
      sourceId: requirement.atom.id,
      documentId: requirement.atom.documentId,
      pageNum: requirement.atom.pageNum,
      role: "primary",
      snippet: requirement.atom.content.slice(0, 240),
    });
  } else if (requirement?.kind === "project") {
    evidence.push({
      sourceKind: "project_setting",
      sourceId: null,
      role: "primary",
      snippet: `project available_fault_current = ${requirement.requiredKa} kA`,
    });
  }

  // Case 1: requirement exists but no submitted value — uncertain.
  if (submitted == null) {
    const reqKa = requirement!.requiredKa;
    return {
      ruleId: RULE_ID,
      verdict: "uncertain",
      confidence:
        requirement!.kind === "spec"
          ? FindingConfidence.WEAK_MISSING_VALUE
          : FindingConfidence.WEAK_FALLBACK_MISSING_VALUE,
      severity: severityFor({
        evidenceQuality: "incomplete",
        magnitude: "uncertain",
      }),
      summary: `Cannot evaluate SCCR for ${triple.equipment.tag ?? "equipment"}: required ${reqKa} kA but no submittal SCCR value found.`,
      inputs: {
        submittedSccrKa: null,
        requiredKa: reqKa,
        requirementSource: requirement!.kind,
      },
      comparator: "≥",
      evidence,
    };
  }

  // Case 2: submitted exists but no requirement — uncertain.
  if (requirement == null) {
    return {
      ruleId: RULE_ID,
      verdict: "uncertain",
      confidence: FindingConfidence.WEAK_MISSING_REQUIREMENT,
      severity: severityFor({
        evidenceQuality: "incomplete",
        magnitude: "uncertain",
      }),
      summary: `Submitted SCCR = ${submitted} kA for ${triple.equipment.tag ?? "equipment"} but no required value (no spec citation, no project fault current set).`,
      inputs: {
        submittedSccrKa: submitted,
        requiredKa: null,
        requirementSource: "none",
      },
      comparator: "≥",
      evidence,
    };
  }

  // Case 3: both present — actual numeric comparison.
  const required = requirement.requiredKa;
  const passed = submitted >= required;
  const margin = submitted - required;

  const evidenceQuality: EvidenceQuality =
    requirement.kind === "spec" ? "primary" : "fallback";
  const magnitude: MagnitudeBand = !passed
    ? "non_compliant"
    : margin === 0
      ? "compliant_zero_margin"
      : "compliant_margin";
  const severity = severityFor({ evidenceQuality, magnitude });

  const confidence =
    requirement.kind === "spec"
      ? FindingConfidence.STRONG
      : FindingConfidence.MEDIUM;

  return {
    ruleId: RULE_ID,
    verdict: passed ? "compliant" : "non_compliant",
    confidence,
    severity,
    summary: passed
      ? `${triple.equipment.tag ?? "Equipment"} SCCR ${submitted} kA ≥ required ${required} kA${margin === 0 ? " (exact match — no margin)" : ""}.`
      : `${triple.equipment.tag ?? "Equipment"} SCCR ${submitted} kA < required ${required} kA. Bus assembly cannot withstand the available fault current — short by ${(required - submitted).toFixed(1)} kA.`,
    inputs: {
      submittedSccrKa: submitted,
      requiredKa: required,
      requirementSource: requirement.kind,
      marginKa: margin,
    },
    comparator: "≥",
    evidence,
  };
}
