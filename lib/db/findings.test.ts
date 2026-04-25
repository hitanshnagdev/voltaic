import { describe, expect, it } from "vitest";
import { severityRank, sortFindingsForToday } from "./findings";

const f = (
  overrides: Partial<{
    id: string;
    severity: "hot" | "warm" | "cool";
    timeToImpactDays: number | null;
    confidence: number;
  }> = {},
) => ({
  id: overrides.id ?? "f",
  severity: overrides.severity ?? "cool",
  timeToImpactDays: overrides.timeToImpactDays ?? null,
  confidence: overrides.confidence ?? 0.5,
});

describe("severityRank", () => {
  it("orders hot > warm > cool > unknown", () => {
    expect(severityRank("hot")).toBeGreaterThan(severityRank("warm"));
    expect(severityRank("warm")).toBeGreaterThan(severityRank("cool"));
    expect(severityRank("cool")).toBeGreaterThan(severityRank("anything-else"));
  });
});

describe("sortFindingsForToday", () => {
  it("orders hot above warm above cool", () => {
    const rows = [
      f({ id: "cool", severity: "cool" }),
      f({ id: "hot", severity: "hot" }),
      f({ id: "warm", severity: "warm" }),
    ];
    expect(sortFindingsForToday(rows).map((r) => r.id)).toEqual([
      "hot",
      "warm",
      "cool",
    ]);
  });

  it("breaks severity ties by time-to-impact ascending", () => {
    const rows = [
      f({ id: "later", severity: "hot", timeToImpactDays: 30 }),
      f({ id: "sooner", severity: "hot", timeToImpactDays: 4 }),
      f({ id: "middle", severity: "hot", timeToImpactDays: 14 }),
    ];
    expect(sortFindingsForToday(rows).map((r) => r.id)).toEqual([
      "sooner",
      "middle",
      "later",
    ]);
  });

  it("treats null time-to-impact as last within a severity tier", () => {
    const rows = [
      f({ id: "null", severity: "hot", timeToImpactDays: null }),
      f({ id: "soon", severity: "hot", timeToImpactDays: 7 }),
    ];
    expect(sortFindingsForToday(rows).map((r) => r.id)).toEqual([
      "soon",
      "null",
    ]);
  });

  it("breaks ties of severity + tti by confidence descending", () => {
    const rows = [
      f({ id: "low", severity: "hot", timeToImpactDays: 7, confidence: 0.6 }),
      f({ id: "high", severity: "hot", timeToImpactDays: 7, confidence: 0.95 }),
      f({ id: "mid", severity: "hot", timeToImpactDays: 7, confidence: 0.8 }),
    ];
    expect(sortFindingsForToday(rows).map((r) => r.id)).toEqual([
      "high",
      "mid",
      "low",
    ]);
  });

  it("does not promote a low-confidence hot above another hot with sooner tti", () => {
    // tti dominates confidence within a severity tier.
    const rows = [
      f({ id: "soon-low", severity: "hot", timeToImpactDays: 4, confidence: 0.3 }),
      f({ id: "later-high", severity: "hot", timeToImpactDays: 30, confidence: 0.99 }),
    ];
    expect(sortFindingsForToday(rows).map((r) => r.id)).toEqual([
      "soon-low",
      "later-high",
    ]);
  });
});
