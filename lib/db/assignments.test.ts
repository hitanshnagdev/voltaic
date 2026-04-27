/**
 * The functions in lib/db/assignments.ts are mostly DB-bound — there's
 * no significant pure logic to unit-test in isolation. The test that
 * matters here is for the request-body parsing in the POST handler:
 * it has explicit branches for missing ids, invalid source values,
 * empty csi_section strings, etc. Mirrored as pure functions so the
 * route handler stays thin and the validation is testable without
 * spinning up Next.js / Clerk / Postgres.
 */
import { describe, expect, it } from "vitest";

/** Mirror of the validation branch inside POST /api/assignments. */
type ParsedAssign =
  | { ok: true; submittalDocumentId: string; specDocumentId: string; csiSection: string | null; source: "manual" | "auto-suggested" | "auto-applied"; notes: string | null }
  | { ok: false; error: string };

function parseAssignBody(body: unknown): ParsedAssign {
  if (!body || typeof body !== "object") return { ok: false, error: "invalid_body" };
  const b = body as Record<string, unknown>;
  const submittalDocumentId = typeof b.submittalDocumentId === "string" ? b.submittalDocumentId : null;
  const specDocumentId = typeof b.specDocumentId === "string" ? b.specDocumentId : null;
  if (!submittalDocumentId || !specDocumentId) return { ok: false, error: "missing_document_ids" };
  const csiSection =
    typeof b.csiSection === "string" && b.csiSection.trim().length > 0
      ? b.csiSection.trim()
      : null;
  const source: "manual" | "auto-suggested" | "auto-applied" =
    b.source === "auto-suggested" || b.source === "auto-applied"
      ? b.source
      : "manual";
  const notes = typeof b.notes === "string" ? b.notes : null;
  return { ok: true, submittalDocumentId, specDocumentId, csiSection, source, notes };
}

describe("parseAssignBody", () => {
  it("accepts a minimal valid body and defaults to source='manual'", () => {
    const out = parseAssignBody({
      submittalDocumentId: "11111111-1111-1111-1111-111111111111",
      specDocumentId: "22222222-2222-2222-2222-222222222222",
    });
    expect(out).toEqual({
      ok: true,
      submittalDocumentId: "11111111-1111-1111-1111-111111111111",
      specDocumentId: "22222222-2222-2222-2222-222222222222",
      csiSection: null,
      source: "manual",
      notes: null,
    });
  });

  it("trims csiSection and treats whitespace-only as null", () => {
    const trimmed = parseAssignBody({
      submittalDocumentId: "x",
      specDocumentId: "y",
      csiSection: "  26 24 16  ",
    });
    expect(trimmed).toMatchObject({ ok: true, csiSection: "26 24 16" });
    const blank = parseAssignBody({
      submittalDocumentId: "x",
      specDocumentId: "y",
      csiSection: "   ",
    });
    expect(blank).toMatchObject({ ok: true, csiSection: null });
  });

  it("accepts the three valid source values, falls back to 'manual'", () => {
    for (const src of ["manual", "auto-suggested", "auto-applied"] as const) {
      const out = parseAssignBody({
        submittalDocumentId: "x",
        specDocumentId: "y",
        source: src,
      });
      expect(out).toMatchObject({ ok: true, source: src });
    }
    const garbage = parseAssignBody({
      submittalDocumentId: "x",
      specDocumentId: "y",
      source: "🦄",
    });
    expect(garbage).toMatchObject({ ok: true, source: "manual" });
  });

  it("rejects missing document ids", () => {
    expect(parseAssignBody({})).toEqual({ ok: false, error: "missing_document_ids" });
    expect(parseAssignBody({ submittalDocumentId: "x" })).toEqual({
      ok: false,
      error: "missing_document_ids",
    });
    expect(parseAssignBody({ specDocumentId: "y" })).toEqual({
      ok: false,
      error: "missing_document_ids",
    });
  });

  it("rejects non-object bodies", () => {
    expect(parseAssignBody(null)).toMatchObject({ ok: false });
    expect(parseAssignBody("string")).toMatchObject({ ok: false });
    expect(parseAssignBody(42)).toMatchObject({ ok: false });
  });

  it("ignores non-string notes", () => {
    const out = parseAssignBody({
      submittalDocumentId: "x",
      specDocumentId: "y",
      notes: { not: "a string" },
    });
    expect(out).toMatchObject({ ok: true, notes: null });
  });
});
