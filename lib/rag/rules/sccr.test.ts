import { describe, expect, it } from "vitest";
import { evaluateSccr, extractRequiredSccrKaFromSpec } from "./sccr";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { SccrTriple } from "./types";

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
  content: "Bus Assembly SCCR: Minimum 65 kA at 480V symmetrical.",
  score: 0.8,
  ranks: { bm25: 1, vector: 1 },
  ...overrides,
});

const triple = (overrides: Partial<SccrTriple> = {}): SccrTriple => ({
  equipment: {
    id: "eq-1",
    tag: "SWB-1",
    submittedSccrKa: 65,
    submittedSourceId: "sf-1",
    submittedDocumentId: "doc-sub-1",
    submittedPageNum: 2,
  },
  specRequirements: [atom()],
  projectFaultCurrentKa: 65,
  ...overrides,
});

describe("extractRequiredSccrKaFromSpec", () => {
  it("extracts kA with explicit SCCR mention", () => {
    expect(extractRequiredSccrKaFromSpec("Minimum SCCR 65 kA")).toBe(65);
  });

  it("extracts kA from a 'short-circuit current rating' clause", () => {
    expect(
      extractRequiredSccrKaFromSpec("short-circuit current rating of 42 kA"),
    ).toBe(42);
  });

  it("extracts kA from a 'withstand rating' clause", () => {
    expect(extractRequiredSccrKaFromSpec("withstand rating: 65 kA")).toBe(65);
  });

  it("extracts kA from a 'bus bracing' clause (switchboard convention)", () => {
    expect(extractRequiredSccrKaFromSpec("Bus bracing: 65 kA RMS")).toBe(65);
  });

  it("normalizes amps form to kA when SCCR context is present", () => {
    expect(
      extractRequiredSccrKaFromSpec(
        "withstand rating not less than 65,000 A symmetrical",
      ),
    ).toBe(65);
  });

  it("picks the highest candidate when the paragraph lists tiered ratings", () => {
    expect(
      extractRequiredSccrKaFromSpec(
        "SCCR: Branch panels 22 kA; distribution boards 65 kA.",
      ),
    ).toBe(65);
  });

  it("returns null when no SCCR / withstand / bus-bracing context is present", () => {
    // 65 kAIC mentioned but no SCCR context → not an SCCR requirement.
    // The AIC rule will pick this up; SCCR shouldn't double-count it.
    expect(
      extractRequiredSccrKaFromSpec("Breaker AIC: 65 kAIC"),
    ).toBeNull();
  });

  it("returns null when SCCR context exists but no kA value is mentioned", () => {
    expect(extractRequiredSccrKaFromSpec("Provide adequate SCCR.")).toBeNull();
  });
});

describe("evaluateSccr", () => {
  it("returns compliant + cool when submitted exceeds required with margin (spec-cited)", () => {
    const r = evaluateSccr(triple({ equipment: { ...triple().equipment, submittedSccrKa: 100 } }));
    expect(r?.verdict).toBe("compliant");
    expect(r?.severity).toBe("cool");
    expect(r?.confidence).toBe(0.95);
    expect(r?.summary).toContain("100 kA");
    expect(r?.evidence.length).toBe(2);
  });

  it("returns non_compliant + hot when submitted < required (spec-cited)", () => {
    const r = evaluateSccr(triple({ equipment: { ...triple().equipment, submittedSccrKa: 22 } }));
    expect(r?.verdict).toBe("non_compliant");
    expect(r?.severity).toBe("hot");
    expect(r?.summary).toContain("Bus assembly cannot withstand");
    expect(r?.summary).toContain("short by 43");
  });

  it("returns warm + non_compliant when failure is on the project fallback (no spec cite)", () => {
    const r = evaluateSccr(
      triple({
        equipment: { ...triple().equipment, submittedSccrKa: 22 },
        specRequirements: [],
        projectFaultCurrentKa: 65,
      }),
    );
    expect(r?.verdict).toBe("non_compliant");
    expect(r?.severity).toBe("warm"); // fallback evidence quality demotes
    expect(r?.confidence).toBe(0.7);
  });

  it("returns compliant + warm when submitted == required exactly (zero margin is surfaceable)", () => {
    const r = evaluateSccr(triple({ equipment: { ...triple().equipment, submittedSccrKa: 65 } }));
    expect(r?.verdict).toBe("compliant");
    expect(r?.severity).toBe("warm");
    expect(r?.summary).toContain("exact match");
  });

  it("returns uncertain when no submitted value is present", () => {
    const r = evaluateSccr(triple({
      equipment: { ...triple().equipment, submittedSccrKa: null },
    }));
    expect(r?.verdict).toBe("uncertain");
    expect(r?.severity).toBe("cool");
    expect(r?.summary).toContain("no submittal SCCR value found");
  });

  it("returns uncertain when no requirement source is present", () => {
    const r = evaluateSccr(triple({
      specRequirements: [],
      projectFaultCurrentKa: null,
    }));
    expect(r?.verdict).toBe("uncertain");
    expect(r?.severity).toBe("cool");
    expect(r?.summary).toContain("no required value");
  });

  it("returns null when neither submitted nor requirement is present", () => {
    expect(
      evaluateSccr(
        triple({
          equipment: { ...triple().equipment, submittedSccrKa: null },
          specRequirements: [],
          projectFaultCurrentKa: null,
        }),
      ),
    ).toBeNull();
  });

  it("picks the highest required kA across multiple spec atoms", () => {
    const r = evaluateSccr(
      triple({
        equipment: { ...triple().equipment, submittedSccrKa: 50 },
        specRequirements: [
          atom({ id: "a1", content: "Bus bracing: 22 kA on branch panels" }),
          atom({ id: "a2", content: "Switchboard SCCR: 65 kA at MDP" }),
        ],
      }),
    );
    // 50 < 65 → non_compliant
    expect(r?.verdict).toBe("non_compliant");
    expect((r?.inputs as { requiredKa: number }).requiredKa).toBe(65);
  });
});
