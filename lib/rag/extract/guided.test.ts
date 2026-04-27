import { describe, expect, it } from "vitest";
import {
  validateResponses,
  type ChecklistItemForGuide,
} from "./guided";

const checklist = (): ChecklistItemForGuide[] => [
  {
    id: "item-aic",
    attribute: "aic_ka",
    requiredKind: "numeric",
    comparator: "≥",
    requiredValue: 65,
    unit: "kA",
    rawQuote: "AIC shall be not less than 65 kA",
  },
  {
    id: "item-enclosure",
    attribute: "enclosure_nema",
    requiredKind: "enum",
    comparator: "in",
    requiredValue: ["1", "3R"],
    unit: null,
    rawQuote: "NEMA 1 or NEMA 3R",
  },
  {
    id: "item-series",
    attribute: "series_rated",
    requiredKind: "boolean",
    comparator: "=",
    requiredValue: false,
    unit: null,
    rawQuote: "Series-rated combinations are not acceptable",
  },
  {
    id: "item-mfg",
    attribute: "approved_manufacturer",
    requiredKind: "manufacturer_list",
    comparator: "in",
    requiredValue: ["Square D", "Eaton", "Siemens"],
    unit: null,
    rawQuote: "Approved: Square D, Eaton, Siemens",
  },
];

describe("validateResponses", () => {
  it("validates a clean payload with one response per item", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-aic",
            found: true,
            value: 42,
            evidence_quote: "AIC: 42 kA RMS @ 480V",
            page: 2,
            confidence: 0.95,
          },
          {
            checklist_item_id: "item-enclosure",
            found: true,
            value: "1",
            evidence_quote: "NEMA 1 indoor",
            page: 3,
            confidence: 0.9,
          },
          {
            checklist_item_id: "item-series",
            found: true,
            value: true,
            evidence_quote: "series-rated combination with upstream SWB-1",
            page: 2,
            confidence: 0.85,
          },
          {
            checklist_item_id: "item-mfg",
            found: true,
            value: "Square D",
            evidence_quote: "Manufacturer: Square D",
            page: 1,
            confidence: 0.95,
          },
        ],
      },
      checklist(),
    );
    expect(out).toHaveLength(4);
    expect(out.find((r) => r.checklistItemId === "item-aic")).toMatchObject({
      found: true,
      value: 42,
      pageNum: 2,
    });
    expect(out.find((r) => r.checklistItemId === "item-series")).toMatchObject({
      value: true,
    });
  });

  it("emits synthetic found=false for items the model omitted", () => {
    // Model only returned 1 of 4 — the other 3 should appear as
    // synthetic "not found" rows so downstream can rely on exhaustive
    // coverage.
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-aic",
            found: true,
            value: 42,
            evidence_quote: "AIC: 42 kA RMS",
            page: 2,
            confidence: 0.9,
          },
        ],
      },
      checklist(),
    );
    expect(out).toHaveLength(4);
    const omitted = out.filter((r) => r.checklistItemId !== "item-aic");
    for (const r of omitted) {
      expect(r.found).toBe(false);
      expect(r.value).toBeNull();
      expect(r.evidenceQuote).toBeNull();
      expect(r.confidence).toBe(0.3); // low — model didn't acknowledge
    }
  });

  it("preserves explicit found=false from the model with the model's confidence", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-mfg",
            found: false,
            confidence: 0.95,
          },
        ],
      },
      checklist(),
    );
    const explicit = out.find((r) => r.checklistItemId === "item-mfg");
    expect(explicit?.found).toBe(false);
    expect(explicit?.confidence).toBe(0.95); // model's confidence, not the synthetic 0.3
  });

  it("drops responses for hallucinated checklist_item_ids (not in input)", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-aic",
            found: true,
            value: 42,
            evidence_quote: "42 kA",
            page: 1,
            confidence: 0.9,
          },
          {
            checklist_item_id: "item-i-made-up",
            found: true,
            value: 999,
            evidence_quote: "fake",
            page: 1,
            confidence: 0.9,
          },
        ],
      },
      checklist(),
    );
    // 4 items total; the hallucinated one is dropped, leaving 4 (3 synthetic).
    expect(out).toHaveLength(4);
    expect(out.find((r) => r.checklistItemId === "item-i-made-up")).toBeUndefined();
  });

  it("drops found=true responses without evidence_quote (no citation possible)", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-aic",
            found: true,
            value: 42,
            evidence_quote: "",
            page: 2,
            confidence: 0.9,
          },
        ],
      },
      checklist(),
    );
    // Dropped → falls through to synthetic found=false
    const aic = out.find((r) => r.checklistItemId === "item-aic");
    expect(aic?.found).toBe(false);
  });

  it("drops responses with value-shape mismatch (numeric expecting number, got string)", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-aic",
            found: true,
            value: "42 kA", // wrong shape — numeric kind expects number
            evidence_quote: "AIC: 42 kA",
            page: 2,
            confidence: 0.9,
          },
        ],
      },
      checklist(),
    );
    const aic = out.find((r) => r.checklistItemId === "item-aic");
    expect(aic?.found).toBe(false);
  });

  it("drops boolean responses with non-boolean value", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-series",
            found: true,
            value: "true", // wrong — boolean expects actual boolean
            evidence_quote: "...",
            page: 1,
            confidence: 0.9,
          },
        ],
      },
      checklist(),
    );
    const series = out.find((r) => r.checklistItemId === "item-series");
    expect(series?.found).toBe(false);
  });

  it("trims string values and drops empty-string enums", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-enclosure",
            found: true,
            value: "  3R  ",
            evidence_quote: "NEMA 3R outdoor",
            page: 2,
            confidence: 0.9,
          },
        ],
      },
      checklist(),
    );
    const enc = out.find((r) => r.checklistItemId === "item-enclosure");
    expect(enc?.value).toBe("3R");
  });

  it("returns synthetic found=false rows when input is garbage", () => {
    expect(validateResponses(null, checklist())).toHaveLength(4);
    expect(validateResponses("nope", checklist())).toHaveLength(4);
    expect(validateResponses({}, checklist())).toHaveLength(4);
    const out = validateResponses({}, checklist());
    for (const r of out) expect(r.found).toBe(false);
  });

  it("clamps invalid confidence to 0.5 default", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-aic",
            found: true,
            value: 42,
            evidence_quote: "42 kA",
            page: 2,
            confidence: -0.5, // out of range
          },
        ],
      },
      checklist(),
    );
    const aic = out.find((r) => r.checklistItemId === "item-aic");
    expect(aic?.confidence).toBe(0.5);
  });

  it("nulls invalid page numbers (zero, negative, non-integer)", () => {
    const out = validateResponses(
      {
        responses: [
          {
            checklist_item_id: "item-aic",
            found: true,
            value: 42,
            evidence_quote: "42 kA",
            page: 0,
            confidence: 0.9,
          },
        ],
      },
      checklist(),
    );
    expect(out.find((r) => r.checklistItemId === "item-aic")?.pageNum).toBeNull();
  });
});
