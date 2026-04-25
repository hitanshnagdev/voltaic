import { describe, expect, it } from "vitest";
import { buildEmbedText } from "./embed_text";

const sample = (overrides: Partial<Parameters<typeof buildEmbedText>[0]> = {}) =>
  buildEmbedText({
    csiSection: "26 24 16",
    csiPart: "2",
    csiArticle: "2.2",
    csiParagraph: "A",
    referencedStandards: ["UL 67"],
    content: "Short-Circuit Current Rating: Minimum 65 kAIC at 480V.",
    ...overrides,
  });

describe("buildEmbedText", () => {
  it("prefixes section, path, and standards before content", () => {
    expect(sample()).toBe(
      "[26 24 16] [2/2.2/A] {standards: UL 67} Short-Circuit Current Rating: Minimum 65 kAIC at 480V.",
    );
  });

  it("omits empty bracket groups when fields are null", () => {
    const out = sample({
      csiPart: null,
      csiArticle: null,
      csiParagraph: null,
      referencedStandards: [],
    });
    expect(out).toBe(
      "[26 24 16] Short-Circuit Current Rating: Minimum 65 kAIC at 480V.",
    );
    expect(out).not.toContain("[]");
    expect(out).not.toContain("/");
  });

  it("collapses whitespace inside content", () => {
    const out = sample({
      content: "Provide   copper\nconductors,\tTHHN insulation.",
    });
    expect(out).toContain("Provide copper conductors, THHN insulation.");
  });

  it("emits a partial path when only some hierarchy levels are present", () => {
    const out = sample({
      csiPart: "1",
      csiArticle: null,
      csiParagraph: null,
    });
    expect(out).toContain("[1]");
    expect(out).not.toContain("[1/]");
  });

  it("joins multiple standards with comma-space", () => {
    const out = sample({
      referencedStandards: ["UL 67", "UL 489", "NEMA PB 1"],
    });
    expect(out).toContain("{standards: UL 67, UL 489, NEMA PB 1}");
  });

  it("drops the standards group when the array is empty", () => {
    const out = sample({ referencedStandards: [] });
    expect(out).not.toContain("{standards");
  });

  it("never returns an empty string when content is present", () => {
    const out = sample({
      csiSection: null,
      csiPart: null,
      csiArticle: null,
      csiParagraph: null,
      referencedStandards: [],
      content: "raw body text",
    });
    expect(out).toBe("raw body text");
  });
});
