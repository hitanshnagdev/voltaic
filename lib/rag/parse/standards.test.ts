import { describe, expect, it } from "vitest";
import { extractStandards } from "./standards";

describe("extractStandards", () => {
  it("finds a single citation", () => {
    expect(extractStandards("Comply with UL 67.")).toEqual(["UL 67"]);
  });

  it("finds multiple distinct citations", () => {
    const txt =
      "Panelboards shall comply with UL 67 and NEMA PB 1, and be installed " +
      "per NEC 408.30 and NFPA 70.";
    expect(extractStandards(txt).sort()).toEqual(
      ["NEC 408.30", "NEMA PB 1", "NFPA 70", "UL 67"].sort(),
    );
  });

  it("deduplicates repeated citations", () => {
    expect(extractStandards("UL 67. And again UL 67.")).toEqual(["UL 67"]);
  });

  it("handles dotted and hyphenated numbers", () => {
    const txt = "See IEEE C62.41 and NEMA 250-2018.";
    const out = extractStandards(txt).sort();
    expect(out).toEqual(["IEEE C62.41", "NEMA 250-2018"]);
  });

  it("handles dual-org prefix like ANSI/IEEE", () => {
    expect(extractStandards("Per ANSI/IEEE 1547 requirements.")).toEqual([
      "ANSI/IEEE 1547",
    ]);
  });

  it("expands 'National Electrical Code' to NEC", () => {
    expect(
      extractStandards("Per the National Electrical Code 110.26 clearance."),
    ).toContain("NEC 110.26");
  });

  it("does not pick up unrelated prose", () => {
    expect(
      extractStandards("The contractor shall submit shop drawings."),
    ).toEqual([]);
  });

  it("handles NEMA subdivision codes (PB, MG)", () => {
    const txt = "Comply with NEMA PB 1 and NEMA MG 1.";
    expect(extractStandards(txt).sort()).toEqual(["NEMA MG 1", "NEMA PB 1"]);
  });

  it("handles NFPA 70E-2024 style year-suffixed standards", () => {
    expect(extractStandards("Per NFPA 70E-2024.")).toEqual(["NFPA 70E-2024"]);
  });
});
