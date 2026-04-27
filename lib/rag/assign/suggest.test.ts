import { describe, expect, it } from "vitest";
import {
  validateSuggestion,
  type SpecCandidate,
} from "./suggest";

const candidates = (): SpecCandidate[] => [
  {
    documentId: "spec-panel",
    filename: "26-24-16-panelboards.pdf",
    csiSections: ["26 24 16"],
  },
  {
    documentId: "spec-switch",
    filename: "26-24-13-switchboards.pdf",
    csiSections: ["26 24 13"],
  },
];

describe("validateSuggestion", () => {
  it("accepts a well-formed high-confidence match", () => {
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-panel",
          csi_section: "26 24 16",
          confidence: 0.92,
          rationale: "Cover lists Square D NQOD panelboard.",
        },
      },
      candidates(),
    );
    expect(out).toEqual({
      specDocumentId: "spec-panel",
      csiSection: "26 24 16",
      confidence: 0.92,
      rationale: "Cover lists Square D NQOD panelboard.",
    });
  });

  it("returns null when match is null (model decided no plausible match)", () => {
    expect(validateSuggestion({ match: null }, candidates())).toBeNull();
  });

  it("rejects hallucinated spec_document_id (not in offered candidates)", () => {
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-i-made-up",
          confidence: 0.95,
        },
      },
      candidates(),
    );
    expect(out).toBeNull();
  });

  it("rejects below-threshold confidence (< 0.5 means don't suggest)", () => {
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-panel",
          confidence: 0.3,
        },
      },
      candidates(),
    );
    expect(out).toBeNull();
  });

  it("strips csi_section that doesn't belong to the chosen spec", () => {
    // Hallucination case: model picks the panelboard spec but invents
    // a CSI section that's only in a different spec.
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-panel",
          csi_section: "26 24 13", // belongs to switchboard spec, not panel
          confidence: 0.8,
        },
      },
      candidates(),
    );
    expect(out).not.toBeNull();
    expect(out!.csiSection).toBeNull(); // section dropped, suggestion kept
    expect(out!.specDocumentId).toBe("spec-panel");
  });

  it("preserves null csi_section (whole-doc assignment)", () => {
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-panel",
          csi_section: null,
          confidence: 0.7,
        },
      },
      candidates(),
    );
    expect(out!.csiSection).toBeNull();
  });

  it("normalizes empty rationale to empty string, not undefined", () => {
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-panel",
          confidence: 0.8,
        },
      },
      candidates(),
    );
    expect(out!.rationale).toBe("");
  });

  it("truncates over-long rationale to keep UI tidy", () => {
    const longText = "x".repeat(500);
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-panel",
          confidence: 0.8,
          rationale: longText,
        },
      },
      candidates(),
    );
    expect(out!.rationale.length).toBeLessThanOrEqual(240);
  });

  it("returns null on garbage shapes", () => {
    expect(validateSuggestion(null, candidates())).toBeNull();
    expect(validateSuggestion("nope", candidates())).toBeNull();
    expect(validateSuggestion({}, candidates())).toBeNull();
    expect(validateSuggestion({ match: "string" }, candidates())).toBeNull();
  });

  it("clamps invalid confidence values to 0 (which then fails the threshold)", () => {
    const out = validateSuggestion(
      {
        match: {
          spec_document_id: "spec-panel",
          confidence: 1.5, // out of range
        },
      },
      candidates(),
    );
    expect(out).toBeNull();
  });
});
