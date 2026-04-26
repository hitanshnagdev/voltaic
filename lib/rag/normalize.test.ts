import { describe, expect, it } from "vitest";
import {
  normalizeAicKa,
  normalizeEquipmentTag,
  normalizeNemaRating,
  normalizePhase,
  normalizeVoltageSystemV,
  normalizeWires,
} from "./normalize";

describe("normalizeEquipmentTag", () => {
  it("strips hyphens, spaces, underscores, and periods", () => {
    expect(normalizeEquipmentTag("MDP-A")).toBe("MDPA");
    expect(normalizeEquipmentTag("MDP A")).toBe("MDPA");
    expect(normalizeEquipmentTag("mdp_a")).toBe("MDPA");
    expect(normalizeEquipmentTag("MDP.A")).toBe("MDPA");
  });

  it("trims surrounding whitespace before normalizing", () => {
    expect(normalizeEquipmentTag("  panel-1  ")).toBe("PANEL1");
  });

  it("preserves digits and letters", () => {
    expect(normalizeEquipmentTag("PP-1A")).toBe("PP1A");
    expect(normalizeEquipmentTag("SWB-12")).toBe("SWB12");
  });

  it("uppercases the result", () => {
    expect(normalizeEquipmentTag("mdp-a")).toBe("MDPA");
  });

  it("returns null on empty / null / whitespace-only input", () => {
    expect(normalizeEquipmentTag("")).toBeNull();
    expect(normalizeEquipmentTag("   ")).toBeNull();
    expect(normalizeEquipmentTag(null)).toBeNull();
    expect(normalizeEquipmentTag(undefined)).toBeNull();
  });

  it("returns null when input normalizes to empty string", () => {
    expect(normalizeEquipmentTag("---")).toBeNull();
    expect(normalizeEquipmentTag("..")).toBeNull();
  });

  it("collapses slash-paired tags into a single canonical key", () => {
    // Real one-line diagrams use "/" to pair downstream outputs of one
    // physical piece of equipment (e.g. UCCS T-UCCS-LA/LC = one
    // transformer feeding both UCCSLA and UCCSLC).
    expect(normalizeEquipmentTag("T-UCCS-LA/LC")).toBe("TUCCSLALC");
    expect(normalizeEquipmentTag("T-ISAC-LA/WA")).toBe("TISACLAWA");
  });

  it("normalizes the same physical equipment across slash and dash variants", () => {
    // If a spec writer used "T-A-B" and a drawing used "T-A/B", they're
    // the same physical equipment for dedup purposes.
    expect(normalizeEquipmentTag("T-A/B")).toBe(normalizeEquipmentTag("T-A-B"));
    expect(normalizeEquipmentTag("PP/1A")).toBe(normalizeEquipmentTag("PP-1A"));
  });

  it("returns null for separator-only input that includes slashes", () => {
    expect(normalizeEquipmentTag("/")).toBeNull();
    expect(normalizeEquipmentTag("/-/")).toBeNull();
  });
});

describe("normalizeAicKa", () => {
  it("parses '<n> kAIC'", () => {
    expect(normalizeAicKa("65 kAIC")).toBe(65);
  });

  it("parses '<n> kA'", () => {
    expect(normalizeAicKa("42 kA")).toBe(42);
  });

  it("tolerates collapsed spacing '<n>kA'", () => {
    expect(normalizeAicKa("22kA")).toBe(22);
  });

  it("normalizes Amps with thousands separator to kA", () => {
    expect(normalizeAicKa("65,000 AIC")).toBe(65);
  });

  it("normalizes plain Amps form to kA when ≥ 1000", () => {
    expect(normalizeAicKa("42000 AIC")).toBe(42);
  });

  it("treats bare numbers as kA when caller's context implies AIC", () => {
    expect(normalizeAicKa("65")).toBe(65);
  });

  it("rescales a bare number ≥ 1000 from amperes to kA", () => {
    // Real AIC ratings span 10–200 kA; never above 1000. A bare 65000 has to
    // be amperes by mistake — scale it.
    expect(normalizeAicKa("65000")).toBe(65);
    expect(normalizeAicKa("42000")).toBe(42);
  });

  it("returns null on null / empty / non-AIC text", () => {
    expect(normalizeAicKa(null)).toBeNull();
    expect(normalizeAicKa("")).toBeNull();
    expect(normalizeAicKa("hello world")).toBeNull();
  });
});

