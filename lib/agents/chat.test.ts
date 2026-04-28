import { describe, expect, it } from "vitest";
import { _internal } from "./chat";

describe("autoTitle", () => {
  it("returns short text verbatim", () => {
    expect(_internal.autoTitle("Does MDP-A meet 65 kAIC?")).toBe(
      "Does MDP-A meet 65 kAIC?",
    );
  });
  it("collapses whitespace", () => {
    expect(_internal.autoTitle("Does\n\n MDP-A   meet 65 kAIC?")).toBe(
      "Does MDP-A meet 65 kAIC?",
    );
  });
  it("truncates on word boundary with ellipsis when long", () => {
    const input =
      "Could you please double check whether the Square D MDP-A submittal meets the 65 kAIC requirement noted in section 26 24 16 §2.2.B and explain";
    const out = _internal.autoTitle(input);
    expect(out.length).toBeLessThanOrEqual(62);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toMatch(/[a-zA-Z…]$/);
    expect(out.includes(" ")).toBe(true);
  });
  it("hard-cuts when there's no space in the first 60 chars", () => {
    const input = "x".repeat(120);
    const out = _internal.autoTitle(input);
    // 60 chars + ellipsis when no space found near the cut.
    expect(out.length).toBe(61);
    expect(out.endsWith("…")).toBe(true);
  });
});
