/**
 * AIC (Available Interrupting Current) rule.
 *
 * The compliance question:
 *   Equipment's submitted AIC kA must be ≥ the available fault current at
 *   its installation point. If a spec section calls out a minimum AIC, that
 *   number is the requirement. Otherwise, the project's available_fault_
 *   current_ka is the fallback.
 *
 * Citations are mandatory and never invented:
 *   - The submitted AIC always cites a submittal_field row.
 *   - The required AIC cites a spec_paragraph row when one supplied the
 *     number; otherwise it cites projects.available_fault_current_ka as a
 *     project_setting.
 *
 * Preference order for the requirement:
 *   1. Highest numeric kA extracted from any retrieved 'aic' spec paragraph
 *      for this equipment (highest because spec wording often phrases the
 *      requirement as "minimum X" — taking the strictest stated minimum
 *      keeps us conservative).
 *   2. project.available_fault_current_ka (lower confidence — engineers
 *      should treat as a placeholder until spec-cited).
 *   3. null → return uncertain finding at cool severity, do not fire hot.
 *
 * Returns null only when there is no submittedAicKa AND no requirement
 * source — there's literally nothing to compare. A submitted value with no
 * requirement still produces an "uncertain" result (we have a value but
 * nothing to check it against).
 */

import { FindingConfidence } from "@/lib/rag/confidence";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import { severityFor, type EvidenceQuality, type MagnitudeBand } from "@/lib/rag/severity";
import type {
  AicTriple,
  RuleEvidence,
  RuleResult,
} from "./types";

const RULE_ID = "aic";

/**
 * Extract the highest kA-style numeric value from a spec paragraph's text.
 *
 * Handles the common forms found in real Division-26 specs:
 *   "Minimum 65 kAIC"                                    → 65
 *   "interrupting capacity of 65kA"                      → 65
 *   "65,000 AIC symmetrical"                             → 65   (Amps with explicit AIC)
 *   "Not less than 65,000 A at 480 V" (paragraph mentions "AIC" or "interrupting"
 *      anywhere — UFGS / DoD / NASA master-spec convention)  → 65
 *
 * Returns the largest kA value found, or null if none found.
 *
 * Why three regex passes instead of one big one: each pass models a
 * different real-world spec convention, and combining them into one
 * regex makes it impossible to add a new convention without touching the
 * existing ones. Three small functions; clear precedence.
 *
 * Why pick max() across all hits: spec writers often state both a
 * lower-tier panel rating ("22 kAIC at branch panels") and a higher-tier
 * distribution rating ("65 kAIC at MDPs") in the same paragraph. The
 * conservative requirement is the highest stated value.
 *
 * Exported for unit tests; not part of the rule's public API.
 */
export function extractRequiredKaFromSpec(content: string): number | null {
  const candidates: number[] = [];

  // 1. "<num> kAIC" or "<num> kA" — definitive kA labeling.
  const KA_RE = /(\d+(?:\.\d+)?)\s*k\s*A(?:IC)?\b/gi;
  for (const m of content.matchAll(KA_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  }

  // 2. "<num,nnn> AIC" — Amps with thousands separator and explicit AIC.
  const A_AIC_RE = /(\d{1,3}(?:,\d{3})+)\s*AIC\b/g;
  for (const m of content.matchAll(A_AIC_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) candidates.push(n / 1000);
  }

  // 3. "<num,nnn> A" with AIC context elsewhere in the same paragraph.
  // Many master specs (UFGS, DoD, NASA) phrase this as
  // "Interrupting Rating of Overcurrent Devices (AIC): Not less than 65,000 A
  // at 480 V, RMS symmetrical" — the AIC label is upstream in the paragraph
  // and not adjacent to the number. We accept this when the paragraph
  // mentions "AIC" or "interrupting" (rating/capacity/current) and the
  // number is in the realistic AIC range (5,000–200,000 amperes).
  const hasAicContext =
    /\bAIC\b|\binterrupting\s+(?:rating|capacity|current)\b/i.test(content);
  if (hasAicContext) {
    const A_RE = /(\d{1,3}(?:,\d{3})+|\d{4,6})\s*A\b/g;
    for (const m of content.matchAll(A_RE)) {
      const n = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(n)) continue;
      // Realistic AIC range. Excludes "400 A frame" (frame size, not AIC)
      // and "200,000 A motor stall current" (way too high).
      if (n >= 5_000 && n <= 200_000) {
        candidates.push(n / 1000);
      }
    }
  }

  if (candidates.length === 0) return null;
  return Math.max(...candidates);
}

type Requirement =
  | {
      kind: "spec";
      requiredKa: number;
      atom: RetrievedAtom;
    }
  | {
      kind: "project";
      requiredKa: number;
    };

function pickRequirement(triple: AicTriple): Requirement | null {
  let best: { ka: number; atom: RetrievedAtom } | null = null;
  for (const atom of triple.specRequirements) {
    const ka = extractRequiredKaFromSpec(atom.content);
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

export function evaluateAic(triple: AicTriple): RuleResult | null {
  const submitted = triple.equipment.submittedAicKa;
  const requirement = pickRequirement(triple);

  if (submitted == null && requirement == null) {
    // Nothing to evaluate — return null so this rule produces no finding.
    return null;
  }

  // Build evidence array. Always include the submittal cite if present and
  // the requirement cite if we have one.
  const evidence: RuleEvidence[] = [];

  if (submitted != null) {
    evidence.push({
      sourceKind: "submittal_field",
      sourceId: triple.equipment.submittedSourceId,
      documentId: triple.equipment.submittedDocumentId,
      pageNum: triple.equipment.submittedPageNum,
      role: "primary",
      snippet: `submitted AIC = ${submitted} kA`,
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
      summary: `Cannot evaluate AIC for ${triple.equipment.tag ?? "equipment"}: required ${reqKa} kA but no submittal AIC value found.`,
      inputs: {
        submittedAicKa: null,
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
      summary: `Submitted AIC = ${submitted} kA for ${triple.equipment.tag ?? "equipment"} but no required value (no spec citation, no project fault current set).`,
      inputs: {
        submittedAicKa: submitted,
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
      ? `${triple.equipment.tag ?? "Equipment"} AIC ${submitted} kA ≥ required ${required} kA${margin === 0 ? " (exact match — no margin)" : ""}.`
      : `${triple.equipment.tag ?? "Equipment"} AIC ${submitted} kA < required ${required} kA. Short by ${(required - submitted).toFixed(1)} kA.`,
    inputs: {
      submittedAicKa: submitted,
      requiredKa: required,
      requirementSource: requirement.kind,
      marginKa: margin,
    },
    comparator: "≥",
    evidence,
  };
}