describe("normalizeNemaRating", () => {
  it("parses 'NEMA <code>' forms", () => {
    expect(normalizeNemaRating("NEMA 3R")).toBe("3R");
    expect(normalizeNemaRating("NEMA 4X")).toBe("4X");
    expect(normalizeNemaRating("NEMA 1")).toBe("1");
  });

  it("parses 'Type <code>' forms", () => {
    expect(normalizeNemaRating("Type 3R")).toBe("3R");
  });

  it("parses bare codes", () => {
    expect(normalizeNemaRating("3R")).toBe("3R");
    expect(normalizeNemaRating("4X")).toBe("4X");
  });

  it("uppercases the suffix letter", () => {
    expect(normalizeNemaRating("nema-4x")).toBe("4X");
  });

  it("tolerates leading prose like 'Indoor 1'", () => {
    expect(normalizeNemaRating("Indoor 1")).toBe("1");
  });

  it("returns null on null / empty / non-numeric input", () => {
    expect(normalizeNemaRating(null)).toBeNull();
    expect(normalizeNemaRating("")).toBeNull();
    expect(normalizeNemaRating("rating not specified")).toBeNull();
  });
});

describe("normalizeVoltageSystemV", () => {
  it("passes through standard system voltages as integers", () => {
    expect(normalizeVoltageSystemV(208)).toBe(208);
    expect(normalizeVoltageSystemV(480)).toBe(480);
  });

  it("extracts line-to-line value from wye notation", () => {
    expect(normalizeVoltageSystemV("480Y/277V")).toBe(480);
    expect(normalizeVoltageSystemV("208Y/120V")).toBe(208);
  });

  it("extracts line-to-line from slash notation without 'Y'", () => {
    expect(normalizeVoltageSystemV("480/277")).toBe(480);
  });

  it("parses bare numbers with V/VAC suffix", () => {
    expect(normalizeVoltageSystemV("240V")).toBe(240);
    expect(normalizeVoltageSystemV("600 VAC")).toBe(600);
  });

  it("rejects implausibly small or large voltages", () => {
    expect(normalizeVoltageSystemV(12)).toBeNull();
    expect(normalizeVoltageSystemV(5000)).toBeNull();
  });

  it("returns null on null / empty / non-voltage text", () => {
    expect(normalizeVoltageSystemV(null)).toBeNull();
    expect(normalizeVoltageSystemV("")).toBeNull();
    expect(normalizeVoltageSystemV("not specified")).toBeNull();
  });

  it("rounds non-integer numerics", () => {
    expect(normalizeVoltageSystemV(479.7)).toBe(480);
  });
});

describe("normalizePhase", () => {
  it("passes through 1 and 3", () => {
    expect(normalizePhase(1)).toBe(1);
    expect(normalizePhase(3)).toBe(3);
  });

  it("rejects 2 (historical curiosity, not real-world)", () => {
    expect(normalizePhase(2)).toBeNull();
  });

  it("parses '3-phase', '3φ', '1-phase' string forms", () => {
    expect(normalizePhase("3-phase")).toBe(3);
    expect(normalizePhase("3φ")).toBe(3);
    expect(normalizePhase("1-phase")).toBe(1);
  });

  it("returns null on null / empty / nonsense", () => {
    expect(normalizePhase(null)).toBeNull();
    expect(normalizePhase("")).toBeNull();
    expect(normalizePhase("polyphase")).toBeNull();
  });
});

describe("normalizeWires", () => {
  it("passes through 2, 3, and 4", () => {
    expect(normalizeWires(2)).toBe(2);
    expect(normalizeWires(3)).toBe(3);
    expect(normalizeWires(4)).toBe(4);
  });

  it("rejects values outside the 2-4 distribution range", () => {
    expect(normalizeWires(1)).toBeNull();
    expect(normalizeWires(5)).toBeNull();
  });

  it("parses '4w', '4-wire' string forms", () => {
    expect(normalizeWires("4w")).toBe(4);
    expect(normalizeWires("4-wire")).toBe(4);
    expect(normalizeWires("3-wire delta")).toBe(3);
  });

  it("returns null on null / empty / no number", () => {
    expect(normalizeWires(null)).toBeNull();
    expect(normalizeWires("")).toBeNull();
    expect(normalizeWires("delta")).toBeNull();
  });
});
