/**
 * Synthesis helpers for the AIC rule.
 *
 * The pure-function seam between the deterministic rule engine
 * (lib/rag/rules/aic.ts) and the durable Inngest runner that wires DB rows
 * + retrieved atoms into a triple. Lives here so it can be unit-tested
 * without spinning up Postgres or Inngest.
 *
 * Two responsibilities:
 *   1. buildAicTriple — assembles the rule's input from the shape we
 *      actually have on hand: an equipment row, the submittal_field row
 *      that supplied the AIC value, retrieved spec atoms, and the
 *      project-wide fault current fallback.
 *   2. detectAicContradiction — separately notices when two retrieved spec
 *      atoms disagree on the required AIC. Per docs/DECISIONS.md U5, this
 *      is a first-class `kind='contradiction'` finding, not a side effect
 *      of the AIC rule. The rule still picks max() (conservative); the
 *      contradiction surfaces the disagreement explicitly so the PM can
 *      reconcile before procurement locks in.
 */

import { extractRequiredKaFromSpec } from "@/lib/rag/rules/aic";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { AicTriple } from "@/lib/rag/rules/types";

/**
 * Minimal slice of an `equipment` row needed to build the triple. Pulled
 * out as its own type so the runner doesn't have to pass the full row
 * (which carries jsonb columns Drizzle types as `unknown`).
 */
export type AicEquipmentInput = {
  id: string;
  tag: string | null;
};

/**
 * Minimal slice of a `submittal_fields` row — the one that supplied the
 * AIC value that triggered `equipment/aic-ready`. The `aic_ka` field is
 * already normalized at parse time, so we trust the number here.
 */
export type AicSubmittalInput = {
  id: string;
  documentId: string;
  pageNum: number | null;
  aicKa: number | null;
};

export function buildAicTriple(input: {
  equipment: AicEquipmentInput;
  submittal: AicSubmittalInput | null;
  specAtoms: RetrievedAtom[];
  projectFaultCurrentKa: number | null;
}): AicTriple {
  const { equipment, submittal, specAtoms, projectFaultCurrentKa } = input;
  return {
    equipment: {
      id: equipment.id,
      tag: equipment.tag,
      submittedAicKa: submittal?.aicKa ?? null,
      submittedSourceId: submittal?.id ?? null,
      submittedDocumentId: submittal?.documentId ?? null,
      submittedPageNum: submittal?.pageNum ?? null,
    },
    specRequirements: specAtoms,
    projectFaultCurrentKa,
  };
}

export type AicContradictionCandidate = {
  atom: RetrievedAtom;
  /** kA value extracted from this atom's content. */
  ka: number;
};

export type AicContradiction = {
  /** All atoms whose content yielded a numeric AIC value, sorted by kA desc. */
  candidates: AicContradictionCandidate[];
  /** Distinct kA values present across `candidates`, sorted desc. */
  distinctKas: number[];
};

/**
 * Returns a contradiction record when retrieved spec atoms disagree on the
 * required AIC kA, otherwise null.
 *
 * Disagreement = at least two atoms each yielding a *different* numeric kA
 * via `extractRequiredKaFromSpec`. Atoms that yield no number are ignored
 * (the rule already filters them out when picking max()).
 *
 * Why a separate function and not a side effect of the rule: the rule's
 * job is "what is the correct verdict given conservative inputs?" The
 * contradiction's job is "are the inputs themselves consistent?" — those
 * are different questions and conflating them buries the second one.
 */
export function detectAicContradiction(
  atoms: RetrievedAtom[],
): AicContradiction | null {
  const candidates: AicContradictionCandidate[] = [];
  for (const atom of atoms) {
    const ka = extractRequiredKaFromSpec(atom.content);
    if (ka == null) continue;
    candidates.push({ atom, ka });
  }
  if (candidates.length < 2) return null;

  const distinctKas = Array.from(new Set(candidates.map((c) => c.ka))).sort(
    (a, b) => b - a,
  );
  if (distinctKas.length < 2) return null;

  candidates.sort((a, b) => b.ka - a.ka);
  return { candidates, distinctKas };
}
