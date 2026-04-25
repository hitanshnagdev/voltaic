import { describe, expect, it } from "vitest";
import { severityFor } from "./severity";

describe("severityFor", () => {
  it("returns hot for non_compliant + primary evidence", () => {
    expect(
      severityFor({
        evidenceQuality: "primary",
        magnitude: "non_compliant",
      }),
    ).toBe("hot");
  });

  it("downgrades non_compliant + fallback evidence to warm", () => {
    expect(
      severityFor({
        evidenceQuality: "fallback",
        magnitude: "non_compliant",
      }),
    ).toBe("warm");
  });

  it("downgrades non_compliant + incomplete evidence to warm (not hot)", () => {
    expect(
      severityFor({
        evidenceQuality: "incomplete",
        magnitude: "non_compliant",
      }),
    ).toBe("warm");
  });

  it("returns warm for compliant_zero_margin regardless of evidence quality", () => {
    expect(
      severityFor({
        evidenceQuality: "primary",
        magnitude: "compliant_zero_margin",
      }),
    ).toBe("warm");
    expect(
      severityFor({
        evidenceQuality: "fallback",
        magnitude: "compliant_zero_margin",
      }),
    ).toBe("warm");
  });

  it("returns cool for compliant_margin", () => {
    expect(
      severityFor({
        evidenceQuality: "primary",
        magnitude: "compliant_margin",
      }),
    ).toBe("cool");
  });

  it("returns cool for uncertain", () => {
    expect(
      severityFor({
        evidenceQuality: "incomplete",
        magnitude: "uncertain",
      }),
    ).toBe("cool");
  });

  it("never returns hot for any compliant case", () => {
    const compliantCombos = [
      { evidenceQuality: "primary", magnitude: "compliant_margin" },
      { evidenceQuality: "primary", magnitude: "compliant_zero_margin" },
      { evidenceQuality: "fallback", magnitude: "compliant_margin" },
      { evidenceQuality: "fallback", magnitude: "compliant_zero_margin" },
    ] as const;
    for (const combo of compliantCombos) {
      expect(severityFor(combo)).not.toBe("hot");
    }
  });

  it("never returns hot for uncertain", () => {
    const uncertainCombos = [
      { evidenceQuality: "primary", magnitude: "uncertain" },
      { evidenceQuality: "fallback", magnitude: "uncertain" },
      { evidenceQuality: "incomplete", magnitude: "uncertain" },
    ] as const;
    for (const combo of uncertainCombos) {
      expect(severityFor(combo)).not.toBe("hot");
    }
  });
});
