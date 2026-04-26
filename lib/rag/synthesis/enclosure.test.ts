import { describe, expect, it } from "vitest";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import {
  buildEnclosureTriple,
  detectEnclosureContradiction,
  type EnclosureSubmittalInput,
} from "./enclosure";

const atom = (overrides: Partial<RetrievedAtom> = {}): RetrievedAtom => ({
  id: "00000000-0000-0000-0000-00000000aaaa",
  sourceKind: "spec_paragraph",
  documentId: "00000000-0000-0000-0000-00000000bbbb",
  pageNum: 5,
  csiSection: "26 24 16",
  csiPart: "2",
  csiArticle: "2.2",
  csiParagraph: "C",
  requirementType: "enclosure",
  referencedStandards: ["UL 50"],
  content: "Enclosure: NEMA 3R outdoor weather-resistant.",
  score: 0.8,
  ranks: { bm25: 1, vector: 1 },
  ...overrides,
});

const submittal = (
  overrides: Partial<EnclosureSubmittalInput> = {},
): EnclosureSubmittalInput => ({
  id: "sf-1",
  documentId: "doc-sub-1",
  pageNum: 2,
  enclosureNema: "3R",
  ...overrides,
});

describe("buildEnclosureTriple", () => {
  it("wires submittal + spec atoms into the rule's triple shape", () => {
    const t = buildEnclosureTriple({
      equipment: { id: "eq-1", tag: "MDP-A" },
      submittal: submittal(),
      specAtoms: [atom()],
    });
    expect(t.equipment.submittedNema).toBe("3R");
    expect(t.equipment.submittedSourceId).toBe("sf-1");
    expect(t.specRequirements).toHaveLength(1);
  });

  it("nulls submittal fields when no submittal is provided", () => {
    const t = buildEnclosureTriple({
      equipment: { id: "eq-1", tag: "MDP-A" },
      submittal: null,
      specAtoms: [atom()],
    });
    expect(t.equipment.submittedNema).toBeNull();
    expect(t.equipment.submittedSourceId).toBeNull();
  });
});

describe("detectEnclosureContradiction", () => {
  it("returns null when fewer than 2 atoms yield NEMA codes", () => {
    expect(
      detectEnclosureContradiction([
        atom({ id: "a1", content: "Provide adequate enclosure." }),
      ]),
    ).toBeNull();
  });

  it("returns null when atoms agree on the same code", () => {
    expect(
      detectEnclosureContradiction([
        atom({ id: "a1", content: "Enclosure: NEMA 3R" }),
        atom({ id: "a2", content: "Type 3R outdoor" }),
      ]),
    ).toBeNull();
  });

  it("returns a contradiction when atoms disagree on codes", () => {
    const c = detectEnclosureContradiction([
      atom({ id: "a1", content: "Indoor panels: NEMA 1" }),
      atom({ id: "a2", content: "All panels: NEMA 4X stainless" }),
    ]);
    expect(c).not.toBeNull();
    expect(new Set(c?.distinctCodes ?? [])).toEqual(new Set(["1", "4X"]));
    expect(c?.candidates).toHaveLength(2);
  });

  it("ignores atoms whose codes are unrecognized (NEMA 99)", () => {
    expect(
      detectEnclosureContradiction([
        atom({ id: "a1", content: "NEMA 99 enclosure" }),
        atom({ id: "a2", content: "NEMA 3R enclosure" }),
      ]),
    ).toBeNull();
  });
});
