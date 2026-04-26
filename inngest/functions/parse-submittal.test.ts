import { describe, expect, it } from "vitest";
import { normalizeSubmittalPayload } from "./parse-submittal";

const fullPayload = () => ({
  equipment_tag: "MDP-A",
  vendor: "Square D",
  model_num: "NQOD442L225CU",
  fields: {
    aic_ka: 65,
    sccr_ka: 65,
    voltage: "208Y/120V",
    ampacity_a: 225,
    poles: 3,
    enclosure_nema: "NEMA 1",
  },
  submittal_status: "approved",
  primary_page: 2,
});

describe("normalizeSubmittalPayload", () => {
  it("normalizes a clean payload", () => {
    const out = normalizeSubmittalPayload(fullPayload());
    expect(out.rawTag).toBe("MDP-A");
    expect(out.tagNormalized).toBe("MDPA");
    expect(out.vendor).toBe("Square D");
    expect(out.modelNum).toBe("NQOD442L225CU");
    expect(out.fields).toEqual({
      aic_ka: 65,
      sccr_ka: 65,
      voltage: "208Y/120V",
      ampacity_a: 225,
      poles: 3,
      enclosure_nema: "1",
    });
    expect(out.submittalStatus).toBe("approved");
    expect(out.pageNum).toBe(2);
  });

  it("renormalizes AIC string forms returned by the model", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: {
        ...fullPayload().fields,
        // model returned a string instead of a number
        aic_ka: "65 kAIC" as unknown as number,
      },
    });
    expect(out.fields.aic_ka).toBe(65);
  });

  it("converts amperes (65000) returned as kA to kA", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, aic_ka: 65000 },
    });
    // normalizeAicKa("65000") → "65000" stripped of separators, ≥1000, /1000 = 65
    expect(out.fields.aic_ka).toBe(65);
  });

  it("preserves null fields by omitting them from the output bag", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: {
        aic_ka: 42,
        sccr_ka: null,
        voltage: null,
        ampacity_a: null,
        poles: null,
        enclosure_nema: null,
      },
    });
    expect(out.fields).toEqual({ aic_ka: 42 });
  });

  it("returns null tagNormalized when equipment_tag is null", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      equipment_tag: null,
    });
    expect(out.rawTag).toBeNull();
    expect(out.tagNormalized).toBeNull();
  });

  it("normalizes NEMA enclosure to canonical form", () => {
    const variants: Array<[string, string]> = [
      ["NEMA 3R", "3R"],
      ["Type 4X", "4X"],
      ["3R", "3R"],
      ["nema-12", "12"],
    ];
    for (const [input, expected] of variants) {
      const out = normalizeSubmittalPayload({
        ...fullPayload(),
        fields: { ...fullPayload().fields, enclosure_nema: input },
      });
      expect(out.fields.enclosure_nema).toBe(expected);
    }
  });

  it("clamps invalid primary_page to 1", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      primary_page: 0,
    });
    expect(out.pageNum).toBe(1);
  });

  it("preserves primary_page when valid", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      primary_page: 4,
    });
    expect(out.pageNum).toBe(4);
  });

  it("strips out non-finite numbers from ampacity/poles", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: {
        ...fullPayload().fields,
        ampacity_a: NaN as unknown as number,
        poles: Infinity as unknown as number,
      },
    });
    expect(out.fields.ampacity_a).toBeUndefined();
    expect(out.fields.poles).toBeUndefined();
  });

  it("normalizes a tag with mixed separators to the same canonical form", () => {
    const variants = ["MDP-A", "MDP A", "MDP_A", "mdp-a", "MDP.A"];
    const normalized = variants.map(
      (t) => normalizeSubmittalPayload({ ...fullPayload(), equipment_tag: t }).tagNormalized,
    );
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("MDPA");
  });

  it("plumbs extraction_notes through the normalized fields bag for debugging", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      // Vision asked to explain its reasoning when a deviation table or
      // multi-voltage table is involved. We persist that into the fields
      // jsonb so an engineer can audit a finding without re-running vision.
      extraction_notes:
        "AIC and SCCR extracted from page 2 deviation table's Submitted column. Specified column showed 65 kA; submitted value is 42 kA.",
    });
    expect(out.fields.extraction_notes).toBe(
      "AIC and SCCR extracted from page 2 deviation table's Submitted column. Specified column showed 65 kA; submitted value is 42 kA.",
    );
  });

  it("omits extraction_notes when the model didn't supply one", () => {
    const out = normalizeSubmittalPayload(fullPayload());
    expect(out.fields.extraction_notes).toBeUndefined();
  });

  it("trims whitespace-only extraction_notes rather than persisting empty noise", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      extraction_notes: "   \n  ",
    });
    expect(out.fields.extraction_notes).toBeUndefined();
  });
});
