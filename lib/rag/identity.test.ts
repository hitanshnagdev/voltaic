import { describe, expect, it } from "vitest";
import {
  extractCsiFromFilename,
  findSectionHeaders,
  resolveSpecIdentity,
} from "./identity";

describe("findSectionHeaders", () => {
  it("finds a single canonical header", () => {
    const text = [
      "                   SECTION 26 24 16 - PANELBOARDS",
      "",
      "PART 1 - GENERAL",
    ].join("\n");
    expect(findSectionHeaders(text)).toEqual(["26 24 16"]);
  });

  it("finds multiple headers in first-seen order and deduplicates", () => {
    const text = [
      "SECTION 26 05 19 - LOW-VOLTAGE CONDUCTORS",
      "...",
      "SECTION 26 24 13 - SWITCHBOARDS",
      "...",
      "SECTION 26 05 19 - LOW-VOLTAGE CONDUCTORS", // repeat from running header
    ].join("\n");
    expect(findSectionHeaders(text)).toEqual(["26 05 19", "26 24 13"]);
  });

  it("ignores inline references like 'See Section 26 24 16'", () => {
    const text = "The contractor shall see Section 26 24 16 for details.";
    expect(findSectionHeaders(text)).toEqual([]);
  });

  it("tolerates collapsed digit formats", () => {
    const text = "SECTION 262416 - PANELBOARDS";
    expect(findSectionHeaders(text)).toEqual(["26 24 16"]);
  });

  it("tolerates non-breaking spaces on header lines", () => {
    const text = "SECTION\u00A026\u00A024\u00A016 - PANELBOARDS";
    expect(findSectionHeaders(text)).toEqual(["26 24 16"]);
  });

  it("returns empty list when no headers present", () => {
    expect(findSectionHeaders("just some body text")).toEqual([]);
  });
});

describe("extractCsiFromFilename", () => {
  it("matches space-separated digits", () => {
    expect(extractCsiFromFilename("26 24 16 Panelboards.pdf")).toBe("26 24 16");
  });

  it("matches hyphen-separated digits", () => {
    expect(extractCsiFromFilename("26-24-16_panelboards.pdf")).toBe("26 24 16");
  });

  it("matches underscore-separated digits", () => {
    expect(extractCsiFromFilename("spec_26_24_16_panelboards.pdf")).toBe(
      "26 24 16",
    );
  });

  it("matches collapsed digits", () => {
    expect(extractCsiFromFilename("262416-panelboards.pdf")).toBe("26 24 16");
  });

  it("strips the extension before matching so '.pdf' can't contaminate", () => {
    // Without stripping, "16.pdf" near the end could pull "16" into the
    // seventh position and derail the match. Guardrail test.
    expect(extractCsiFromFilename("panelboards 26 24 16.pdf")).toBe("26 24 16");
  });

  it("returns null when the filename has no CSI-shaped substring", () => {
    expect(extractCsiFromFilename("Panelboards.pdf")).toBeNull();
  });

  it("returns null when the six digits are part of a longer number", () => {
    // "1262416789" should not match as "26 24 16" inside it.
    expect(extractCsiFromFilename("report_1262416789.pdf")).toBeNull();
  });
});

describe("resolveSpecIdentity", () => {
  it("identifies via header with high confidence for a single-section spec", () => {
    const identity = resolveSpecIdentity({
      pages: [
        "SECTION 26 24 16 - PANELBOARDS\n\nPART 1 - GENERAL\n",
        "2.2 PANELBOARDS\n  A. Short-Circuit Current Rating: 65 kAIC.\n",
      ],
      filename: "random-name.pdf",
    });
    expect(identity).toEqual({
      csi_sections: ["26 24 16"],
      identified_via: "header",
      identity_confidence: 0.95,
    });
  });

  it("identifies via 'multiple' when the spec covers more than one section", () => {
    const identity = resolveSpecIdentity({
      pages: [
        "SECTION 26 05 19 - LOW-VOLTAGE CONDUCTORS\nPART 1\n",
        "SECTION 26 24 13 - SWITCHBOARDS\nPART 1\n",
      ],
      filename: "combined-spec.pdf",
    });
    expect(identity.identified_via).toBe("multiple");
    expect(identity.csi_sections).toEqual(["26 05 19", "26 24 13"]);
    expect(identity.identity_confidence).toBeCloseTo(0.9);
  });

  it("falls back to filename when no header is present", () => {
    const identity = resolveSpecIdentity({
      pages: ["TABLE OF CONTENTS\n...no section header here...\n"],
      filename: "26-24-16_panelboards.pdf",
    });
    expect(identity).toEqual({
      csi_sections: ["26 24 16"],
      identified_via: "filename",
      identity_confidence: 0.5,
    });
  });

  it("returns identified_via='none' with zero confidence when nothing matches", () => {
    const identity = resolveSpecIdentity({
      pages: ["Cover page with project name only."],
      filename: "cover.pdf",
    });
    expect(identity).toEqual({
      identified_via: "none",
      identity_confidence: 0,
    });
  });

  it("only scans the leading pages (maxPagesToScan)", () => {
    // Header is on page 4 — default scan is first 3 pages, so it should miss.
    const identity = resolveSpecIdentity({
      pages: [
        "page 1 body",
        "page 2 body",
        "page 3 body",
        "SECTION 26 24 16 - PANELBOARDS",
      ],
      filename: "random.pdf",
    });
    expect(identity.identified_via).toBe("none");
  });

  it("respects an overridden maxPagesToScan", () => {
    const identity = resolveSpecIdentity({
      pages: [
        "page 1 body",
        "page 2 body",
        "page 3 body",
        "SECTION 26 24 16 - PANELBOARDS",
      ],
      filename: "random.pdf",
      maxPagesToScan: 5,
    });
    expect(identity.csi_sections).toEqual(["26 24 16"]);
    expect(identity.identified_via).toBe("header");
  });

  it("prefers header over filename hint when both are present", () => {
    const identity = resolveSpecIdentity({
      pages: ["SECTION 26 24 16 - PANELBOARDS\n"],
      // filename would suggest a different section
      filename: "26-05-19-cables.pdf",
    });
    expect(identity.csi_sections).toEqual(["26 24 16"]);
    expect(identity.identified_via).toBe("header");
  });
});
