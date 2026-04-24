import { describe, expect, it } from "vitest";
import { classify } from "./classify";

describe("classify", () => {
  it("classifies AIC paragraph", () => {
    expect(
      classify({
        content:
          "Circuit breakers shall have an interrupting rating of at least 22 kAIC symmetrical at 480V.",
      }),
    ).toBe("aic");
  });

  it("classifies SCCR paragraph", () => {
    expect(
      classify({
        content:
          "The panelboard short-circuit current rating shall be 65 kA symmetrical.",
      }),
    ).toBe("sccr");
  });

  it("classifies enclosure spec", () => {
    expect(
      classify({
        content: "Provide NEMA 3R enclosure for outdoor installations.",
      }),
    ).toBe("enclosure");
  });

  it("classifies clearance requirement", () => {
    expect(
      classify({
        content:
          "Maintain working clearance per NEC 110.26 in front of all equipment.",
      }),
    ).toBe("clearance");
  });

  it("classifies grounding paragraph", () => {
    expect(
      classify({
        content:
          "Bond all metallic raceways. Provide equipment grounding conductor sized per NEC Table 250.122.",
      }),
    ).toBe("grounding");
  });

  it("does not mistake 'ground floor' for grounding", () => {
    expect(
      classify({
        content: "Equipment located on the ground floor shall be accessible.",
      }),
    ).toBe("other");
  });

  it("classifies conductor spec", () => {
    expect(
      classify({
        content: "Provide #12 AWG copper conductors with THHN insulation.",
      }),
    ).toBe("conductor");
  });

  it("classifies approved-manufacturer list", () => {
    expect(
      classify({
        content:
          "Subject to compliance with requirements, provide products by one of the following: Eaton, Square D, Siemens.",
      }),
    ).toBe("approved_manufacturer");
  });

  it("uses article-title override for MANUFACTURERS", () => {
    expect(
      classify({
        content: "Eaton Cutler-Hammer",
        articleTitle: "MANUFACTURERS",
      }),
    ).toBe("approved_manufacturer");
  });

  it("falls through to 'other' when no signal", () => {
    expect(
      classify({
        content: "Submit shop drawings prior to fabrication.",
      }),
    ).toBe("other");
  });

  it("AIC wins over SCCR when both mentioned (priority)", () => {
    expect(
      classify({
        content:
          "Provide breakers with interrupting rating above the system SCCR.",
      }),
    ).toBe("aic");
  });
});
