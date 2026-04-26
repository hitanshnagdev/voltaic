import { describe, expect, it } from "vitest";
import type { DocumentPageCitation } from "@/lib/llm";
import {
  findCitationForQuote,
  hasSupportingCitation,
  verifyField,
} from "./citation_guard";

const cite = (
  citedText: string,
  startPage: number = 1,
  endPage: number = startPage + 1,
): DocumentPageCitation => ({
  type: "page_location",
  citedText,
  documentIndex: 0,
  documentTitle: null,
  startPageNumber: startPage,
  endPageNumber: endPage,
});

describe("hasSupportingCitation", () => {
  it("returns true when citation contains the quote verbatim", () => {
    const citations = [cite("AIC: 65 kAIC at 480Y/277V (fully rated standalone)")];
    expect(hasSupportingCitation("65 kAIC at 480V", citations)).toBe(true);
  });

  it("returns true when quote contains the citation (model quoted longer span)", () => {
    const citations = [cite("Series-rated combination")];
    expect(
      hasSupportingCitation(
        "Series-rated combination with 65 kAIC upstream breaker",
        citations,
      ),
    ).toBe(true);
  });

  it("is case-insensitive", () => {
    const citations = [cite("UL 891 LISTED AND LABELED")];
    expect(hasSupportingCitation("ul 891 listed", citations)).toBe(true);
  });

  it("collapses whitespace differences across newlines and tabs", () => {
    const citations = [cite("65\n  kAIC\tat   480V")];
    expect(hasSupportingCitation("65 kAIC at 480V", citations)).toBe(true);
  });

  it("returns false when quote text never appears in any citation", () => {
    const citations = [cite("Bus bracing: 65 kA")];
    expect(hasSupportingCitation("AIC: 100 kAIC at 240V", citations)).toBe(false);
  });

  it("returns false on empty / whitespace quote even with citations present", () => {
    const citations = [cite("anything goes here")];
    expect(hasSupportingCitation("", citations)).toBe(false);
    expect(hasSupportingCitation("   ", citations)).toBe(false);
  });

  it("returns false on null / undefined quote", () => {
    const citations = [cite("anything")];
    expect(hasSupportingCitation(null, citations)).toBe(false);
    expect(hasSupportingCitation(undefined, citations)).toBe(false);
  });

  it("returns false when citations array is empty", () => {
    expect(hasSupportingCitation("65 kAIC", [])).toBe(false);
  });

  it("walks through multiple citations until one matches", () => {
    const citations = [
      cite("Frame size: QED-2 2000A"),
      cite("Voltage: 480Y/277V"),
      cite("AIC at primary voltage: 42 kA RMS"),
    ];
    // Third citation is the one that matches.
    expect(hasSupportingCitation("AIC at primary voltage: 42 kA RMS", citations)).toBe(
      true,
    );
  });
});

describe("findCitationForQuote", () => {
  it("returns the citation whose cited_text overlaps the quote", () => {
    const target = cite("AIC: 42 kA RMS @ 480V (series-rated)", 2, 3);
    const citations = [
      cite("Frame size: QED-2 2000A", 1, 2),
      target,
      cite("Configuration: front-accessible", 4, 5),
    ];
    expect(findCitationForQuote("42 kA RMS @ 480V", citations)).toBe(target);
  });

  it("returns the FIRST overlapping citation when multiple match", () => {
    // Citations are typically returned in document order; preferring the
    // first match means we cite the earliest page when a quote shows up
    // multiple times.
    const first = cite("65 kAIC", 2);
    const second = cite("65 kAIC repeated on summary page", 7);
    const citations = [first, second];
    expect(findCitationForQuote("65 kAIC", citations)).toBe(first);
  });

  it("returns null when no citation matches", () => {
    const citations = [cite("UL 891 listed")];
    expect(findCitationForQuote("AIC 65 kA", citations)).toBeNull();
  });

  it("returns null on empty quote", () => {
    const citations = [cite("anything")];
    expect(findCitationForQuote("", citations)).toBeNull();
  });
});

