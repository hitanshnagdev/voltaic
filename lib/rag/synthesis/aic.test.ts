import { describe, expect, it } from "vitest";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import {
  buildAicTriple,
  detectAicContradiction,
  type AicSubmittalInput,
} from "./aic";

const atom = (overrides: Partial<RetrievedAtom> = {}): RetrievedAtom => ({
  id: "00000000-0000-0000-0000-00000000aaaa",
  sourceKind: "spec_paragraph",
  documentId: "00000000-0000-0000-0000-00000000bbbb",
  pageNum: 4,
  csiSection: "26 24 16",
  csiPart: "2",
  csiArticle: "2.2",
  csiParagraph: "A",
  requirementType: "aic",
  referencedStandards: ["UL 67"],
  content: "Short-Circuit Current Rating: Minimum 65 kAIC at 480V.",
  score: 0.8,
  ranks: { bm25: 1, vector: 1 },
  ...overrides,
});

const submittal = (
  overrides: Partial<AicSubmittalInput> = {},
): AicSubmittalInput => ({
  id: "sf-1",
  documentId: "doc-sub-1",
  pageNum: 2,
  aicKa: 65,
  ...overrides,
});

describe("buildAicTriple", () => {
  it("wires submittal + spec atoms into the rule's triple shape", () => {
    const triple = buildAicTriple({
      equipment: { id: "eq-1", tag: "MDP-A" },
      submittal: submittal(),
      specAtoms: [atom()],
      projectFaultCurrentKa: 65,
    });
    expect(triple.equipment.id).toBe("eq-1");
    expect(triple.equipment.tag).toBe("MDP-A");
    expect(triple.equipment.submittedAicKa).toBe(65);
    expect(triple.equipment.submittedSourceId).toBe("sf-1");
    expect(triple.equipment.submittedDocumentId).toBe("doc-sub-1");
    expect(triple.equipment.submittedPageNum).toBe(2);
    expect(triple.specRequirements).toHaveLength(1);
    expect(triple.projectFaultCurrentKa).toBe(65);
  });

  it("nulls out submittal fields when no submittal is provided", () => {
    const triple = buildAicTriple({
      equipment: { id: "eq-1", tag: "MDP-A" },
      submittal: null,
      specAtoms: [atom()],
      projectFaultCurrentKa: null,
    });
    expect(triple.equipment.submittedAicKa).toBeNull();
    expect(triple.equipment.submittedSourceId).toBeNull();
    expect(triple.equipment.submittedDocumentId).toBeNull();
    expect(triple.equipment.submittedPageNum).toBeNull();
  });

  it("propagates a null aicKa even when other submittal fields are present", () => {
    // The runner may load a submittal_field row whose normalized fields bag
    // didn't include aic_ka — buildAicTriple shouldn't fabricate one.
    const triple = buildAicTriple({
      equipment: { id: "eq-1", tag: "MDP-A" },
      submittal: submittal({ aicKa: null }),
      specAtoms: [],
      projectFaultCurrentKa: 42,
    });
    expect(triple.equipment.submittedAicKa).toBeNull();
    expect(triple.equipment.submittedSourceId).toBe("sf-1");
    expect(triple.projectFaultCurrentKa).toBe(42);
  });
});

describe("detectAicContradiction", () => {
  it("returns null when no atoms supply a numeric kA", () => {
    expect(
      detectAicContradiction([
        atom({ id: "a", content: "Provide copper conductors throughout." }),
        atom({ id: "b", content: "Refer to NEMA PB 1 for installation." }),
      ]),
    ).toBeNull();
  });

  it("returns null when only one atom supplies a numeric kA", () => {
    expect(
      detectAicContradiction([
        atom({ id: "a", content: "Minimum 65 kAIC at 480V." }),
        atom({ id: "b", content: "Provide copper conductors." }),
      ]),
    ).toBeNull();
  });

  it("returns null when multiple atoms agree on the same kA", () => {
    expect(
      detectAicContradiction([
        atom({ id: "a", content: "Minimum 65 kAIC at 480V." }),
        atom({ id: "b", content: "Interrupting rating of 65 kA at the main." }),
      ]),
    ).toBeNull();
  });

  it("returns a contradiction when two atoms disagree on the kA value", () => {
    const result = detectAicContradiction([
      atom({ id: "high", content: "Minimum 65 kAIC at 480V." }),
      atom({ id: "low", content: "Provide 22 kAIC at branch panels." }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.distinctKas).toEqual([65, 22]);
    expect(result!.candidates).toHaveLength(2);
    // sorted by kA desc
    expect(result!.candidates[0].atom.id).toBe("high");
    expect(result!.candidates[1].atom.id).toBe("low");
  });

  it("ignores atoms with no kA when detecting disagreement among the rest", () => {
    const result = detectAicContradiction([
      atom({ id: "noise", content: "All conductors shall be copper." }),
      atom({ id: "a", content: "Minimum 65 kAIC." }),
      atom({ id: "b", content: "Branch panels: 22 kAIC." }),
    ]);
    expect(result).not.toBeNull();
    expect(result!.distinctKas).toEqual([65, 22]);
    expect(result!.candidates.map((c) => c.atom.id)).toEqual(["a", "b"]);
  });

  it("collapses duplicates so distinctKas only carries unique values", () => {
    const result = detectAicContradiction([
      atom({ id: "a", content: "Minimum 65 kAIC at main." }),
      atom({ id: "b", content: "Minimum 65 kAIC at distribution." }),
      atom({ id: "c", content: "Branch panels: 22 kAIC." }),
    ]);
    expect(result!.distinctKas).toEqual([65, 22]);
    // candidates retain all three atoms (the contradiction binds evidence,
    // not just the distinct values)
    expect(result!.candidates).toHaveLength(3);
  });
});
