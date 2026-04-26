import { describe, expect, it } from "vitest";
import { buildChecklistRows } from "./parse-spec-checklist";
import type { ChecklistItem } from "@/lib/rag/parse/checklist";

const item = (
  overrides: Partial<ChecklistItem> = {},
): ChecklistItem =>
  ({
    attribute: "aic_ka",
    requiredKind: "numeric",
    comparator: "≥",
    requiredValue: 65,
    unit: "kA",
    rawQuote: "Short-circuit current rating shall be not less than 65 kA.",
    confidence: 0.95,
    ...overrides,
  }) as ChecklistItem;

const baseInput = {
  workspaceId: "ws-1",
  documentId: "doc-1",
  specParagraphId: "para-1",
  csiSection: "26 24 16",
  csiPath: "26 24 16/2/2.2/B",
};

describe("buildChecklistRows", () => {
  it("maps a single item to a DB-ready row", () => {
    const rows = buildChecklistRows({ ...baseInput, items: [item()] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId: "ws-1",
      documentId: "doc-1",
      specParagraphId: "para-1",
      csiSection: "26 24 16",
      csiPath: "26 24 16/2/2.2/B",
      attribute: "aic_ka",
      requiredKind: "numeric",
      comparator: "≥",
      requiredValue: 65,
      unit: "kA",
      confidence: "0.950",
    });
    // content_sha256 is a 64-hex-char SHA256.
    expect(rows[0].contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces stable hashes for identical input across calls", () => {
    const rowsA = buildChecklistRows({ ...baseInput, items: [item()] });
    const rowsB = buildChecklistRows({ ...baseInput, items: [item()] });
    expect(rowsA[0].contentSha256).toBe(rowsB[0].contentSha256);
  });

  it("differentiates hashes when attribute changes but quote does not", () => {
    const rowsA = buildChecklistRows({
      ...baseInput,
      items: [item({ attribute: "aic_ka" })],
    });
    const rowsB = buildChecklistRows({
      ...baseInput,
      items: [item({ attribute: "sccr_ka" })],
    });
    expect(rowsA[0].contentSha256).not.toBe(rowsB[0].contentSha256);
  });

  it("differentiates hashes when value changes but attribute does not", () => {
    const rowsA = buildChecklistRows({
      ...baseInput,
      items: [item({ requiredValue: 65 })],
    });
    const rowsB = buildChecklistRows({
      ...baseInput,
      items: [item({ requiredValue: 42 })],
    });
    expect(rowsA[0].contentSha256).not.toBe(rowsB[0].contentSha256);
  });

  it("differentiates hashes across paragraphs (no cross-paragraph collision)", () => {
    const rowsA = buildChecklistRows({
      ...baseInput,
      specParagraphId: "para-1",
      items: [item()],
    });
    const rowsB = buildChecklistRows({
      ...baseInput,
      specParagraphId: "para-2",
      items: [item()],
    });
    expect(rowsA[0].contentSha256).not.toBe(rowsB[0].contentSha256);
  });

  it("expands multiple items from one paragraph (the multi-requirement case)", () => {
    const rows = buildChecklistRows({
      ...baseInput,
      items: [
        item({ attribute: "aic_ka", requiredValue: 65 }),
        item({
          attribute: "series_rated",
          requiredKind: "boolean",
          comparator: "=",
          requiredValue: false,
          unit: null,
          rawQuote: "Series-rated combinations are not acceptable.",
          confidence: 0.97,
        }),
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.attribute)).toEqual(["aic_ka", "series_rated"]);
    // Per-item hashes still differ (different attribute + quote).
    expect(rows[0].contentSha256).not.toBe(rows[1].contentSha256);
  });

  it("returns empty array when no items extracted", () => {
    expect(
      buildChecklistRows({ ...baseInput, items: [] }),
    ).toEqual([]);
  });

  it("formats confidence to 3 decimal places (matches numeric(4,3) column)", () => {
    const rows = buildChecklistRows({
      ...baseInput,
      items: [item({ confidence: 0.7 })],
    });
    expect(rows[0].confidence).toBe("0.700");
  });

  it("preserves typed required_value shape (string array for enum 'in')", () => {
    const rows = buildChecklistRows({
      ...baseInput,
      items: [
        {
          attribute: "enclosure_nema",
          requiredKind: "enum",
          comparator: "in",
          requiredValue: ["1", "3R"],
          unit: null,
          rawQuote: "NEMA 1 or NEMA 3R",
          confidence: 0.9,
        } as ChecklistItem,
      ],
    });
    expect(rows[0].requiredValue).toEqual(["1", "3R"]);
  });
});