describe("verifyField", () => {
  const citations = [
    cite("AIC: 42 kA RMS @ 480V (series-rated combination)", 2),
    cite("Bus bracing: 65 kA", 3),
    cite("UL 891 listed and labeled", 1),
  ];

  it("verifies a well-formed citation-backed field", () => {
    const { verified, dropped } = verifyField<number>(
      "aic_ka",
      { value: 42, evidence_quote: "AIC: 42 kA RMS @ 480V" },
      citations,
    );
    expect(dropped).toBeNull();
    expect(verified).toEqual({
      value: 42,
      evidenceQuote: "AIC: 42 kA RMS @ 480V",
      pageNum: 2,
    });
  });

  it("treats explicit null as legitimate absence (not dropped, not verified)", () => {
    const { verified, dropped } = verifyField<number>("aic_ka", null, citations);
    expect(verified).toBeNull();
    expect(dropped).toBeNull();
  });

  it("drops a malformed field missing the value key", () => {
    const { verified, dropped } = verifyField<number>(
      "aic_ka",
      { evidence_quote: "AIC: 42 kA" },
      citations,
    );
    expect(verified).toBeNull();
    expect(dropped?.reason).toBe("malformed");
  });

  it("drops a malformed field missing the evidence_quote key", () => {
    const { verified, dropped } = verifyField<number>(
      "aic_ka",
      { value: 42 },
      citations,
    );
    expect(verified).toBeNull();
    expect(dropped?.reason).toBe("malformed");
  });

  it("drops a field with empty / whitespace-only evidence_quote", () => {
    const { verified, dropped } = verifyField<number>(
      "aic_ka",
      { value: 42, evidence_quote: "   " },
      citations,
    );
    expect(verified).toBeNull();
    expect(dropped?.reason).toBe("empty_quote");
    expect(dropped?.rawValue).toBe(42);
  });

  it("drops a field whose evidence_quote has no citation overlap (the hallucination case)", () => {
    // Model claims it read "AIC: 100 kA" but no citation supports that.
    // This is exactly what the guard exists to catch.
    const { verified, dropped } = verifyField<number>(
      "aic_ka",
      { value: 100, evidence_quote: "AIC: 100 kA at 240V" },
      citations,
    );
    expect(verified).toBeNull();
    expect(dropped?.reason).toBe("no_citation_support");
    expect(dropped?.fieldName).toBe("aic_ka");
    expect(dropped?.evidenceQuote).toBe("AIC: 100 kA at 240V");
    expect(dropped?.rawValue).toBe(100);
  });

  it("uses the citation's startPageNumber for verified field's pageNum", () => {
    const { verified } = verifyField<string>(
      "listings",
      { value: "UL 891", evidence_quote: "UL 891 listed and labeled" },
      citations,
    );
    expect(verified?.pageNum).toBe(1);
  });

  it("preserves complex value types verbatim (arrays, objects, booleans)", () => {
    const arr = verifyField<string[]>(
      "listings",
      {
        value: ["UL 891", "UL 67"],
        evidence_quote: "UL 891 listed and labeled",
      },
      citations,
    );
    expect(arr.verified?.value).toEqual(["UL 891", "UL 67"]);

    const bool = verifyField<boolean>(
      "series_rated",
      { value: true, evidence_quote: "series-rated combination" },
      citations,
    );
    expect(bool.verified?.value).toBe(true);
  });

  it("never drops based on the value matching anything — only on the quote", () => {
    // The value is 999 (clearly wrong), but the quote IS supported by
    // a citation. The guard's job is to verify the model isn't lying
    // about what it read; it doesn't second-guess the model's
    // extraction logic. That's downstream's job (rules).
    const { verified, dropped } = verifyField<number>(
      "aic_ka",
      { value: 999, evidence_quote: "AIC: 42 kA RMS @ 480V" },
      citations,
    );
    expect(dropped).toBeNull();
    expect(verified?.value).toBe(999);
  });
});
