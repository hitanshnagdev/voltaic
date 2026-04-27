import { describe, expect, it } from "vitest";
import {
  buildCompareRow,
  computeVerdict,
  type Comparator,
  type RequiredKind,
} from "./compare";

const item = (overrides: Partial<{
  id: string;
  attribute: string;
  requiredKind: RequiredKind;
  comparator: Comparator;
  requiredValue: unknown;
  unit: string | null;
  rawQuote: string;
  csiPath: string;
}> = {}) => ({
  id: "item-1",
  attribute: "aic_ka",
  requiredKind: "numeric" as RequiredKind,
  comparator: "≥" as Comparator,
  requiredValue: 65,
  unit: "kA",
  rawQuote: "AIC shall be not less than 65 kA",
  csiPath: "26 24 16/2/2.05/B",
  ...overrides,
});

describe("computeVerdict", () => {
  it("numeric ≥: compliant when submitted >= required", () => {
    expect(
      computeVerdict({
        submittedValue: 65,
        requiredKind: "numeric",
        comparator: "≥",
        requiredValue: 65,
      }),
    ).toBe("compliant");
    expect(
      computeVerdict({
        submittedValue: 100,
        requiredKind: "numeric",
        comparator: "≥",
        requiredValue: 65,
      }),
    ).toBe("compliant");
  });

  it("numeric ≥: non_compliant when submitted < required", () => {
    expect(
      computeVerdict({
        submittedValue: 42,
        requiredKind: "numeric",
        comparator: "≥",
        requiredValue: 65,
      }),
    ).toBe("non_compliant");
  });

  it("numeric ≤: compliant when submitted <= required", () => {
    expect(
      computeVerdict({
        submittedValue: 5,
        requiredKind: "numeric",
        comparator: "≤",
        requiredValue: 10,
      }),
    ).toBe("compliant");
  });

  it("numeric =: exact equality only", () => {
    expect(
      computeVerdict({
        submittedValue: 480,
        requiredKind: "numeric",
        comparator: "=",
        requiredValue: 480,
      }),
    ).toBe("compliant");
    expect(
      computeVerdict({
        submittedValue: 481,
        requiredKind: "numeric",
        comparator: "=",
        requiredValue: 480,
      }),
    ).toBe("non_compliant");
  });

  it("boolean =: matches the canonical 'series-rated prohibited' case", () => {
    // Spec says series_rated must be FALSE; submittal IS series-rated.
    expect(
      computeVerdict({
        submittedValue: true,
        requiredKind: "boolean",
        comparator: "=",
        requiredValue: false,
      }),
    ).toBe("non_compliant");
    expect(
      computeVerdict({
        submittedValue: false,
        requiredKind: "boolean",
        comparator: "=",
        requiredValue: false,
      }),
    ).toBe("compliant");
  });

  it("enum =: exact string match", () => {
    expect(
      computeVerdict({
        submittedValue: "3R",
        requiredKind: "enum",
        comparator: "=",
        requiredValue: "3R",
      }),
    ).toBe("compliant");
    expect(
      computeVerdict({
        submittedValue: "1",
        requiredKind: "enum",
        comparator: "=",
        requiredValue: "3R",
      }),
    ).toBe("non_compliant");
  });

  it("enum in: membership in array of acceptable values", () => {
    expect(
      computeVerdict({
        submittedValue: "3R",
        requiredKind: "enum",
        comparator: "in",
        requiredValue: ["1", "3R"],
      }),
    ).toBe("compliant");
    expect(
      computeVerdict({
        submittedValue: "12",
        requiredKind: "enum",
        comparator: "in",
        requiredValue: ["1", "3R"],
      }),
    ).toBe("non_compliant");
  });

  it("manufacturer_list: case-insensitive membership in approved list", () => {
    expect(
      computeVerdict({
        submittedValue: "Square D",
        requiredKind: "manufacturer_list",
        comparator: "in",
        requiredValue: ["Square D", "Eaton"],
      }),
    ).toBe("compliant");
    // Case-insensitive — handles "square d" vs "Square D" drift.
    expect(
      computeVerdict({
        submittedValue: "square d",
        requiredKind: "manufacturer_list",
        comparator: "in",
        requiredValue: ["Square D", "Eaton"],
      }),
    ).toBe("compliant");
    expect(
      computeVerdict({
        submittedValue: "Hubbell",
        requiredKind: "manufacturer_list",
        comparator: "in",
        requiredValue: ["Square D", "Eaton"],
      }),
    ).toBe("non_compliant");
  });

  it("qualitative: returns uncertain (LLM judge deferred)", () => {
    expect(
      computeVerdict({
        submittedValue: "Copper bus, fully rated",
        requiredKind: "qualitative",
        comparator: "⊇",
        requiredValue: "Copper, 100% rated",
      }),
    ).toBe("uncertain");
  });

  it("missing_value when submittedValue is null", () => {
    expect(
      computeVerdict({
        submittedValue: null,
        requiredKind: "numeric",
        comparator: "≥",
        requiredValue: 65,
      }),
    ).toBe("missing_value");
  });

  it("uncertain when type shapes don't match (defensive)", () => {
    expect(
      computeVerdict({
        submittedValue: "65",
        requiredKind: "numeric",
        comparator: "≥",
        requiredValue: 65,
      }),
    ).toBe("uncertain");
  });
});

