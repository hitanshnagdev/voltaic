import { describe, expect, it } from "vitest";
import { buildResponseRows } from "./extract-against-checklist";
import type { GuidedResponse } from "@/lib/rag/extract/guided";

const response = (overrides: Partial<GuidedResponse> = {}): GuidedResponse => ({
  checklistItemId: "item-1",
  found: true,
  value: 42,
  evidenceQuote: "AIC: 42 kA",
  pageNum: 2,
  confidence: 0.95,
  ...overrides,
});

const baseInput = {
  workspaceId: "ws-1",
  submittalDocumentId: "sub-doc-1",
};

describe("buildResponseRows", () => {
  it("maps a single response to a DB-ready row", () => {
    const rows = buildResponseRows({ ...baseInput, responses: [response()] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId: "ws-1",
      submittalDocumentId: "sub-doc-1",
      specChecklistItemId: "item-1",
      found: true,
      value: 42,
      evidenceQuote: "AIC: 42 kA",
      pageNum: 2,
      confidence: "0.950",
    });
    expect(rows[0].contentSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("preserves found=false with null fields", () => {
    const rows = buildResponseRows({
      ...baseInput,
      responses: [
        response({
          found: false,
          value: null,
          evidenceQuote: null,
          pageNum: null,
        }),
      ],
    });
    expect(rows[0]).toMatchObject({
      found: false,
      value: null,
      evidenceQuote: null,
      pageNum: null,
    });
  });

  it("produces stable hashes for identical input across calls", () => {
    const a = buildResponseRows({ ...baseInput, responses: [response()] });
    const b = buildResponseRows({ ...baseInput, responses: [response()] });
    expect(a[0].contentSha256).toBe(b[0].contentSha256);
  });

  it("differentiates hashes when value changes but item stays the same", () => {
    const a = buildResponseRows({
      ...baseInput,
      responses: [response({ value: 65 })],
    });
    const b = buildResponseRows({
      ...baseInput,
      responses: [response({ value: 42 })],
    });
    expect(a[0].contentSha256).not.toBe(b[0].contentSha256);
  });

  it("differentiates hashes between found=true and found=false for same item", () => {
    const found = buildResponseRows({
      ...baseInput,
      responses: [response({ found: true, value: 42 })],
    });
    const missing = buildResponseRows({
      ...baseInput,
      responses: [response({ found: false, value: null })],
    });
    expect(found[0].contentSha256).not.toBe(missing[0].contentSha256);
  });

  it("differentiates hashes across submittals (no cross-submittal collision)", () => {
    const a = buildResponseRows({
      ...baseInput,
      submittalDocumentId: "sub-A",
      responses: [response()],
    });
    const b = buildResponseRows({
      ...baseInput,
      submittalDocumentId: "sub-B",
      responses: [response()],
    });
    expect(a[0].contentSha256).not.toBe(b[0].contentSha256);
  });

  it("handles complex value types (string, boolean) preserved verbatim", () => {
    const rows = buildResponseRows({
      ...baseInput,
      responses: [
        response({ checklistItemId: "i-enum", value: "3R" }),
        response({ checklistItemId: "i-bool", value: true }),
        response({ checklistItemId: "i-str", value: "Square D" }),
      ],
    });
    expect(rows[0].value).toBe("3R");
    expect(rows[1].value).toBe(true);
    expect(rows[2].value).toBe("Square D");
  });

  it("formats confidence to 3 decimal places (matches numeric(4,3) column)", () => {
    const rows = buildResponseRows({
      ...baseInput,
      responses: [response({ confidence: 0.7 })],
    });
    expect(rows[0].confidence).toBe("0.700");
  });

  it("returns empty array on empty input", () => {
    expect(buildResponseRows({ ...baseInput, responses: [] })).toEqual([]);
  });
});
