import { describe, expect, it } from "vitest";
import { buildSpecParagraphRows } from "./parse-spec";
import type { ParsedParagraph } from "@/lib/rag/parse/spec";

const sample = (overrides: Partial<ParsedParagraph> = {}): ParsedParagraph => ({
  csiSection: "26 24 16",
  csiPart: "2",
  csiArticle: "2.2",
  csiParagraph: "A",
  articleTitle: "PANELBOARDS",
  content: "Short-Circuit Current Rating: Minimum 65 kAIC at 480V.",
  pageNum: 4,
  requirementType: "aic",
  referencedStandards: ["UL 67"],
  ...overrides,
});

const WORKSPACE = "00000000-0000-0000-0000-00000000aaaa";
const DOCUMENT = "00000000-0000-0000-0000-00000000bbbb";

describe("buildSpecParagraphRows", () => {
  it("maps a parsed paragraph onto the DB row shape", () => {
    const rows = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [sample()],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      csiSection: "26 24 16",
      csiPart: "2",
      csiArticle: "2.2",
      csiParagraph: "A",
      requirementType: "aic",
      referencedStandards: ["UL 67"],
      pageNum: 4,
    });
    expect(rows[0].content).toMatch(/65 kAIC/);
    expect(rows[0].contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("drops paragraphs with empty/whitespace-only content", () => {
    const rows = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [
        sample({ content: "   " }),
        sample({ content: "" }),
        sample({ content: "valid body text" }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe("valid body text");
  });

  it("produces stable hashes for identical input across calls", () => {
    const a = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [sample()],
    });
    const b = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [sample()],
    });
    expect(a[0].contentSha256).toBe(b[0].contentSha256);
  });

  it("differentiates hashes when csi path changes but content does not", () => {
    const rows = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [
        sample({ csiParagraph: "A" }),
        sample({ csiParagraph: "B" }),
      ],
    });
    expect(rows[0].contentSha256).not.toBe(rows[1].contentSha256);
  });

  it("differentiates hashes when content changes but csi path does not", () => {
    const rows = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [
        sample({ content: "first body" }),
        sample({ content: "second body" }),
      ],
    });
    expect(rows[0].contentSha256).not.toBe(rows[1].contentSha256);
  });

  it("differentiates hashes across different documents (no cross-doc collision)", () => {
    const a = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: "00000000-0000-0000-0000-000000000001",
      paragraphs: [sample()],
    });
    const b = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: "00000000-0000-0000-0000-000000000002",
      paragraphs: [sample()],
    });
    expect(a[0].contentSha256).not.toBe(b[0].contentSha256);
  });

  it("preserves null csi parts (e.g. anchor paragraphs)", () => {
    const rows = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [
        sample({
          csiPart: null,
          csiArticle: null,
          csiParagraph: null,
          articleTitle: null,
          content: "Anchor paragraph under section with no part header.",
        }),
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].csiPart).toBeNull();
    expect(rows[0].csiArticle).toBeNull();
    expect(rows[0].csiParagraph).toBeNull();
  });

  it("returns an empty array when no paragraphs survive filtering", () => {
    const rows = buildSpecParagraphRows({
      workspaceId: WORKSPACE,
      documentId: DOCUMENT,
      paragraphs: [sample({ content: "" }), sample({ content: "  \t  " })],
    });
    expect(rows).toEqual([]);
  });
});