describe("buildCompareRow", () => {
  it("missing row when response is null (extraction not yet run)", () => {
    const row = buildCompareRow({ item: item(), response: null });
    expect(row.verdict).toBe("missing_value");
    expect(row.submittedDisplay).toBeNull();
    expect(row.reason).toContain("not yet run");
  });

  it("missing row when response.found=false (submittal silent on requirement)", () => {
    const row = buildCompareRow({
      item: item(),
      response: { found: false, value: null, evidenceQuote: null, pageNum: null },
    });
    expect(row.verdict).toBe("missing_value");
    expect(row.reason).toContain("silent");
  });

  it("compliant row with formatted submitted value + page citation", () => {
    const row = buildCompareRow({
      item: item(),
      response: {
        found: true,
        value: 100,
        evidenceQuote: "AIC: 100 kA RMS",
        pageNum: 2,
      },
    });
    expect(row.verdict).toBe("compliant");
    expect(row.submittedDisplay).toBe("100 kA");
    expect(row.submittalRef).toBe("p.2");
    expect(row.requiredDisplay).toBe("≥ 65 kA");
  });

  it("non_compliant row with reason mentioning the comparator", () => {
    const row = buildCompareRow({
      item: item(),
      response: {
        found: true,
        value: 42,
        evidenceQuote: "AIC: 42 kA RMS",
        pageNum: 2,
      },
    });
    expect(row.verdict).toBe("non_compliant");
    expect(row.reason).toContain("does not satisfy");
    expect(row.reason).toContain("≥ 65");
  });

  it("formats spec ref from csiPath: '26 24 16/2/2.05/B' → '§2.05/B'", () => {
    const row = buildCompareRow({ item: item(), response: null });
    expect(row.specRef).toBe("§2.05/B");
  });

  it("groups attributes by category heuristic", () => {
    const aic = buildCompareRow({
      item: item({ attribute: "aic_ka" }),
      response: null,
    });
    const enclosure = buildCompareRow({
      item: item({ attribute: "enclosure_nema" }),
      response: null,
    });
    const random = buildCompareRow({
      item: item({ attribute: "other_random_thing" }),
      response: null,
    });
    expect(aic.group).toBe("Ratings & listings");
    expect(enclosure.group).toBe("Construction & install");
    expect(random.group).toBe("Other");
  });

  it("preserves submittal evidence quote for the expand-row footer", () => {
    const row = buildCompareRow({
      item: item(),
      response: {
        found: true,
        value: 42,
        evidenceQuote: "AIC: 42 kA RMS @ 480V (series-rated combination with SWB-1)",
        pageNum: 2,
      },
    });
    expect(row.submittalQuote).toContain("series-rated combination");
  });
});
