import { describe, expect, it } from "vitest";
import {
  normalizeAicKa,
  normalizeEquipmentTag,
  normalizeNemaRating,
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
