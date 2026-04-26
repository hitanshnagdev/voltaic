/**
 * Synthesis helpers for the SCCR rule. Mirrors synthesis/aic.ts — same
 * shape because the rule has the same numeric ≥ form, with SCCR
 * substituted for AIC throughout.
 */

import { extractRequiredSccrKaFromSpec } from "@/lib/rag/rules/sccr";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { SccrTriple } from "@/lib/rag/rules/types";

export type SccrEquipmentInput = {
  id: string;
  tag: string | null;
};

export type SccrSubmittalInput = {
  id: string;
  documentId: string;
  pageNum: number | null;
  sccrKa: number | null;
};

export function buildSccrTriple(input: {
  equipment: SccrEquipmentInput;
  submittal: SccrSubmittalInput | null;
  specAtoms: RetrievedAtom[];
  projectFaultCurrentKa: number | null;
}): SccrTriple {
  const { equipment, submittal, specAtoms, projectFaultCurrentKa } = input;
  return {
    equipment: {
      id: equipment.id,
      tag: equipment.tag,
      submittedSccrKa: submittal?.sccrKa ?? null,
      submittedSourceId: submittal?.id ?? null,
      submittedDocumentId: submittal?.documentId ?? null,
      submittedPageNum: submittal?.pageNum ?? null,
    },
    specRequirements: specAtoms,
    projectFaultCurrentKa,
  };
}

export type SccrContradictionCandidate = {
  atom: RetrievedAtom;
  ka: number;
};

export type SccrContradiction = {
  candidates: SccrContradictionCandidate[];
  distinctKas: number[];
};

/**
 * Returns a contradiction record when retrieved spec atoms disagree on
 * the required SCCR kA. Same first-class-finding semantics as AIC's
 * detector (DECISIONS.md U5).
 */
export function detectSccrContradiction(
  atoms: RetrievedAtom[],
): SccrContradiction | null {
  const candidates: SccrContradictionCandidate[] = [];
  for (const atom of atoms) {
    const ka = extractRequiredSccrKaFromSpec(atom.content);
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
