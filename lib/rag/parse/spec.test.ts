import { describe, expect, it } from "vitest";
import { parseSpec } from "./spec";

const PANELBOARDS = `
SECTION 26 24 16 - PANELBOARDS

PART 1 - GENERAL

1.1 RELATED DOCUMENTS

    A. Drawings and general provisions of the Contract, including General and
       Supplementary Conditions and Division 01 Specification Sections, apply
       to this Section.

1.2 SUMMARY

    A. Section Includes:
        1. Panelboards.
        2. Accessories.

PART 2 - PRODUCTS

2.1 MANUFACTURERS

    A. Subject to compliance with requirements, provide products by one of
       the following: Eaton, Square D, Siemens.

2.2 PANELBOARDS

    A. Short-Circuit Current Rating: Minimum 22 kAIC symmetrical at 480V.
       Comply with UL 67.

    B. Enclosure: NEMA 1 indoors, NEMA 3R outdoors.

PART 3 - EXECUTION

3.1 INSTALLATION

    A. Install panelboards and accessories per NECA 1 and manufacturer's
       instructions. Maintain working clearance per NEC 110.26.
`;

describe("parseSpec", () => {
  const rows = parseSpec([PANELBOARDS]);

  it("finds every paragraph", () => {
    // 1.1.A, 1.2.A, 2.1.A, 2.2.A, 2.2.B, 3.1.A = 6
    expect(rows).toHaveLength(6);
  });

  it("attaches the right CSI cursor to each row", () => {
    const cursors = rows.map((r) => ({
      section: r.csiSection,
      part: r.csiPart,
      article: r.csiArticle,
      paragraph: r.csiParagraph,
    }));
    expect(cursors).toEqual([
      { section: "26 24 16", part: "1", article: "1.1", paragraph: "A" },
      { section: "26 24 16", part: "1", article: "1.2", paragraph: "A" },
      { section: "26 24 16", part: "2", article: "2.1", paragraph: "A" },
      { section: "26 24 16", part: "2", article: "2.2", paragraph: "A" },
      { section: "26 24 16", part: "2", article: "2.2", paragraph: "B" },
      { section: "26 24 16", part: "3", article: "3.1", paragraph: "A" },
    ]);
  });

  it("classifies the AIC paragraph", () => {
    const aic = rows.find(
      (r) => r.csiArticle === "2.2" && r.csiParagraph === "A",
    );
    expect(aic?.requirementType).toBe("aic");
    expect(aic?.referencedStandards).toContain("UL 67");
  });

  it("classifies the enclosure paragraph", () => {
    const enc = rows.find(
      (r) => r.csiArticle === "2.2" && r.csiParagraph === "B",
    );
    expect(enc?.requirementType).toBe("enclosure");
  });

  it("classifies the MANUFACTURERS paragraph via article-title override", () => {
    const mfr = rows.find((r) => r.csiArticle === "2.1");
    expect(mfr?.requirementType).toBe("approved_manufacturer");
  });

  it("classifies the clearance paragraph under execution", () => {
    const clr = rows.find((r) => r.csiArticle === "3.1");
    expect(clr?.requirementType).toBe("clearance");
    expect(clr?.referencedStandards).toContain("NEC 110.26");
    expect(clr?.referencedStandards).toContain("NECA 1");
  });

  it("keeps the article title", () => {
    const p22a = rows.find(
      (r) => r.csiArticle === "2.2" && r.csiParagraph === "A",
    );
    expect(p22a?.articleTitle).toBe("PANELBOARDS");
  });

  it("folds sub-paragraph numbers into paragraph content", () => {
    const summary = rows.find((r) => r.csiArticle === "1.2");
    expect(summary?.content).toMatch(/Section Includes/);
    expect(summary?.content).toMatch(/Panelboards/);
    expect(summary?.content).toMatch(/Accessories/);
  });

  it("records the page number", () => {
    for (const r of rows) {
      expect(r.pageNum).toBe(1);
    }
  });

  it("survives multi-page input and keeps page numbers per paragraph", () => {
    const page1 = `
SECTION 26 24 16 - PANELBOARDS

PART 1 - GENERAL

1.1 SUMMARY
    A. Short intro.
`;
    const page2 = `
PART 2 - PRODUCTS

2.1 MANUFACTURERS
    A. Eaton.
`;
    const out = parseSpec([page1, page2]);
    expect(out).toHaveLength(2);
    expect(out[0].pageNum).toBe(1);
    expect(out[1].pageNum).toBe(2);
  });

  it("handles articles that appear before an explicit PART header", () => {
    const txt = `
SECTION 26 24 16 - PANELBOARDS

2.1 MANUFACTURERS
    A. Eaton.
`;
    const out = parseSpec([txt]);
    expect(out).toHaveLength(1);
    expect(out[0].csiPart).toBe("2");
    expect(out[0].csiArticle).toBe("2.1");
  });

  it("returns an empty list for non-spec text", () => {
    expect(parseSpec(["Just some random prose here."])).toEqual([]);
  });
});
