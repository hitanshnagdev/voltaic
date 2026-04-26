import { describe, expect, it } from "vitest";
import type { DocumentPageCitation } from "@/lib/llm";
import { normalizeSubmittalPayload } from "./parse-submittal";

/**
 * Helper: build a CitableField with a quote that we'll match against
 * the default citation set below. Tests can override individual quotes
 * to exercise the dropped/verified split.
 */
const cf = <T,>(value: T, quote: string) => ({ value, evidence_quote: quote });

const citation = (
  citedText: string,
  startPage: number = 2,
  endPage: number = startPage + 1,
): DocumentPageCitation => ({
  type: "page_location",
  citedText,
  documentIndex: 0,
  documentTitle: "MDP-A_cutsheet.pdf",
  startPageNumber: startPage,
  endPageNumber: endPage,
});

/**
 * Default citation set — covers every quote in `fullPayload()` so the
 * baseline test renders the full happy path. Tests that exercise
 * dropping pass narrower citation arrays.
 */
const defaultCitations = (): DocumentPageCitation[] => [
  citation("Equipment Tag: MDP-A", 1),
  citation("Square D NQOD442L225CU panelboard", 1),
  citation("AIC: 65 kAIC at 480Y/277V (fully rated)", 2),
  citation("SCCR / bus bracing: 65 kA RMS symmetrical", 2),
  citation("Fully rated standalone, NOT series-rated", 2),
  citation("Voltage: 208Y/120V system", 2),
  citation("3-phase 4-wire wye distribution", 2),
  citation("Main lugs only (MLO), 225 A frame, 3 poles", 2),
  citation("NEMA 1 indoor enclosure", 3),
  citation("Listed under UL 67", 1),
  citation("Approval stamp: Approved", 1),
];

const fullPayload = () => ({
  equipment_tag: cf("MDP-A", "Equipment Tag: MDP-A"),
  vendor: cf("Square D", "Square D NQOD442L225CU panelboard"),
  model_num: cf("NQOD442L225CU", "Square D NQOD442L225CU panelboard"),
  fields: {
    aic_ka: cf<number>(65, "AIC: 65 kAIC at 480Y/277V (fully rated)"),
    sccr_ka: cf<number>(65, "SCCR / bus bracing: 65 kA RMS"),
    series_rated: cf<boolean>(false, "Fully rated standalone, NOT series-rated"),
    voltage: cf("208Y/120V", "Voltage: 208Y/120V system"),
    voltage_system_v: cf<number>(208, "Voltage: 208Y/120V system"),
    phase: cf<number>(3, "3-phase 4-wire wye distribution"),
    wires: cf<number>(4, "3-phase 4-wire wye distribution"),
    ampacity_a: cf<number>(225, "Main lugs only (MLO), 225 A frame, 3 poles"),
    main_type: cf("MLO", "Main lugs only (MLO), 225 A frame"),
    poles: cf<number>(3, "225 A frame, 3 poles"),
    enclosure_nema: cf("NEMA 1", "NEMA 1 indoor enclosure"),
    listings: cf<string[]>(["UL 67"], "Listed under UL 67"),
  },
  submittal_status: cf("approved", "Approval stamp: Approved"),
  primary_page: 2,
});

