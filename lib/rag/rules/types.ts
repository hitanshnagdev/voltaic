/**
 * Common types for the deterministic rule engine.
 *
 * A rule takes a "triple" — one equipment entity plus the structured
 * inputs needed to evaluate it (spec requirements, submitted values,
 * project assumptions) — and returns either a RuleResult or null.
 *
 * Why null vs a "passed" result: a rule returns null when it doesn't
 * have enough information to evaluate (missing inputs). That's
 * semantically different from "evaluated and passed". CLAUDE.md is
 * explicit about preferring silence over false positives.
 */

import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";

export type RuleVerdict =
  | "compliant"
  | "non_compliant"
  | "uncertain"
  | "no_conflict";

export type RuleEvidence = {
  /** Where this evidence came from in the source schema. */
  sourceKind: "spec_paragraph" | "submittal_field" | "project_setting";
  /** ID of the source row (null for project_setting). */
  sourceId: string | null;
  documentId?: string | null;
  pageNum?: number | null;
  snippet?: string | null;
  /** "primary" cites the value being compared; "supporting" provides context. */
  role: "primary" | "supporting";
};

export type RuleResult = {
  ruleId: string;
  verdict: RuleVerdict;
  /** 0..1. Driven by input quality (spec-cited > project-default). */
  confidence: number;
  /** Hot/warm/cool, mapped from verdict + numeric magnitude per rule. */
  severity: "hot" | "warm" | "cool";
  /** Short human-readable summary. */
  summary: string;
  /** Inputs the rule actually compared. Persisted in findings.reasoning_trace. */
  inputs: Record<string, unknown>;
  comparator: "≥" | "≤" | "=" | "⊇";
  evidence: RuleEvidence[];
};

/**
 * AIC rule input: one equipment entity plus the data needed to evaluate it.
 *
 * specRequirements is a list of retrieved atoms tagged requirement_type='aic'
 * for the equipment's CSI section(s). The rule prefers a numeric requirement
 * extracted from one of these over the project-wide fallback.
 */
export type AicTriple = {
  equipment: {
    id: string;
    tag: string | null;
    /** Submitted AIC in kA, parsed from a submittal_field. Null if absent. */
    submittedAicKa: number | null;
    /** ID of the submittal_field row that supplied submittedAicKa. */
    submittedSourceId: string | null;
    submittedDocumentId: string | null;
    submittedPageNum: number | null;
  };
  /** Retrieved 'aic'-typed spec paragraphs scoped to the equipment. */
  specRequirements: RetrievedAtom[];
  /** Project-wide fallback used only when no spec requirement is found. */
  projectFaultCurrentKa: number | null;
};

/**
 * SCCR rule input — same shape as AicTriple but different semantics.
 * SCCR (short-circuit current rating) measures the bus assembly's
 * withstand current; AIC measures breaker interrupting capacity. Both
 * compare against project fault current as a fallback because both
 * defend the equipment against the same upstream short-circuit
 * condition. specRequirements are atoms tagged requirement_type='sccr'.
 */
export type SccrTriple = {
  equipment: {
    id: string;
    tag: string | null;
    submittedSccrKa: number | null;
    submittedSourceId: string | null;
    submittedDocumentId: string | null;
    submittedPageNum: number | null;
  };
  specRequirements: RetrievedAtom[];
  projectFaultCurrentKa: number | null;
};

/**
 * Enclosure rule input. Different shape from AIC/SCCR — the comparator
 * is NEMA hierarchy (⊇), not numeric ≥, and there is NO project-wide
 * fallback (without a spec callout, no rule fires).
 *
 * specRequirements are atoms tagged requirement_type='enclosure'. The
 * rule extracts the required NEMA code (e.g. "3R") from the spec text
 * and checks the submitted NEMA code is at least as protective.
 */
export type EnclosureTriple = {
  equipment: {
    id: string;
    tag: string | null;
    /** Submitted NEMA code, normalized: "1" | "3R" | "4" | "4X" | "12". */
    submittedNema: string | null;
    submittedSourceId: string | null;
    submittedDocumentId: string | null;
    submittedPageNum: number | null;
  };
  specRequirements: RetrievedAtom[];
};
