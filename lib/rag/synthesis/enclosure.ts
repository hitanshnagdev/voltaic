/**
 * Synthesis helpers for the enclosure rule. Same triple-builder pattern
 * as synthesis/aic.ts; contradiction detector keys on disagreement
 * between distinct NEMA codes (any disagreement, not just numeric).
 */

import { extractRequiredNemaFromSpec } from "@/lib/rag/rules/enclosure";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { EnclosureTriple } from "@/lib/rag/rules/types";

export type EnclosureEquipmentInput = {
  id: string;
  tag: string | null;
};

export type EnclosureSubmittalInput = {
  id: string;
  documentId: string;
  pageNum: number | null;
  /** Submitted NEMA code, normalized at parse time. */
  enclosureNema: string | null;
};

export function buildEnclosureTriple(input: {
  equipment: EnclosureEquipmentInput;
  submittal: EnclosureSubmittalInput | null;
  specAtoms: RetrievedAtom[];
}): EnclosureTriple {
  const { equipment, submittal, specAtoms } = input;
  return {
    equipment: {
      id: equipment.id,
      tag: equipment.tag,
      submittedNema: submittal?.enclosureNema ?? null,
      submittedSourceId: submittal?.id ?? null,
      submittedDocumentId: submittal?.documentId ?? null,
      submittedPageNum: submittal?.pageNum ?? null,
    },
    specRequirements: specAtoms,
  };
}

export type EnclosureContradictionCandidate = {
  atom: RetrievedAtom;
  /** NEMA code extracted from this atom's content. */
  code: string;
};

export type EnclosureContradiction = {
  candidates: EnclosureContradictionCandidate[];
  distinctCodes: string[];
};

/**
 * Returns a contradiction record when retrieved spec atoms disagree on
 * the required enclosure NEMA code, otherwise null. Same first-class
 * finding semantics as the AIC contradiction (DECISIONS.md U5).
 *
 * Disagreement = at least two atoms each yielding a *different* NEMA
 * code. The rule still picks the strictest (highest rank) — this
 * detector flags the disagreement separately so the PM can reconcile
 * it before procurement, rather than silently inheriting the conservative
 * choice.
 */
export function detectEnclosureContradiction(
  atoms: RetrievedAtom[],
): EnclosureContradiction | null {
  const candidates: EnclosureContradictionCandidate[] = [];
  for (const atom of atoms) {
    const code = extractRequiredNemaFromSpec(atom.content);
    if (!code) continue;
    candidates.push({ atom, code });
  }
  if (candidates.length < 2) return null;

  const distinctCodes = Array.from(new Set(candidates.map((c) => c.code)));
  if (distinctCodes.length < 2) return null;

  return { candidates, distinctCodes };
}