describe("normalizeSubmittalPayload", () => {
  it("normalizes a clean payload when every quote has citation backing", () => {
    const out = normalizeSubmittalPayload(fullPayload(), defaultCitations());
    expect(out.rawTag).toBe("MDP-A");
    expect(out.tagNormalized).toBe("MDPA");
    expect(out.vendor).toBe("Square D");
    expect(out.modelNum).toBe("NQOD442L225CU");
    // Spot-check the value bag — _evidence and _citations break .toEqual
    // on object identity, so we walk individual keys for the value
    // assertions and check the meta keys separately.
    expect(out.fields.aic_ka).toBe(65);
    expect(out.fields.sccr_ka).toBe(65);
    expect(out.fields.series_rated).toBe(false);
    expect(out.fields.voltage).toBe("208Y/120V");
    expect(out.fields.voltage_system_v).toBe(208);
    expect(out.fields.phase).toBe(3);
    expect(out.fields.wires).toBe(4);
    expect(out.fields.ampacity_a).toBe(225);
    expect(out.fields.main_type).toBe("MLO");
    expect(out.fields.poles).toBe(3);
    expect(out.fields.enclosure_nema).toBe("1");
    expect(out.fields.listings).toEqual(["UL 67"]);
    expect(out.submittalStatus).toBe("approved");
    expect(out.dropped).toEqual([]);
  });

  it("populates _evidence with per-field quote + citation page number", () => {
    const out = normalizeSubmittalPayload(fullPayload(), defaultCitations());
    const ev = out.fields._evidence as Record<
      string,
      { evidence_quote: string; page_num: number }
    >;
    expect(ev).toBeDefined();
    expect(ev.aic_ka).toEqual({
      evidence_quote: "AIC: 65 kAIC at 480Y/277V (fully rated)",
      page_num: 2,
    });
    expect(ev.enclosure_nema.page_num).toBe(3);
    expect(ev.listings.page_num).toBe(1);
  });

  it("preserves the _citations array as passive evidence", () => {
    const cs = defaultCitations();
    const out = normalizeSubmittalPayload(fullPayload(), cs);
    expect(out.fields._citations).toEqual(cs);
  });

  it("renormalizes AIC string forms returned by the model", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          aic_ka: cf<number>(
            "65 kAIC" as unknown as number,
            "AIC: 65 kAIC at 480Y/277V (fully rated)",
          ),
        },
      },
      defaultCitations(),
    );
    expect(out.fields.aic_ka).toBe(65);
  });

  it("converts amperes (65000) returned as kA to kA", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          aic_ka: cf<number>(65000, "AIC: 65 kAIC at 480Y/277V (fully rated)"),
        },
      },
      defaultCitations(),
    );
    expect(out.fields.aic_ka).toBe(65);
  });

  it("treats explicit null fields as legitimate absence (not dropped)", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          aic_ka: cf<number>(42, "AIC: 65 kAIC at 480Y/277V (fully rated)"),
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
      },
      defaultCitations(),
    );
    expect(out.fields.aic_ka).toBe(42);
    expect(out.fields.sccr_ka).toBeUndefined();
    expect(out.dropped).toEqual([]);
  });

  it("drops a field whose evidence_quote has no citation overlap (the hallucination case)", () => {
    const payload = fullPayload();
    payload.fields.aic_ka = cf<number>(100, "AIC: 100 kA at 240V"); // unsupported
    const out = normalizeSubmittalPayload(payload, defaultCitations());
    expect(out.fields.aic_ka).toBeUndefined();
    expect(out.dropped.find((d) => d.fieldName === "aic_ka")).toMatchObject({
      reason: "no_citation_support",
      evidenceQuote: "AIC: 100 kA at 240V",
      rawValue: 100,
    });
  });

  it("drops the equipment tag when its quote is unsupported (orphan path will catch the no-tag case)", () => {
    const payload = fullPayload();
    payload.equipment_tag = cf(
      "FAKE-TAG",
      "fabricated tag never appearing in the document",
    );
    const out = normalizeSubmittalPayload(payload, defaultCitations());
    expect(out.rawTag).toBeNull();
    expect(out.tagNormalized).toBeNull();
    expect(out.dropped.find((d) => d.fieldName === "equipment_tag")).toBeDefined();
  });

  it("normalizes NEMA enclosure to canonical form when the quote is supported", () => {
    const variants: Array<{ raw: string; expected: string; quote: string }> = [
      { raw: "NEMA 3R", expected: "3R", quote: "NEMA 3R outdoor enclosure" },
      { raw: "Type 4X", expected: "4X", quote: "Type 4X stainless enclosure" },
      { raw: "3R", expected: "3R", quote: "Enclosure 3R rated" },
      { raw: "nema-12", expected: "12", quote: "nema-12 dust-tight" },
    ];
    for (const v of variants) {
      const out = normalizeSubmittalPayload(
        {
          ...fullPayload(),
          fields: { ...fullPayload().fields, enclosure_nema: cf(v.raw, v.quote) },
        },
        [...defaultCitations(), citation(v.quote, 4)],
      );
      expect(out.fields.enclosure_nema).toBe(v.expected);
    }
  });

  it("clamps invalid primary_page to 1 when no AIC citation provides a page", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: { ...fullPayload().fields, aic_ka: null },
        primary_page: 0,
      },
      defaultCitations(),
    );
    expect(out.pageNum).toBe(1);
  });

  it("prefers the AIC citation's page over the model's primary_page", () => {
    // Model says primary_page = 5, but the AIC citation lives on page 2.
    // The AIC page is API-verified, so we trust it over the self-report.
    const out = normalizeSubmittalPayload(
      { ...fullPayload(), primary_page: 5 },
      defaultCitations(),
    );
    expect(out.pageNum).toBe(2);
  });

  it("strips out non-finite numbers from ampacity/poles even when the quote is supported", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          ampacity_a: cf<number>(NaN, "Main lugs only (MLO), 225 A frame, 3 poles"),
          poles: cf<number>(
            Infinity,
            "Main lugs only (MLO), 225 A frame, 3 poles",
          ),
        },
      },
      defaultCitations(),
    );
    expect(out.fields.ampacity_a).toBeUndefined();
    expect(out.fields.poles).toBeUndefined();
  });

  it("derives voltage_system_v from raw voltage label when the typed field is absent but voltage is supported", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          voltage: cf("480Y/277V", "Voltage: 480Y/277V system"),
          voltage_system_v: null,
        },
      },
      [...defaultCitations(), citation("Voltage: 480Y/277V system", 2)],
    );
    expect(out.fields.voltage_system_v).toBe(480);
    expect(out.fields.voltage).toBe("480Y/277V");
  });

  it("uppercases main_type and trims whitespace", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          main_type: cf("  mcb  ", "Main circuit breaker (MCB), 1200 A frame"),
        },
      },
      [
        ...defaultCitations(),
        citation("Main circuit breaker (MCB), 1200 A frame", 2),
      ],
    );
    expect(out.fields.main_type).toBe("MCB");
  });

  it("drops listings when the array is empty or only whitespace", () => {
    const empty = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          listings: cf<string[]>([], "Listed under UL 67"),
        },
      },
      defaultCitations(),
    );
    expect(empty.fields.listings).toBeUndefined();
    const blank = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          listings: cf<string[]>(["", "   "], "Listed under UL 67"),
        },
      },
      defaultCitations(),
    );
    expect(blank.fields.listings).toBeUndefined();
  });

  it("trims and keeps only non-empty listing strings", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          listings: cf<string[]>(
            ["  UL 891  ", "", "UL 67"],
            "Listed under UL 891 and UL 67",
          ),
        },
      },
      [...defaultCitations(), citation("Listed under UL 891 and UL 67", 1)],
    );
    expect(out.fields.listings).toEqual(["UL 891", "UL 67"]);
  });

  it("preserves a series_rated boolean (including false) when supported, drops on hallucination", () => {
    const trueRated = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          series_rated: cf<boolean>(
            true,
            "AIC achieved via series-rated combination with upstream 65 kA breaker",
          ),
        },
      },
      [
        ...defaultCitations(),
        citation(
          "AIC achieved via series-rated combination with upstream 65 kA breaker",
          2,
        ),
      ],
    );
    expect(trueRated.fields.series_rated).toBe(true);
    const falseRated = normalizeSubmittalPayload(
      fullPayload(),
      defaultCitations(),
    );
    expect(falseRated.fields.series_rated).toBe(false);
    const nullRated = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: { ...fullPayload().fields, series_rated: null },
      },
      defaultCitations(),
    );
    expect(nullRated.fields.series_rated).toBeUndefined();
  });

  it("plumbs extraction_notes through verbatim — NOT citation-checked", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        extraction_notes:
          "AIC and SCCR extracted from page 2 deviation table's Submitted column.",
      },
      defaultCitations(),
    );
    expect(out.fields.extraction_notes).toBe(
      "AIC and SCCR extracted from page 2 deviation table's Submitted column.",
    );
  });

  it("trims whitespace-only extraction_notes rather than persisting empty noise", () => {
    const out = normalizeSubmittalPayload(
      { ...fullPayload(), extraction_notes: "   \n  " },
      defaultCitations(),
    );
    expect(out.fields.extraction_notes).toBeUndefined();
  });

  it("drops malformed CitableField records (model omitted required keys)", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: {
          ...fullPayload().fields,
          // Missing evidence_quote — model violated the schema.
          aic_ka: { value: 65 } as unknown as ReturnType<typeof cf<number>>,
        },
      },
      defaultCitations(),
    );
    expect(out.fields.aic_ka).toBeUndefined();
    expect(out.dropped.find((d) => d.fieldName === "aic_ka")?.reason).toBe(
      "malformed",
    );
  });

  it("drops a field with empty / whitespace-only evidence_quote", () => {
    const out = normalizeSubmittalPayload(
      {
        ...fullPayload(),
        fields: { ...fullPayload().fields, aic_ka: cf<number>(65, "   ") },
      },
      defaultCitations(),
    );
    expect(out.fields.aic_ka).toBeUndefined();
    expect(out.dropped.find((d) => d.fieldName === "aic_ka")?.reason).toBe(
      "empty_quote",
    );
  });

  it("drops every typed field when citations array is empty (no API verification possible)", () => {
    const out = normalizeSubmittalPayload(fullPayload(), []);
    // The empty-citations scenario is the all-fields-hallucinated worst
    // case: nothing to verify against, so nothing survives. This is the
    // failure mode the guard exists to make explicit.
    expect(out.fields.aic_ka).toBeUndefined();
    expect(out.fields.sccr_ka).toBeUndefined();
    expect(out.fields.enclosure_nema).toBeUndefined();
    expect(out.dropped.length).toBeGreaterThanOrEqual(13); // 3 header + 12 typed - listings tied to UL 67
    // _citations is omitted when the array is empty.
    expect(out.fields._citations).toBeUndefined();
  });

  it("normalizes a tag with mixed separators to the same canonical form (when each quote is supported)", () => {
    const variants = ["MDP-A", "MDP A", "MDP_A", "mdp-a", "MDP.A"];
    const normalized = variants.map((t) => {
      const payload = fullPayload();
      payload.equipment_tag = cf(t, `Equipment Tag: ${t}`);
      return normalizeSubmittalPayload(payload, [
        ...defaultCitations(),
        citation(`Equipment Tag: ${t}`, 1),
      ]).tagNormalized;
    });
    expect(new Set(normalized).size).toBe(1);
    expect(normalized[0]).toBe("MDPA");
  });
});
