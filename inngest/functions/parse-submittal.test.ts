import { describe, expect, it } from "vitest";
import type { DocumentPageCitation } from "@/lib/llm";
import { normalizeSubmittalPayload } from "./parse-submittal";

const fullPayload = () => ({
  equipment_tag: "MDP-A",
  vendor: "Square D",
  model_num: "NQOD442L225CU",
  fields: {
    aic_ka: 65,
    sccr_ka: 65,
    series_rated: false,
    voltage: "208Y/120V",
    voltage_system_v: 208,
    phase: 3,
    wires: 4,
    ampacity_a: 225,
    main_type: "MLO",
    poles: 3,
    enclosure_nema: "NEMA 1",
    listings: ["UL 67"],
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
      series_rated: false,
      voltage: "208Y/120V",
      voltage_system_v: 208,
      phase: 3,
      wires: 4,
      ampacity_a: 225,
      main_type: "MLO",
      poles: 3,
      enclosure_nema: "1",
      listings: ["UL 67"],
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
        series_rated: null,
        voltage: null,
        voltage_system_v: null,
        phase: null,
        wires: null,
        ampacity_a: null,
        main_type: null,
        poles: null,
        enclosure_nema: null,
        listings: null,
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

  it("derives voltage_system_v from raw voltage label when the model omits the typed field", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: {
        ...fullPayload().fields,
        voltage: "480Y/277V",
        voltage_system_v: null,
      },
    });
    expect(out.fields.voltage_system_v).toBe(480);
    expect(out.fields.voltage).toBe("480Y/277V");
  });

  it("uppercases main_type and trims whitespace", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, main_type: "  mcb  " },
    });
    expect(out.fields.main_type).toBe("MCB");
  });

  it("drops listings when the array is empty or only whitespace", () => {
    const empty = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, listings: [] },
    });
    expect(empty.fields.listings).toBeUndefined();
    const blank = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, listings: ["", "   "] },
    });
    expect(blank.fields.listings).toBeUndefined();
  });

  it("trims and keeps only non-empty listing strings", () => {
    const out = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, listings: ["  UL 891  ", "", "UL 67"] },
    });
    expect(out.fields.listings).toEqual(["UL 891", "UL 67"]);
  });

  it("preserves a series_rated boolean (including false) but omits when null", () => {
    const trueRated = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, series_rated: true },
    });
    expect(trueRated.fields.series_rated).toBe(true);
    const falseRated = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, series_rated: false },
    });
    expect(falseRated.fields.series_rated).toBe(false);
    const nullRated = normalizeSubmittalPayload({
      ...fullPayload(),
      fields: { ...fullPayload().fields, series_rated: null },
    });
    expect(nullRated.fields.series_rated).toBeUndefined();
  });

  it("plumbs page_location citations into fields._citations when supplied", () => {
    const citations: DocumentPageCitation[] = [
      {
        type: "page_location",
        citedText: "AIC: 42 kA RMS @ 480V (series-rated)",
        documentIndex: 0,
        documentTitle: "MDP-A_cutsheet.pdf",
        startPageNumber: 2,
        endPageNumber: 3,
      },
    ];
    const out = normalizeSubmittalPayload(fullPayload(), citations);
    expect(out.fields._citations).toEqual(citations);
  });

  it("omits _citations when none were captured", () => {
    const out = normalizeSubmittalPayload(fullPayload(), []);
    expect(out.fields._citations).toBeUndefined();
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
