import { describe, expect, it } from "vitest";
import {
  evaluateEnclosure,
  extractRequiredNemaFromSpec,
  nemaRank,
} from "./enclosure";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { EnclosureTriple } from "./types";

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

const triple = (overrides: Partial<EnclosureTriple> = {}): EnclosureTriple => ({
  equipment: {
    id: "eq-1",
    tag: "MDP-A",
    submittedNema: "3R",
    submittedSourceId: "sf-1",
    submittedDocumentId: "doc-sub-1",
    submittedPageNum: 2,
  },
  specRequirements: [atom()],
  ...overrides,
});

describe("nemaRank", () => {
  it("ranks indoor codes (1, 12) below outdoor codes", () => {
    expect(nemaRank("1")).toBeLessThan(nemaRank("3R"));
    expect(nemaRank("12")).toBeLessThan(nemaRank("3R"));
  });

  it("ranks 3 above 3R (3 is full-weather, 3R is rain-only)", () => {
    expect(nemaRank("3")).toBeGreaterThan(nemaRank("3R"));
  });

  it("ranks 4X above 4 above 3", () => {
    expect(nemaRank("4X")).toBeGreaterThan(nemaRank("4"));
    expect(nemaRank("4")).toBeGreaterThan(nemaRank("3"));
  });

  it("returns 0 for unknown / null / empty", () => {
    expect(nemaRank(null)).toBe(0);
    expect(nemaRank("")).toBe(0);
    expect(nemaRank("99")).toBe(0);
  });

  it("uppercases input — accepts '4x' as '4X'", () => {
    expect(nemaRank("4x")).toBe(nemaRank("4X"));
  });
});

describe("extractRequiredNemaFromSpec", () => {
  it("extracts a single NEMA code", () => {
    expect(extractRequiredNemaFromSpec("Enclosure: NEMA 3R")).toBe("3R");
  });

  it("extracts the strictest code when multiple are stated", () => {
    expect(
      extractRequiredNemaFromSpec(
        "Provide NEMA 1 indoor or NEMA 3R outdoor as required.",
      ),
    ).toBe("3R");
  });

  it("recognizes 'Type N' shorthand", () => {
    expect(extractRequiredNemaFromSpec("Type 4X stainless")).toBe("4X");
  });

  it("returns null when no recognized NEMA code is present", () => {
    expect(extractRequiredNemaFromSpec("Provide copper conductors.")).toBeNull();
  });

  it("ignores codes outside the recognized set (e.g. 99)", () => {
    expect(extractRequiredNemaFromSpec("NEMA 99 enclosure")).toBeNull();
  });

  it("picks the more protective of 3 vs 3R when both appear", () => {
    expect(
      extractRequiredNemaFromSpec(
        "NEMA 3 outdoor weatherproof; NEMA 3R rainproof acceptable for protected locations.",
      ),
    ).toBe("3");
  });
});

describe("evaluateEnclosure", () => {
  it("returns compliant + cool when submitted is more protective than required", () => {
    const r = evaluateEnclosure(
      triple({
        equipment: { ...triple().equipment, submittedNema: "4X" },
        specRequirements: [atom({ content: "Enclosure: NEMA 3R" })],
      }),
    );
    expect(r?.verdict).toBe("compliant");
    expect(r?.severity).toBe("cool");
    expect(r?.confidence).toBe(0.95);
    expect(r?.summary).toContain("more protective");
  });

  it("returns compliant + warm when submitted exactly matches required (zero margin)", () => {
    const r = evaluateEnclosure(
      triple({
        equipment: { ...triple().equipment, submittedNema: "3R" },
        specRequirements: [atom({ content: "Enclosure: NEMA 3R" })],
      }),
    );
    expect(r?.verdict).toBe("compliant");
    expect(r?.severity).toBe("warm");
    expect(r?.summary).toContain("exact match");
  });

  it("returns non_compliant + hot when submitted is less protective", () => {
    const r = evaluateEnclosure(
      triple({
        equipment: { ...triple().equipment, submittedNema: "1" },
        specRequirements: [atom({ content: "Enclosure: NEMA 3R outdoor." })],
      }),
    );
    expect(r?.verdict).toBe("non_compliant");
    expect(r?.severity).toBe("hot");
    expect(r?.summary).toContain("less protective");
  });

  it("normalizes raw model output ('NEMA 3R') before comparing", () => {
    const r = evaluateEnclosure(
      triple({
        equipment: { ...triple().equipment, submittedNema: "NEMA 3R" },
        specRequirements: [atom({ content: "Enclosure: NEMA 3R" })],
      }),
    );
    expect(r?.verdict).toBe("compliant");
  });

  it("returns uncertain when no submitted value is present", () => {
    const r = evaluateEnclosure(
      triple({ equipment: { ...triple().equipment, submittedNema: null } }),
    );
    expect(r?.verdict).toBe("uncertain");
    expect(r?.severity).toBe("cool");
  });

  it("returns uncertain when no spec requirement is present (no project fallback)", () => {
    const r = evaluateEnclosure(triple({ specRequirements: [] }));
    expect(r?.verdict).toBe("uncertain");
    expect(r?.severity).toBe("cool");
  });

  it("returns null when neither submitted nor requirement is present", () => {
    expect(
      evaluateEnclosure(
        triple({
          equipment: { ...triple().equipment, submittedNema: null },
          specRequirements: [],
        }),
      ),
    ).toBeNull();
  });

  it("picks the strictest required NEMA across multiple atoms", () => {
    const r = evaluateEnclosure(
      triple({
        equipment: { ...triple().equipment, submittedNema: "3R" },
        specRequirements: [
          atom({ id: "a1", content: "Indoor panels: NEMA 1" }),
          atom({ id: "a2", content: "Outdoor switchboards: NEMA 4" }),
        ],
      }),
    );
    expect(r?.verdict).toBe("non_compliant"); // 3R < 4
    expect((r?.inputs as { requiredNema: string }).requiredNema).toBe("4");
  });
});
