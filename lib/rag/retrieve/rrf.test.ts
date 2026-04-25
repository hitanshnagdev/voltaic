import { describe, expect, it } from "vitest";
import { rrf } from "./rrf";

const id = (item: { id: string }) => item.id;

describe("rrf", () => {
  it("returns the single list ranked the same way when only one source is present", () => {
    const list = [
      { item: { id: "a" }, rank: 1 },
      { item: { id: "b" }, rank: 2 },
      { item: { id: "c" }, rank: 3 },
    ];
    const fused = rrf([list], { keyOf: id });
    expect(fused.map((r) => r.item.id)).toEqual(["a", "b", "c"]);
    expect(fused[0].score).toBeGreaterThan(fused[1].score);
  });

  it("boosts an item that appears in both rankings over an item only in one", () => {
    const bm25 = [
      { item: { id: "a" }, rank: 1 },
      { item: { id: "b" }, rank: 2 },
    ];
    const vector = [
      { item: { id: "b" }, rank: 1 }, // b is top in both
      { item: { id: "c" }, rank: 2 },
    ];
    const fused = rrf([bm25, vector], { keyOf: id });
    expect(fused[0].item.id).toBe("b");
  });

  it("respects k — higher k flattens contribution differences", () => {
    const list = [
      { item: { id: "x" }, rank: 1 },
      { item: { id: "y" }, rank: 50 },
    ];
    const lowK = rrf([list], { keyOf: id, k: 1 });
    const highK = rrf([list], { keyOf: id, k: 1000 });

    const ratioLow = lowK[0].score / lowK[1].score;
    const ratioHigh = highK[0].score / highK[1].score;
    expect(ratioLow).toBeGreaterThan(ratioHigh);
  });

  it("sums contributions across all lists for the same item", () => {
    const a = [{ item: { id: "x" }, rank: 1 }];
    const b = [{ item: { id: "x" }, rank: 1 }];
    const c = [{ item: { id: "x" }, rank: 1 }];
    const fused = rrf([a, b, c], { keyOf: id, k: 60 });
    expect(fused).toHaveLength(1);
    // Three identical contributions of 1/(60+1).
    expect(fused[0].score).toBeCloseTo(3 / 61, 10);
  });

  it("handles empty rankings without throwing", () => {
    expect(rrf([[]], { keyOf: id })).toEqual([]);
    expect(rrf([], { keyOf: id })).toEqual([]);
  });

  it("breaks ties stably by aggregate score (later sort)", () => {
    const a = [
      { item: { id: "p" }, rank: 1 },
      { item: { id: "q" }, rank: 2 },
    ];
    const b = [
      { item: { id: "q" }, rank: 1 },
      { item: { id: "p" }, rank: 2 },
    ];
    const fused = rrf([a, b], { keyOf: id });
    // p and q should have identical scores (1/61 + 1/62) — both in output,
    // both with equal score within fp tolerance.
    expect(fused).toHaveLength(2);
    expect(fused[0].score).toBeCloseTo(fused[1].score, 10);
  });
});
