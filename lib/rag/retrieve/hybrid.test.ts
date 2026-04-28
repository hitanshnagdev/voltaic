import { describe, expect, it } from "vitest";
import { _internal } from "./hybrid";

describe("flattenFields", () => {
  it("returns key: value pairs joined with comma+space", () => {
    expect(
      _internal.flattenFields({ aic_ka: 65, sccr_ka: 65, enclosure_nema: "1" }),
    ).toBe("aic_ka: 65, sccr_ka: 65, enclosure_nema: 1");
  });
  it("skips underscore-prefixed keys (citation metadata)", () => {
    expect(
      _internal.flattenFields({
        aic_ka: 65,
        _citations: [{ pageNum: 4 }],
      }),
    ).toBe("aic_ka: 65");
  });
  it("skips null and object values that don't serialize cleanly", () => {
    expect(
      _internal.flattenFields({
        aic_ka: 65,
        notes: null,
        nested: { foo: "bar" },
      }),
    ).toBe("aic_ka: 65");
  });
});

describe("submittalFieldContent", () => {
  it("renders tag · vendor · model — fields", () => {
    const out = _internal.submittalFieldContent({
      id: "x",
      documentId: "d",
      pageNum: 3,
      equipmentTag: "MDP-A",
      vendor: "Square D",
      modelNum: "QED-2",
      fields: { aic_ka: 65, sccr_ka: 65 },
    });
    expect(out).toBe("MDP-A · Square D · QED-2 — aic_ka: 65, sccr_ka: 65");
  });
  it("falls back to head-only when fields are empty", () => {
    expect(
      _internal.submittalFieldContent({
        id: "x",
        documentId: "d",
        pageNum: null,
        equipmentTag: "MDP-A",
        vendor: null,
        modelNum: null,
        fields: {},
      }),
    ).toBe("MDP-A");
  });
  it("returns a placeholder when nothing is set", () => {
    expect(
      _internal.submittalFieldContent({
        id: "x",
        documentId: "d",
        pageNum: null,
        equipmentTag: null,
        vendor: null,
        modelNum: null,
        fields: {},
      }),
    ).toBe("(empty submittal field record)");
  });
});

describe("toOrTsQuery", () => {
  it("ORs significant tokens with prefix match", () => {
    expect(_internal.toOrTsQuery("AIC requirements")).toBe(
      "aic:* | requirements:*",
    );
  });
  it("strips punctuation and short tokens", () => {
    // "MDP-A" → "mdpa" (dash stripped); "65" → dropped (under 3 chars).
    // "Does" + "the" are stopwords, "65" too short.
    expect(_internal.toOrTsQuery("Does the MDP-A meet 65 kAIC?")).toBe(
      "mdpa:* | meet:* | kaic:*",
    );
  });
  it("drops common stopwords", () => {
    // "what", "are", "the", "for" are stopwords; "submittal" + "values"
    // remain (longer than 2 chars and not in the list).
    expect(_internal.toOrTsQuery("what are the submittal values for SCCR")).toBe(
      "submittal:* | values:* | sccr:*",
    );
  });
  it("dedupes repeated tokens", () => {
    expect(_internal.toOrTsQuery("aic AIC aic")).toBe("aic:*");
  });
  it("returns null when nothing usable remains", () => {
    expect(_internal.toOrTsQuery("the and for")).toBeNull();
    expect(_internal.toOrTsQuery("")).toBeNull();
  });
  it("preserves underscored attribute names like aic_ka", () => {
    // "compare" survives (not a stopword); "and" is filtered.
    expect(_internal.toOrTsQuery("compare aic_ka and sccr_ka")).toBe(
      "compare:* | aic_ka:* | sccr_ka:*",
    );
  });
});

describe("submittalResponseContent", () => {
  it("renders attribute = value — quote", () => {
    expect(
      _internal.submittalResponseContent({
        id: "x",
        submittalDocumentId: "d",
        pageNum: 3,
        attribute: "aic_ka",
        evidenceQuote: "AIC rating: 65 kAIC",
        value: 65,
      }),
    ).toBe('aic_ka = 65 — "AIC rating: 65 kAIC"');
  });
  it("works without an evidence quote", () => {
    expect(
      _internal.submittalResponseContent({
        id: "x",
        submittalDocumentId: "d",
        pageNum: null,
        attribute: "aic_ka",
        evidenceQuote: null,
        value: 65,
      }),
    ).toBe("aic_ka = 65");
  });
  it("works without a value (just the quote)", () => {
    expect(
      _internal.submittalResponseContent({
        id: "x",
        submittalDocumentId: "d",
        pageNum: null,
        attribute: "aic_ka",
        evidenceQuote: "AIC rating: 65 kAIC",
        value: null,
      }),
    ).toBe('aic_ka — "AIC rating: 65 kAIC"');
  });
  it("stringifies object values for display", () => {
    expect(
      _internal.submittalResponseContent({
        id: "x",
        submittalDocumentId: "d",
        pageNum: null,
        attribute: "rating",
        evidenceQuote: null,
        value: { ka: 65, v: 480 },
      }),
    ).toBe('rating = {"ka":65,"v":480}');
  });
});
