import { describe, expect, it } from "vitest";
import {
  type AtomWithDoc,
  buildContextBlock,
  buildDocumentsBlock,
  extractCitations,
  formatCsiPath,
} from "./citations";

// Use spread last so explicit `null` overrides survive — `??` would
// silently treat null as "use the default" and break the missing-CSI
// tests.
const atom = (overrides: Partial<AtomWithDoc> = {}): AtomWithDoc => ({
  id: "atom-1",
  sourceKind: "spec_paragraph",
  documentId: "doc-1",
  pageNum: 4,
  csiSection: "26 24 16",
  csiPart: "2",
  csiArticle: "2",
  csiParagraph: "B",
  requirementType: "aic",
  referencedStandards: [],
  content:
    "Short-circuit current rating shall be not less than 65,000 A RMS symmetrical at 480Y/277V.",
  score: 0.5,
  ranks: { bm25: 1, vector: 1 },
  documentName: "Switchboards.pdf",
  ...overrides,
});

describe("formatCsiPath", () => {
  it("joins section + part/article/paragraph", () => {
    expect(formatCsiPath(atom())).toBe("26 24 16 §2/2/B");
  });
  it("handles missing pieces", () => {
    expect(
      formatCsiPath(
        atom({
          csiPart: null,
          csiArticle: null,
          csiParagraph: null,
        }),
      ),
    ).toBe("26 24 16");
  });
  it("returns empty string when nothing is set", () => {
    expect(
      formatCsiPath(
        atom({
          csiSection: null,
          csiPart: null,
          csiArticle: null,
          csiParagraph: null,
        }),
      ),
    ).toBe("");
  });
});

describe("buildContextBlock", () => {
  it("renders empty placeholder when no atoms", () => {
    expect(buildContextBlock([])).toContain("no relevant passages");
  });
  it("numbers atoms 1-indexed", () => {
    const block = buildContextBlock([atom({ id: "a" }), atom({ id: "b" })]);
    expect(block).toContain("[#1]");
    expect(block).toContain("[#2]");
  });
  it("collapses whitespace inside body", () => {
    const messy = atom({
      content: "Short circuit\n\nrating  shall  be   65 kA",
    });
    const block = buildContextBlock([messy]);
    expect(block).toContain("Short circuit rating shall be 65 kA");
  });
});

describe("buildDocumentsBlock", () => {
  it("returns empty string when no docs", () => {
    expect(buildDocumentsBlock([])).toBe("");
  });
  it("respects the limit and notes how many remain", () => {
    const docs = Array.from({ length: 60 }, (_, i) => ({
      filename: `f${i}.pdf`,
      docType: "spec",
    }));
    const block = buildDocumentsBlock(docs, 10);
    expect(block.split("\n").filter((l) => l.startsWith("- "))).toHaveLength(10);
    expect(block).toContain("(+ 50 more)");
  });
});

describe("extractCitations", () => {
  const a = atom({ id: "spec-A", csiParagraph: "A" });
  const b = atom({ id: "spec-B", csiParagraph: "C", pageNum: 6 });

  it("extracts unique citations in first-mention order", () => {
    const text = "First [#2] then [#1] then [#1] again.";
    const out = extractCitations(text, [a, b]);
    expect(out.map((c) => c.index)).toEqual([2, 1]);
  });
  it("drops out-of-range markers silently", () => {
    const text = "Bogus reference [#9].";
    const out = extractCitations(text, [a]);
    expect(out).toEqual([]);
  });
  it("rejects non-numeric indices", () => {
    expect(extractCitations("abc [#x]", [a])).toEqual([]);
  });
  it("captures atom metadata in the citation payload", () => {
    const out = extractCitations("see [#1]", [a]);
    expect(out[0].atom.id).toBe("spec-A");
    expect(out[0].atom.csiPath).toBe("26 24 16 §2/2/A");
    expect(out[0].atom.snippet.length).toBeGreaterThan(0);
  });
});
