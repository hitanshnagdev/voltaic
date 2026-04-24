import { describe, expect, it } from "vitest";
import {
  matchArticle,
  matchLine,
  matchParagraph,
  matchPart,
  matchSection,
  normalizeCsiNumber,
} from "./csi";

describe("normalizeCsiNumber", () => {
  it("joins digit groups with single spaces", () => {
    expect(normalizeCsiNumber("26", "24", "16")).toBe("26 24 16");
  });
  it("keeps sub-section number appended", () => {
    expect(normalizeCsiNumber("26", "24", "16", "13")).toBe("26 24 16.13");
  });
});

describe("matchSection", () => {
  it("parses the canonical form", () => {
    expect(matchSection("SECTION 26 24 16 - PANELBOARDS")).toEqual({
      kind: "section",
      section: "26 24 16",
      title: "PANELBOARDS",
    });
  });
  it("tolerates collapsed whitespace in the number", () => {
    expect(matchSection("SECTION 262416 - SWITCHBOARDS")).toEqual({
      kind: "section",
      section: "26 24 16",
      title: "SWITCHBOARDS",
    });
  });
  it("tolerates em/en dashes and no dash", () => {
    expect(matchSection("SECTION 26 24 16 — PANELBOARDS")?.title).toBe(
      "PANELBOARDS",
    );
    expect(matchSection("SECTION 26 24 16 PANELBOARDS")?.title).toBe(
      "PANELBOARDS",
    );
  });
  it("supports sub-section numbers", () => {
    expect(matchSection("SECTION 26 05 19.13 - LOW-VOLTAGE CABLES")).toEqual({
      kind: "section",
      section: "26 05 19.13",
      title: "LOW-VOLTAGE CABLES",
    });
  });
  it("returns null on body text", () => {
    expect(matchSection("See Section 26 24 16 for details.")).toBeNull();
  });
});

describe("matchPart", () => {
  it("parses PART 1 - GENERAL", () => {
    expect(matchPart("PART 1 - GENERAL")).toEqual({
      kind: "part",
      part: "1",
      title: "GENERAL",
    });
  });
  it("parses PART 2 without dash", () => {
    expect(matchPart("PART 2 PRODUCTS")).toEqual({
      kind: "part",
      part: "2",
      title: "PRODUCTS",
    });
  });
  it("ignores lowercase 'part' inside prose", () => {
    expect(matchPart("the part shall be furnished")).toBeNull();
  });
});

describe("matchArticle", () => {
  it("parses 2.2 PANELBOARDS", () => {
    expect(matchArticle("2.2  PANELBOARDS")).toEqual({
      kind: "article",
      article: "2.2",
      part: "2",
      title: "PANELBOARDS",
    });
  });
  it("parses 3-level article numbers", () => {
    const m = matchArticle("2.2.1  GENERAL REQUIREMENTS");
    expect(m?.article).toBe("2.2.1");
    expect(m?.part).toBe("2");
  });
  it("rejects body-text line that starts with a number", () => {
    expect(matchArticle("2. provide copper conductors")).toBeNull();
  });
  it("rejects sentence-case titles", () => {
    // Article titles are ALL CAPS in CSI MasterFormat; this is title case.
    expect(matchArticle("2.2 Panelboards shall be installed")).toBeNull();
  });
});

describe("matchParagraph", () => {
  it("parses A. <lead text>", () => {
    const m = matchParagraph(
      "    A. Short-Circuit Current Rating: Minimum 22 kAIC.",
    );
    expect(m).toEqual({
      kind: "paragraph",
      paragraph: "A",
      lead: "Short-Circuit Current Rating: Minimum 22 kAIC.",
    });
  });
  it("rejects two-letter 'AB.' which isn't a paragraph header", () => {
    expect(matchParagraph("AB. Something")).toBeNull();
  });
  it("rejects lead text that's too short", () => {
    expect(matchParagraph("A. 1")).toBeNull();
  });
});

describe("matchLine priority", () => {
  it("prefers section over article", () => {
    const m = matchLine("SECTION 26 24 16 - PANELBOARDS");
    expect(m?.kind).toBe("section");
  });
  it("returns null for plain body text", () => {
    expect(matchLine("Provide copper conductors, THHN insulation.")).toBeNull();
  });
});
