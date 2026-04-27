import { describe, expect, it } from "vitest";
import { extractJson } from "@/lib/llm";
import { validateItems } from "./checklist";

describe("extractJson resilience", () => {
  it("parses fully-closed ```json fence", () => {
    expect(
      extractJson<unknown[]>('```json\n[{"attribute":"aic_ka"}]\n```'),
    ).toEqual([{ attribute: "aic_ka" }]);
  });

  it("parses unclosed ```json fence (max_tokens-truncation case)", () => {
    // Real failure mode caught running parse-spec-checklist on the demo
    // spec: max_tokens=1500 cut off the response mid-array, leaving an
    // open fence. Defensive strip handles it.
    expect(
      extractJson<unknown[]>('```json\n[{"attribute":"aic_ka"}]'),
    ).toEqual([{ attribute: "aic_ka" }]);
  });

  it("parses bare JSON without any fence", () => {
    expect(extractJson<unknown[]>('[{"attribute":"sccr_ka"}]')).toEqual([
      { attribute: "sccr_ka" },
    ]);
  });

  it("parses ``` (no language tag) fence", () => {
    expect(
      extractJson<unknown[]>('```\n[{"attribute":"poles"}]\n```'),
    ).toEqual([{ attribute: "poles" }]);
  });

  it("strips trailing fence-only-close (mirror of unclosed-open case)", () => {
    expect(extractJson<unknown[]>('[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("trims surrounding whitespace", () => {
    expect(extractJson<unknown[]>('   \n[{"a":1}]\n   ')).toEqual([{ a: 1 }]);
  });
});

describe("validateItems — boundary validator", () => {
  it("returns [] when input is not an array", () => {
    expect(validateItems(null)).toEqual([]);
    expect(validateItems({})).toEqual([]);
    expect(validateItems("nope")).toEqual([]);
  });

  it("validates a numeric AIC requirement", () => {
    const items = validateItems([
      {
        attribute: "aic_ka",
        required_kind: "numeric",
        comparator: "≥",
        required_value: 65,
        unit: "kA",
        raw_quote: "Short-circuit current rating shall be not less than 65,000 amperes RMS.",
        confidence: 0.95,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      attribute: "aic_ka",
      requiredKind: "numeric",
      comparator: "≥",
      requiredValue: 65,
      unit: "kA",
      confidence: 0.95,
    });
  });

  it("validates an enum requirement with comparator='in' and string array", () => {
    const items = validateItems([
      {
        attribute: "enclosure_nema",
        required_kind: "enum",
        comparator: "in",
        required_value: ["1", "3R"],
        unit: null,
        raw_quote: "Enclosure shall be NEMA 1 for indoor dry locations, NEMA 3R for wet or outdoor locations.",
        confidence: 0.92,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].requiredValue).toEqual(["1", "3R"]);
    expect(items[0].comparator).toBe("in");
  });

  it("validates an enum requirement with comparator='=' and single string", () => {
    const items = validateItems([
      {
        attribute: "ul_listing",
        required_kind: "enum",
        comparator: "=",
        required_value: "UL 67",
        unit: null,
        raw_quote: "UL 67 listed and labeled.",
        confidence: 0.9,
      },
    ]);
    expect(items[0].requiredValue).toBe("UL 67");
  });

  it("validates a boolean requirement (series-rated prohibition)", () => {
    const items = validateItems([
      {
        attribute: "series_rated",
        required_kind: "boolean",
        comparator: "=",
        required_value: false,
        unit: null,
        raw_quote: "Series-rated combinations are not acceptable.",
        confidence: 0.97,
      },
    ]);
    expect(items[0].requiredValue).toBe(false);
    expect(items[0].requiredKind).toBe("boolean");
  });

  it("validates a manufacturer_list requirement", () => {
    const items = validateItems([
      {
        attribute: "approved_manufacturer",
        required_kind: "manufacturer_list",
        comparator: "in",
        required_value: ["Square D", "Eaton", "Siemens"],
        unit: null,
        raw_quote: "Approved manufacturers: Square D, Eaton, Siemens.",
        confidence: 0.94,
      },
    ]);
    expect(items[0].requiredValue).toEqual(["Square D", "Eaton", "Siemens"]);
    expect(items[0].attribute).toBe("approved_manufacturer");
  });

  it("validates a qualitative requirement", () => {
    const items = validateItems([
      {
        attribute: "working_clearance_in",
        required_kind: "qualitative",
        comparator: "⊇",
        required_value: "Provide adequate working clearance per NEC 110.26.",
        unit: null,
        raw_quote: "Provide adequate working clearance per NEC 110.26.",
        confidence: 0.7,
      },
    ]);
    expect(items[0].requiredKind).toBe("qualitative");
    expect(items[0].comparator).toBe("⊇");
  });

  it("preserves multiple items from one paragraph (the multi-requirement case)", () => {
    // One paragraph commonly has multiple requirements — the
    // canonical AIC + series-rated case.
    const items = validateItems([
      {
        attribute: "aic_ka",
        required_kind: "numeric",
        comparator: "≥",
        required_value: 65,
        unit: "kA",
        raw_quote: "Short-circuit current rating shall be not less than 65,000 amperes RMS.",
        confidence: 0.95,
      },
      {
        attribute: "series_rated",
        required_kind: "boolean",
        comparator: "=",
        required_value: false,
        unit: null,
        raw_quote: "Series-rated combinations are not acceptable.",
        confidence: 0.97,
      },
    ]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.attribute)).toEqual(["aic_ka", "series_rated"]);
  });

  it("drops malformed items but keeps valid ones in the same payload", () => {
    const items = validateItems([
      {
        attribute: "aic_ka",
        required_kind: "numeric",
        comparator: "≥",
        required_value: 65,
        unit: "kA",
        raw_quote: "65 kA",
        confidence: 0.9,
      },
      // Malformed: numeric with non-numeric value.
      {
        attribute: "ampacity_a",
        required_kind: "numeric",
        comparator: "≥",
        required_value: "not a number",
        unit: "A",
        raw_quote: "...",
        confidence: 0.5,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].attribute).toBe("aic_ka");
  });

  it("drops items without raw_quote (no evidence binding)", () => {
    const items = validateItems([
      {
        attribute: "aic_ka",
        required_kind: "numeric",
        comparator: "≥",
        required_value: 65,
        unit: "kA",
        raw_quote: "",
        confidence: 0.9,
      },
    ]);
    expect(items).toEqual([]);
  });

  it("drops numeric items with invalid comparator", () => {
    const items = validateItems([
      {
        attribute: "aic_ka",
        required_kind: "numeric",
        comparator: "in",
        required_value: 65,
        unit: "kA",
        raw_quote: "65 kA",
        confidence: 0.9,
      },
    ]);
    expect(items).toEqual([]);
  });

  it("drops enum items with array value but '=' comparator (shape mismatch)", () => {
    const items = validateItems([
      {
        attribute: "enclosure_nema",
        required_kind: "enum",
        comparator: "=",
        required_value: ["1", "3R"],
        unit: null,
        raw_quote: "...",
        confidence: 0.9,
      },
    ]);
    expect(items).toEqual([]);
  });

  it("drops boolean items with non-boolean value", () => {
    const items = validateItems([
      {
        attribute: "series_rated",
        required_kind: "boolean",
        comparator: "=",
        required_value: "false",
        unit: null,
        raw_quote: "...",
        confidence: 0.9,
      },
    ]);
    expect(items).toEqual([]);
  });

  it("clamps invalid confidence values to 0.5 default", () => {
    const items = validateItems([
      {
        attribute: "aic_ka",
        required_kind: "numeric",
        comparator: "≥",
        required_value: 65,
        unit: "kA",
        raw_quote: "65 kA",
        confidence: -0.5,
      },
    ]);
    expect(items[0].confidence).toBe(0.5);
  });

  it("normalizes empty unit string to null", () => {
    const items = validateItems([
      {
        attribute: "aic_ka",
        required_kind: "numeric",
        comparator: "≥",
        required_value: 65,
        unit: "   ",
        raw_quote: "65 kA",
        confidence: 0.9,
      },
    ]);
    expect(items[0].unit).toBeNull();
  });

  it("accepts non-canonical attribute keys (other_*) at lower confidence", () => {
    // The model is told it can emit 'other_*' for novel attributes;
    // we don't reject them here — downstream consumers can filter on
    // confidence + attribute prefix.
    const items = validateItems([
      {
        attribute: "other_ground_bus_isolation",
        required_kind: "boolean",
        comparator: "=",
        required_value: true,
        unit: null,
        raw_quote: "Isolated ground bus shall be furnished where called out.",
        confidence: 0.65,
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].attribute).toBe("other_ground_bus_isolation");
  });
});
