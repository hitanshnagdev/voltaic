import { describe, expect, it } from "vitest";
import { buildRow, isEvaluated } from "./compare";
import type { AttributeDef } from "@/lib/rag/compare/attributes";
import type { RetrievedAtom } from "@/lib/rag/retrieve/hybrid";

const atom = (overrides: Partial<RetrievedAtom> = {}): RetrievedAtom => ({
  id: "atom-1",
  sourceKind: "spec_paragraph",
  documentId: "spec-doc-1",
  pageNum: 4,
  csiSection: "26 24 16",
  csiPart: "2",
  csiArticle: "2.2",
  csiParagraph: "A",
  requirementType: "other",
  referencedStandards: ["UL 67"],
  content: "UL 67 listed and labeled.",
  score: 0.9,
  ranks: { bm25: 1, vector: 1 },
  ...overrides,
});

const submittal = (fields: Record<string, unknown> = {}) => ({
  documentId: "sub-doc-1",
  fields,
});

const ruleAttr = (overrides: Partial<AttributeDef> = {}): AttributeDef => ({
  display: "AIC rating",
  group: "Ratings & listings",
  kind: "rule_driven",
  ruleId: "aic",
  readSubmitted: (f) =>
    typeof f.aic_ka === "number" ? `${f.aic_ka} kA` : null,
  ...overrides,
});

const equalityAttr = (
  overrides: Partial<AttributeDef> = {},
): AttributeDef => ({
  display: "UL listing",
  group: "Ratings & listings",
  kind: "value_equality",
  readSubmitted: (f) =>
    Array.isArray(f.listings) ? (f.listings as string[]).join(", ") : null,
  retrievalQuery: "UL listing",
  requirementType: null,
  extractRequired: (a) => {
    const m = a.content.match(/UL\s+\d+/);
    return m ? m[0] : null;
  },
  inlineCheck: (sub, req) => {
    if (!sub && !req) return "informational";
    if (!sub || !req) return "uncertain";
    return sub.toLowerCase().includes(req.toLowerCase())
      ? "compliant"
      : "non_compliant";
  },
  ...overrides,
});

const notExtractedAttr = (): AttributeDef => ({
  display: "Bus material",
  group: "Construction",
  kind: "not_extracted",
  readSubmitted: () => null,
});

describe("buildRow — rule_driven attributes", () => {
  it("populates verdict + severity + spec citation from a matching finding", () => {
    const row = buildRow({
      attr: ruleAttr(),
      submittal: submittal({ aic_ka: 42 }),
      findings: [
        {
          id: "finding-1",
          ruleId: "aic",
          verdict: "non_compliant",
          severity: "hot",
          summary: "MDP-A AIC 42 kA < required 65 kA. Short by 23 kA.",
          evidence: [
            {
              sourceKind: "submittal_field",
              documentId: "sub-doc-1",
              pageNum: 2,
              snippet: "AIC: 42 kA",
            },
            {
              sourceKind: "spec_paragraph",
              documentId: "spec-doc-1",
              pageNum: 4,
              snippet: "AIC shall be not less than 65,000 amperes RMS.",
            },
          ],
        },
      ],
      retrievedAtom: null,
    });
    expect(row.verdict).toBe("non_compliant");
    expect(row.severity).toBe("hot");
    expect(row.findingId).toBe("finding-1");
    expect(row.specRef).toBe("p. 4");
    expect(row.specPage).toBe(4);
    expect(row.required).toContain("65,000");
    expect(row.submitted).toBe("42 kA");
    expect(row.reason).toContain("Short by 23");
  });

  it("uses missing_value verdict when no finding AND no submitted value", () => {
    const row = buildRow({
      attr: ruleAttr(),
      submittal: submittal({}),
      findings: [],
      retrievedAtom: null,
    });
    expect(row.verdict).toBe("missing_value");
    expect(row.severity).toBeNull();
    expect(row.findingId).toBeNull();
    expect(row.reason).toContain("No submitted value");
  });

  it("uses missing_requirement verdict when submitted value exists but no finding fired", () => {
    const row = buildRow({
      attr: ruleAttr(),
      submittal: submittal({ aic_ka: 65 }),
      findings: [],
      retrievedAtom: null,
    });
    expect(row.verdict).toBe("missing_requirement");
    expect(row.submitted).toBe("65 kA");
    expect(row.reason).toContain("spec requirement not retrieved");
  });

  it("ignores findings whose ruleId doesn't match the attribute", () => {
    const row = buildRow({
      attr: ruleAttr(), // aic
      submittal: submittal({ aic_ka: 65 }),
      findings: [
        {
          id: "f-sccr",
          ruleId: "sccr",
          verdict: "non_compliant",
          severity: "hot",
          summary: "SCCR fail",
          evidence: [],
        },
      ],
      retrievedAtom: null,
    });
    expect(row.findingId).toBeNull();
    expect(row.verdict).toBe("missing_requirement");
  });
});

