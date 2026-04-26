import { describe, expect, it } from "vitest";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import {
  buildSccrTriple,
  detectSccrContradiction,
  type SccrSubmittalInput,
} from "./sccr";

const atom = (overrides: Partial<RetrievedAtom> = {}): RetrievedAtom => ({
  id: "00000000-0000-0000-0000-00000000aaaa",
  sourceKind: "spec_paragraph",
  documentId: "00000000-0000-0000-0000-00000000bbbb",
  pageNum: 4,
  csiSection: "26 24 16",
  csiPart: "2",
  csiArticle: "2.2",
  csiParagraph: "B",
  requirementType: "sccr",
  referencedStandards: ["UL 891"],
  content: "Bus Assembly SCCR: Minimum 65 kA at 480V.",
  score: 0.8,
  ranks: { bm25: 1, vector: 1 },
  ...overrides,
});

const submittal = (
  overrides: Partial<SccrSubmittalInput> = {},
): SccrSubmittalInput => ({
  id: "sf-1",
  documentId: "doc-sub-1",
  pageNum: 2,
  sccrKa: 65,
  ...overrides,
});

describe("buildSccrTriple", () => {
  it("wires submittal + spec atoms into the rule's triple shape", () => {
    const t = buildSccrTriple({
      equipment: { id: "eq-1", tag: "SWB-1" },
      submittal: submittal(),
      specAtoms: [atom()],
      projectFaultCurrentKa: 65,
    });
    expect(t.equipment.submittedSccrKa).toBe(65);
    expect(t.equipment.submittedSourceId).toBe("sf-1");
    expect(t.specRequirements).toHaveLength(1);
    expect(t.projectFaultCurrentKa).toBe(65);
  });

  it("nulls submittal fields when no submittal is provided", () => {
    const t = buildSccrTriple({
      equipment: { id: "eq-1", tag: "SWB-1" },
      submittal: null,
      specAtoms: [atom()],
      projectFaultCurrentKa: null,
    });
    expect(t.equipment.submittedSccrKa).toBeNull();
    expect(t.equipment.submittedSourceId).toBeNull();
  });
});

describe("detectSccrContradiction", () => {
  it("returns null when fewer than 2 atoms yield kA values", () => {
    expect(
      detectSccrContradiction([
        atom({ id: "a1", content: "Provide adequate SCCR." }), // no number
      ]),
    ).toBeNull();
  });

  it("returns null when all atoms agree on the same kA value", () => {
    expect(
      detectSccrContradiction([
        atom({ id: "a1", content: "SCCR: 65 kA" }),
        atom({ id: "a2", content: "Bus bracing: 65 kA" }),
      ]),
    ).toBeNull();
  });

  it("returns a contradiction when atoms disagree on kA values", () => {
    const c = detectSccrContradiction([
      atom({ id: "a1", content: "SCCR: 22 kA at branch panels" }),
      atom({ id: "a2", content: "Bus bracing: 65 kA at MDPs" }),
    ]);
    expect(c).not.toBeNull();
    expect(c?.distinctKas).toEqual([65, 22]);
    expect(c?.candidates[0].ka).toBe(65); // sorted desc
    expect(c?.candidates[1].ka).toBe(22);
  });

  it("ignores atoms with no SCCR / withstand context (no false contradictions from AIC text)", () => {
    expect(
      detectSccrContradiction([
        atom({ id: "a1", content: "Breaker AIC: 22 kAIC" }), // no SCCR context
        atom({ id: "a2", content: "Bus bracing: 65 kA" }),
      ]),
    ).toBeNull();
  });
});
