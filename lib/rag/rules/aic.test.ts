import { describe, expect, it } from "vitest";
import { evaluateAic, extractRequiredKaFromSpec } from "./aic";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import type { AicTriple } from "./types";

const atom = (
  overrides: Partial<RetrievedAtom> = {},
): RetrievedAtom => ({
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

const triple = (overrides: Partial<AicTriple> = {}): AicTriple => ({
  equipment: {
    id: "eq-1",
    tag: "MDP-A",
    submittedAicKa: 65,
    submittedSourceId: "sf-1",
    submittedDocumentId: "doc-sub-1",
    submittedPageNum: 2,
  },
  specRequirements: [atom()],
  projectFaultCurrentKa: 65,
  ...overrides,
});

describe("extractRequiredKaFromSpec", () => {
  it("extracts a plain kAIC value", () => {
    expect(extractRequiredKaFromSpec("Minimum 65 kAIC")).toBe(65);
  });

  it("extracts kA with no AIC suffix", () => {
    expect(extractRequiredKaFromSpec("interrupting rating of 42 kA")).toBe(42);
  });

  it("normalizes Amps with thousands separator to kA", () => {
    expect(extractRequiredKaFromSpec("65,000 AIC symmetrical")).toBe(65);
  });

  it("returns the highest candidate when multiple are present", () => {
    expect(
      extractRequiredKaFromSpec(
        "Some equipment 22 kAIC, certain feeders shall be 65 kAIC.",
      ),
    ).toBe(65);
  });

  it("tolerates collapsed spacing like 65kA", () => {
    expect(extractRequiredKaFromSpec("interrupting capacity of 65kA")).toBe(65);
  });

  it("returns null when no kA-shaped number is present", () => {
    expect(extractRequiredKaFromSpec("Provide copper conductors.")).toBeNull();
  });

  it("ignores values that aren't kA (e.g. raw amperes without AIC marker)", () => {
    expect(extractRequiredKaFromSpec("400 A frame")).toBeNull();
  });
});

describe("evaluateAic", () => {
  it("returns compliant + cool when submitted ≥ spec-cited requirement with margin", () => {
    const result = evaluateAic(
      triple({
        equipment: {
          ...triple().equipment,
          submittedAicKa: 100,
        },
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.verdict).toBe("compliant");
    expect(result!.severity).toBe("cool");
    expect(result!.confidence).toBeCloseTo(0.95);
    expect(result!.inputs.requirementSource).toBe("spec");
  });

  it("returns warm severity for an exact-match (no margin) compliance", () => {
    const result = evaluateAic(triple({ projectFaultCurrentKa: null }));
    expect(result!.verdict).toBe("compliant");
    expect(result!.severity).toBe("warm");
    expect(result!.summary).toMatch(/exact match/);
  });

  it("returns hot non_compliant when submitted < spec-cited requirement", () => {
    const result = evaluateAic(
      triple({
        equipment: {
          ...triple().equipment,
          submittedAicKa: 42,
        },
      }),
    );
    expect(result!.verdict).toBe("non_compliant");
    expect(result!.severity).toBe("hot");
    expect(result!.confidence).toBeCloseTo(0.95);
    expect(result!.inputs.marginKa).toBe(-23);
    expect(result!.summary).toMatch(/Short by/);
  });

  it("returns warm (not hot) failure when only the project-fallback requirement disagrees", () => {
    const result = evaluateAic({
      equipment: {
        id: "eq-2",
        tag: "PP-1A",
        submittedAicKa: 22,
        submittedSourceId: "sf-2",
        submittedDocumentId: "doc-sub-2",
        submittedPageNum: 1,
      },
      specRequirements: [], // no spec hit
      projectFaultCurrentKa: 42,
    });
    expect(result!.verdict).toBe("non_compliant");
    expect(result!.severity).toBe("warm");
    expect(result!.confidence).toBeCloseTo(0.7);
    expect(result!.inputs.requirementSource).toBe("project");
  });

  it("prefers the highest spec value when multiple atoms are returned by retrieve", () => {
    const result = evaluateAic(
      triple({
        specRequirements: [
          atom({ id: "lo", content: "Minimum 22 kAIC at 480V." }),
          atom({ id: "hi", content: "Minimum 65 kAIC at 480V." }),
        ],
      }),
    );
    expect(result!.inputs.requiredKa).toBe(65);
  });

  it("ignores spec atoms that contain no kA-shaped number", () => {
    const result = evaluateAic(
      triple({
        specRequirements: [atom({ content: "All conductors shall be copper." })],
        projectFaultCurrentKa: 42,
        equipment: {
          ...triple().equipment,
          submittedAicKa: 65,
        },
      }),
    );
    expect(result!.inputs.requirementSource).toBe("project");
    expect(result!.inputs.requiredKa).toBe(42);
  });

  it("returns uncertain at cool severity when submitted is missing but requirement exists", () => {
    const result = evaluateAic(
      triple({
        equipment: {
          ...triple().equipment,
          submittedAicKa: null,
          submittedSourceId: null,
          submittedDocumentId: null,
          submittedPageNum: null,
        },
      }),
    );
    expect(result!.verdict).toBe("uncertain");
    expect(result!.severity).toBe("cool");
    expect(result!.evidence.find((e) => e.sourceKind === "submittal_field")).toBeUndefined();
  });

  it("returns uncertain at cool severity when submitted exists but no requirement", () => {
    const result = evaluateAic(
      triple({
        specRequirements: [],
        projectFaultCurrentKa: null,
      }),
    );
    expect(result!.verdict).toBe("uncertain");
    expect(result!.confidence).toBeCloseTo(0.3);
  });

  it("returns null when both submitted and requirement are absent (no finding)", () => {
    const result = evaluateAic(
      triple({
        equipment: {
          ...triple().equipment,
          submittedAicKa: null,
          submittedSourceId: null,
          submittedDocumentId: null,
          submittedPageNum: null,
        },
        specRequirements: [],
        projectFaultCurrentKa: null,
      }),
    );
    expect(result).toBeNull();
  });

  it("attaches both submittal and spec evidence with role='primary'", () => {
    const result = evaluateAic(triple());
    const submittalEv = result!.evidence.find(
      (e) => e.sourceKind === "submittal_field",
    );
    const specEv = result!.evidence.find(
      (e) => e.sourceKind === "spec_paragraph",
    );
    expect(submittalEv?.role).toBe("primary");
    expect(specEv?.role).toBe("primary");
    expect(specEv?.documentId).toBe(atom().documentId);
    expect(specEv?.snippet).toContain("65 kAIC");
  });
});