describe("buildRow — value_equality attributes", () => {
  it("returns compliant when submitted contains required (subsumption case)", () => {
    const row = buildRow({
      attr: equalityAttr(),
      submittal: submittal({ listings: ["UL 67"] }),
      findings: [],
      retrievedAtom: atom({ content: "Provide UL 67 listed panelboards." }),
    });
    expect(row.verdict).toBe("compliant");
    expect(row.required).toBe("UL 67");
    expect(row.submitted).toBe("UL 67");
    expect(row.specRef).toBe("p. 4");
  });

  it("returns non_compliant when values mismatch", () => {
    const row = buildRow({
      attr: equalityAttr(),
      submittal: submittal({ listings: ["UL 891"] }),
      findings: [],
      retrievedAtom: atom({ content: "Provide UL 67 listed panelboards." }),
    });
    expect(row.verdict).toBe("non_compliant");
    expect(row.required).toBe("UL 67");
    expect(row.submitted).toBe("UL 891");
    expect(row.reason).toContain("does not match");
  });

  it("returns missing_value when submittal silent on this attribute", () => {
    const row = buildRow({
      attr: equalityAttr(),
      submittal: submittal({}),
      findings: [],
      retrievedAtom: atom({ content: "Provide UL 67 listed panelboards." }),
    });
    expect(row.verdict).toBe("missing_value");
    expect(row.submitted).toBeNull();
    expect(row.required).toBe("UL 67");
  });

  it("returns missing_requirement when retrieve found nothing extractable", () => {
    const row = buildRow({
      attr: equalityAttr(),
      submittal: submittal({ listings: ["UL 891"] }),
      findings: [],
      retrievedAtom: null, // retrieve surfaced no spec atom
    });
    expect(row.verdict).toBe("missing_requirement");
    expect(row.submitted).toBe("UL 891");
    expect(row.required).toBeNull();
  });

  it("returns informational when both sides absent (don't dilute pass-rate)", () => {
    const row = buildRow({
      attr: equalityAttr(),
      submittal: submittal({}),
      findings: [],
      retrievedAtom: null,
    });
    expect(row.verdict).toBe("informational");
    expect(isEvaluated(row)).toBe(false);
  });
});

describe("buildRow — not_extracted attributes", () => {
  it("always returns not_extracted with an explanatory reason", () => {
    const row = buildRow({
      attr: notExtractedAttr(),
      submittal: submittal({}),
      findings: [],
      retrievedAtom: null,
    });
    expect(row.verdict).toBe("not_extracted");
    expect(row.reason).toContain("Phase B coverage gap");
    expect(isEvaluated(row)).toBe(false);
  });
});

describe("isEvaluated", () => {
  // The pass-rate denominator excludes rows where there was nothing
  // real to compare. Otherwise the demo's "X/Y pass" looks artificially
  // bad just because we don't extract bus material yet.
  it.each([
    ["compliant", true],
    ["non_compliant", true],
    ["uncertain", true],
    ["missing_value", true],
    ["missing_requirement", false],
    ["informational", false],
    ["not_extracted", false],
  ] as const)("verdict=%s → evaluated=%s", (verdict, expected) => {
    expect(
      isEvaluated({
        attribute: "x",
        group: "Ratings & listings",
        kind: "value_equality",
        specRef: null,
        required: null,
        submitted: null,
        verdict,
        severity: null,
        reason: null,
        findingId: null,
        submittalDocumentId: null,
        specDocumentId: null,
        specPage: null,
      }),
    ).toBe(expected);
  });
});
