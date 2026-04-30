import { describe, expect, it } from "vitest";
import {
  extractCsiCrossRefs,
  matchCrossRefAgainstSpecs,
} from "./crossref";

describe("extractCsiCrossRefs", () => {
  it("returns empty for empty input", () => {
    expect(extractCsiCrossRefs("")).toEqual([]);
  });

  it("extracts canonical CSI section from a transmittal cover", () => {
    const text = "SUBMITTAL TRANSMITTAL\nSpec Section: 26 24 16\nPanelboards";
    expect(extractCsiCrossRefs(text)).toEqual(["26 24 16"]);
  });

  it("normalizes hyphen-delimited form to space-delimited", () => {
    expect(extractCsiCrossRefs("Per Section 26-24-16")).toEqual(["26 24 16"]);
  });

  it("dedupes repeated mentions of the same section", () => {
    const text =
      "Section 26 24 16 panelboards. See 26 24 16 §2.05. Per 26-24-16.";
    expect(extractCsiCrossRefs(text)).toEqual(["26 24 16"]);
  });

  it("preserves order of first occurrence across multiple sections", () => {
    const text = "Section 26 28 16 disconnects, also see 26 24 16.";
    expect(extractCsiCrossRefs(text)).toEqual(["26 28 16", "26 24 16"]);
  });

  it("filters out divisions outside electrical scope (Div 26/27/28)", () => {
    const text = "Conforms to 03 30 00 concrete spec, plus 26 24 16.";
    expect(extractCsiCrossRefs(text)).toEqual(["26 24 16"]);
  });

  it("ignores phone numbers (10-digit runs masquerade as CSI)", () => {
    const text = "Contact 26 555 1234 for support.";
    expect(extractCsiCrossRefs(text)).toEqual([]);
  });

  it("ignores numeric runs that touch other digits", () => {
    const text = "Order code 1262416789 ships standard.";
    expect(extractCsiCrossRefs(text)).toEqual([]);
  });

  it("matches at start and end of input cleanly", () => {
    expect(extractCsiCrossRefs("26 24 16")).toEqual(["26 24 16"]);
    expect(extractCsiCrossRefs("end of doc 26 24 16")).toEqual(["26 24 16"]);
  });

  it("accepts comm + safety divisions (27, 28)", () => {
    expect(extractCsiCrossRefs("§27 32 13 and §28 31 11")).toEqual([
      "27 32 13",
      "28 31 11",
    ]);
  });
});

describe("matchCrossRefAgainstSpecs", () => {
  const candidates = [
    { documentId: "spec-1", csiSections: ["26 24 16", "26 24 19"] },
    { documentId: "spec-2", csiSections: ["26 28 16"] },
  ];

  it("returns null when no refs", () => {
    expect(matchCrossRefAgainstSpecs({ refs: [], candidates })).toBeNull();
  });

  it("returns null when no spec covers the cited section", () => {
    expect(
      matchCrossRefAgainstSpecs({ refs: ["26 51 13"], candidates }),
    ).toBeNull();
  });

  it("returns the first spec that covers the first matching ref", () => {
    expect(
      matchCrossRefAgainstSpecs({ refs: ["26 24 16"], candidates }),
    ).toEqual({ specDocumentId: "spec-1", csiSection: "26 24 16" });
  });

  it("walks refs in order — earliest-cited section wins", () => {
    expect(
      matchCrossRefAgainstSpecs({
        refs: ["26 28 16", "26 24 16"],
        candidates,
      }),
    ).toEqual({ specDocumentId: "spec-2", csiSection: "26 28 16" });
  });

  it("walks candidates in order on tie within one ref", () => {
    expect(
      matchCrossRefAgainstSpecs({
        refs: ["26 24 16"],
        candidates: [
          { documentId: "first", csiSections: ["26 24 16"] },
          { documentId: "second", csiSections: ["26 24 16"] },
        ],
      }),
    ).toEqual({ specDocumentId: "first", csiSection: "26 24 16" });
  });
});
