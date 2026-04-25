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
 * Handles common forms:
 *   "Minimum 65 kAIC"              → 65
 *   "65,000 AIC symmetrical"       → 65   (65,000 A = 65 kA)
 *   "65 kA interrupting rating"    → 65
 *   "interrupting capacity of 65kA" → 65
 *
 * Returns null when no kA-shaped number is present.
 *
 * Exported for unit tests; not part of the rule's public API.
 */
export function extractRequiredKaFromSpec(content: string): number | null {
  const candidates: number[] = [];

  // "<num> kAIC" or "<num> kA"
  const KA_RE = /(\d+(?:\.\d+)?)\s*k\s*A(?:IC)?\b/gi;
  for (const m of content.matchAll(KA_RE)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) candidates.push(n);
  }

  // "<num,nnn> AIC" — Amps with thousands separator, no kA suffix.
  const A_RE = /(\d{1,3}(?:,\d{3})+)\s*AIC\b/g;
  for (const m of content.matchAll(A_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) {
      // Convert A → kA.
      candidates.push(n / 1000);
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
