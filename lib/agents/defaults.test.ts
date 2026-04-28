import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_REVIEWER_SEED,
  COMPLIANCE_REVIEWER_SYSTEM_PROMPT,
} from "./defaults";

describe("COMPLIANCE_REVIEWER_SEED", () => {
  it("ships with isDefault=true so the API refuses delete", () => {
    expect(COMPLIANCE_REVIEWER_SEED.isDefault).toBe(true);
  });

  it("has both source filters on", () => {
    expect(COMPLIANCE_REVIEWER_SEED.sourceFilters).toEqual({
      specs: true,
      submittals: true,
    });
  });

  it("uses Sonnet 4.6 with a deterministic temperature", () => {
    expect(COMPLIANCE_REVIEWER_SEED.model).toBe("claude-sonnet-4-6");
    expect(COMPLIANCE_REVIEWER_SEED.temperature).toBe("0.20");
  });

  it("instructs the model to use [#N] citation markers", () => {
    expect(COMPLIANCE_REVIEWER_SYSTEM_PROMPT).toMatch(/\[#N\]/);
  });

  it("forbids inventing values not present", () => {
    expect(COMPLIANCE_REVIEWER_SYSTEM_PROMPT.toLowerCase()).toMatch(
      /(do not|never|don't) (infer|invent|guess)/i,
    );
  });
});
