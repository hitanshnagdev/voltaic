import "server-only";
import { classify, type LogCtx } from "@/lib/llm";

/**
 * Auto-suggest a spec assignment for a freshly-uploaded submittal.
 *
 * Inputs:
 *   - First N pages of submittal text (cover + first content page covers
 *     ~95% of cases — vendor/equipment identity is on the cover)
 *   - List of available specs in the project, with their CSI sections
 *
 * Output:
 *   - Best-matching spec doc + (optional) CSI section + confidence
 *   - Or null when nothing matches plausibly (no specs in project,
 *     submittal is genuinely cross-discipline, etc.)
 *
 * The suggestion is presented in the AssignModal as a pre-filled
 * option the user confirms with one click. Source = "auto-suggested"
 * means user-confirmed; "auto-applied" would be a future mode that
 * skips confirmation entirely (lower trust, not yet implemented).
 */

export type SpecCandidate = {
  documentId: string;
  filename: string;
  csiSections: string[];
};

export type SuggestionResult = {
  specDocumentId: string;
  /** Specific section within the spec, or null when the suggestion targets the whole doc. */
  csiSection: string | null;
  confidence: number;
  /** Short human-readable rationale for the UI ("Cover lists Square D NQOD panelboard, matches §2.05/A"). */
  rationale: string;
} | null;

const SYSTEM_PROMPT = `You are matching a vendor submittal to the spec section it most likely answers.

The user has uploaded a submittal PDF (a vendor cut sheet for one piece of electrical equipment). They will tell you what equipment is on the cover page and which CSI spec sections exist in their project. Pick the most-likely matching spec section.

Heuristics that work well in real construction docs:
- Panelboards (vendor types like NQOD, NF, PRL, NLAB) → CSI 26 24 16
- Switchboards (QED, MERA, etc.) → CSI 26 24 13
- Disconnects, safety switches → CSI 26 28 16
- Circuit breakers (standalone) → CSI 26 28 16 or 26 28 13
- Transformers (XFMR, dry-type, K-rated) → CSI 26 22 13
- Motor control centers → CSI 26 24 19
- Lighting fixtures → CSI 26 51 13
- VFDs / motor controllers → CSI 26 29 23

OUTPUT FORMAT — JSON ONLY:

{
  "match": {
    "spec_document_id": "<one of the provided spec doc ids>",
    "csi_section": "<one of that spec's CSI sections, or null if uncertain>",
    "confidence": 0.0..1.0,
    "rationale": "<one short sentence>"
  } | null
}

Return match=null when:
- No spec in the project plausibly matches this submittal
- The submittal is too ambiguous to commit to a specific section (cover doesn't identify the equipment type)
- Multiple specs match equally well and you can't disambiguate

Confidence calibration:
- 0.9+ → vendor type clearly identifies one CSI section, exact match in project
- 0.7-0.9 → equipment type is clear but multiple plausible sections
- 0.5-0.7 → genuinely ambiguous; user should verify
- <0.5 → don't return; use match=null instead

Return JSON only, no prose outside it.`;

const buildUserPrompt = (args: {
  coverText: string;
  candidates: SpecCandidate[];
}) => {
  const candidatesBlock = args.candidates
    .map((c) => {
      const sections =
        c.csiSections.length > 0
          ? c.csiSections.map((s) => `§${s}`).join(", ")
          : "(no CSI sections resolved)";
      return `  - id: ${c.documentId}\n    filename: ${c.filename}\n    sections: ${sections}`;
    })
    .join("\n");
  return `SUBMITTAL COVER TEXT (first 3 pages, truncated):
${args.coverText.slice(0, 4000)}

AVAILABLE SPECS IN THIS PROJECT:
${candidatesBlock}

Pick the best matching spec + section, or return match=null.`;
};

/**
 * Pure-ish: takes the cover text and candidates, returns a suggestion
 * via Sonnet. Exported for the runner; tests mock the classify call
 * to avoid hitting the API.
 */
export async function suggestSpecAssignment(args: {
  coverText: string;
  candidates: SpecCandidate[];
  ctx: LogCtx;
}): Promise<SuggestionResult> {
  if (args.candidates.length === 0) return null;
  if (args.coverText.trim().length === 0) return null;

  type RawResponse = {
    match: {
      spec_document_id?: string;
      csi_section?: string | null;
      confidence?: number;
      rationale?: string;
    } | null;
  };

  const raw = await classify<RawResponse>({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(args),
    ctx: args.ctx,
    purpose: "classify",
    model: "claude-sonnet-4-6",
    maxTokens: 600,
  });

  return validateSuggestion(raw, args.candidates);
}

/**
 * Boundary validator: drop the suggestion if it points at a doc id we
 * didn't offer (model hallucination), or names a CSI section that
 * doesn't belong to the chosen spec, or fails confidence/shape checks.
 *
 * Exported for unit tests.
 */
export function validateSuggestion(
  raw: unknown,
  candidates: SpecCandidate[],
): SuggestionResult {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { match?: unknown };
  if (!r.match || typeof r.match !== "object") return null;
  const m = r.match as Record<string, unknown>;

  const specDocumentId =
    typeof m.spec_document_id === "string" ? m.spec_document_id : null;
  if (!specDocumentId) return null;

  const candidate = candidates.find((c) => c.documentId === specDocumentId);
  // Hallucinated doc id — model picked something we didn't offer.
  if (!candidate) return null;

  const confidence =
    typeof m.confidence === "number" &&
    m.confidence >= 0 &&
    m.confidence <= 1
      ? m.confidence
      : 0;
  // Below-threshold means "don't suggest, force manual."
  if (confidence < 0.5) return null;

  let csiSection: string | null = null;
  if (typeof m.csi_section === "string" && m.csi_section.trim().length > 0) {
    const cleaned = m.csi_section.trim();
    // Reject sections that don't belong to the chosen spec.
    if (candidate.csiSections.includes(cleaned)) {
      csiSection = cleaned;
    }
  }

  const rationale =
    typeof m.rationale === "string" && m.rationale.trim().length > 0
      ? m.rationale.trim().slice(0, 240)
      : "";

  return {
    specDocumentId,
    csiSection,
    confidence,
    rationale,
  };
}
