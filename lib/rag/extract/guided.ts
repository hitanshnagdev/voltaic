import "server-only";
import { documentExtract, type LogCtx } from "@/lib/llm";

/**
 * Guided submittal extraction. Phase B PR 3 of docs/DECISIONS.md U12.
 *
 * Given a submittal PDF + the spec checklist that governs it, ask
 * Sonnet to find each checklist item's answer in the submittal. Returns
 * one response per item: either the value the submittal claims (typed
 * to match the item's required_kind) with verbatim quote + page, or
 * `found: false` when the submittal is silent on that requirement.
 *
 * Replaces the prior generic field-fishing in parse-submittal.ts that
 * had no idea what fields to look for and produced garbage extractions
 * for anything beyond the hardcoded panelboard schema. The checklist
 * IS the schema now — and it comes from the actual spec.
 */

export type ChecklistItemForGuide = {
  id: string;
  attribute: string;
  requiredKind: "numeric" | "enum" | "boolean" | "manufacturer_list" | "qualitative";
  comparator: string;
  /** Typed required value, shape matches requiredKind (number, string, string[], boolean, etc.). */
  requiredValue: unknown;
  unit: string | null;
  /** Verbatim spec text the requirement was extracted from — gives the model context. */
  rawQuote: string;
};

export type GuidedResponse = {
  checklistItemId: string;
  found: boolean;
  /** Typed value matching the item's requiredKind, or null when found=false. */
  value: number | string | string[] | boolean | null;
  evidenceQuote: string | null;
  pageNum: number | null;
  confidence: number;
};

const SYSTEM_PROMPT = `You are reviewing one submittal PDF (a vendor cut sheet for one piece of electrical equipment) against a specific spec checklist. The checklist is a list of typed requirements extracted from the spec section the user assigned this submittal to.

For EACH checklist item:
- If the submittal addresses this requirement, extract what the submittal claims and quote the verbatim text + page number.
- If the submittal does NOT address this requirement, set found=false and leave value/quote/page null.

Be conservative. "Silent on the requirement" is a real and useful answer — render it as found=false with confidence 0.9+. The compare page renders these as MISSING rows so the PM knows exactly what's not covered. Inventing values to fill gaps is WORSE than honest absence.

OUTPUT FORMAT — JSON ONLY:

{
  "responses": [
    {
      "checklist_item_id": "<exact id from the input checklist>",
      "found": true | false,
      "value": <typed per the item's required_kind, or null if found=false>,
      "evidence_quote": "<verbatim text from the submittal, OR null if found=false>",
      "page": <1-indexed page number, OR null if found=false>,
      "confidence": <0..1>
    },
    ...
  ]
}

Value typing per required_kind:
  numeric           → number (e.g. 42 for "42 kA")
  enum              → string (the actual code, e.g. "1" for NEMA 1, "UL 891")
  boolean           → boolean (true/false)
  manufacturer_list → string (the actual manufacturer named, e.g. "Square D")
  qualitative       → string (the relevant submittal text, lightly normalized)

CRITICAL:
- Return one response per checklist item — same count, same ids.
- Never invent values. found=false is the right answer when in doubt.
- evidence_quote MUST be verbatim from the submittal (basis for evidence binding downstream). Use the SHORTEST verbatim span that supports the value — usually 5–25 words.
- For numeric values, prefer the SUBMITTED column when the submittal contains a deviation table. The Specified column reflects what the spec asked for, not what the contractor is providing.
- Return JSON only, no prose outside it.`;

const buildPrompt = (args: {
  filename: string;
  checklist: ChecklistItemForGuide[];
  /** 0-based index when batched; used to label the prompt for clarity. */
  batchIndex?: number;
  /** Total number of batches; used to label the prompt for clarity. */
  batchCount?: number;
}) => {
  const checklistBlock = args.checklist
    .map((item, i) => {
      const v = JSON.stringify(item.requiredValue);
      const unit = item.unit ? ` (${item.unit})` : "";
      return `${i + 1}. id="${item.id}"
   attribute=${item.attribute}
   kind=${item.requiredKind}, comparator=${item.comparator}
   required_value=${v}${unit}
   spec_quote="${item.rawQuote.slice(0, 200)}"`;
    })
    .join("\n\n");
  const batchTag =
    args.batchIndex != null && args.batchCount != null && args.batchCount > 1
      ? ` (batch ${args.batchIndex + 1} of ${args.batchCount})`
      : "";
  return `Filename: ${args.filename}

CHECKLIST${batchTag} (${args.checklist.length} items):
${checklistBlock}

For each item above, find the submittal's answer or report it missing. Return JSON.`;
};

/**
 * How many checklist items to ship in one Sonnet vision call. Keeps
 * the response budget under control — at 250 output tokens per item
 * a batch of 15 needs ~3.75K output, well below the 8K cap. Larger
 * batches save calls (and total cost via prompt caching on the PDF)
 * but risk truncation when the model wants to be verbose.
 *
 * Picked 15 because:
 *   - 176-item demo spec splits cleanly into 12 batches
 *   - First batch is a cache write (~$0.034 for a 5K-token PDF + 4K
 *     output); subsequent 11 batches read the cached PDF for ~$0.017
 *     each → ~$0.22 total per submittal extraction
 *   - Without caching the same 12 calls would be ~$0.60+
 *   - Without batching the single 176-item call truncates → 0 rows
 *     persisted (the bug this PR fixes)
 */
const BATCH_SIZE = 15;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/**
 * Vision call against the submittal PDF with the checklist as
 * structured context. Citations enabled so each evidence_quote has
 * verifiable backing (Anthropic's citation API).
 *
 * Batching: long checklists are split into BATCH_SIZE chunks and
 * processed sequentially. The PDF document block carries
 * `cache_control: { type: "ephemeral" }` so all calls after the first
 * read the PDF input from Anthropic's 5-min cache. Sequential rather
 * than parallel because (a) the cache only helps once a write has
 * landed, and (b) parallelism risks hitting the workspace's RPM
 * ceiling on a single submittal.
 *
 * Exported for the runner; tests mock documentExtract.
 */
export async function extractAgainstChecklist(args: {
  pdfBase64: string;
  filename: string;
  checklist: ChecklistItemForGuide[];
  ctx: LogCtx;
}): Promise<GuidedResponse[]> {
  if (args.checklist.length === 0) return [];

  type RawResponse = {
    responses?: Array<{
      checklist_item_id?: string;
      found?: boolean;
      value?: unknown;
      evidence_quote?: string | null;
      page?: number | null;
      confidence?: number;
    }>;
  };

  const batches = chunk(args.checklist, BATCH_SIZE);
  const validated: GuidedResponse[] = [];

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    // 250 output tokens per item, padded; bounded [3K, 8K] per batch.
    const tokensNeeded = Math.min(
      8_000,
      Math.max(3_000, batch.length * 300),
    );

    const result = await documentExtract<RawResponse>({
      system: SYSTEM_PROMPT,
      prompt: buildPrompt({
        filename: args.filename,
        checklist: batch,
        batchIndex: i,
        batchCount: batches.length,
      }),
      pdf: { mediaType: "application/pdf", data: args.pdfBase64 },
      ctx: args.ctx,
      purpose: "parse_submittal",
      enableCitations: true,
      cacheDocument: true,
      documentTitle: args.filename,
      maxTokens: tokensNeeded,
    });
    validated.push(...validateResponses(result.data, batch));
  }

  return validated;
}

/**
 * Boundary validator. Drops responses that:
 *   - reference a checklist_item_id we didn't ask about
 *   - have a value shape that doesn't match the item's required_kind
 *   - claim found=true with no evidence_quote (no citation possible)
 *
 * Always returns one row per checklist item — emits a synthetic
 * `found: false` row for any item the model omitted, so downstream
 * consumers can rely on exhaustive coverage.
 *
 * Exported for unit tests.
 */
export function validateResponses(
  raw: unknown,
  checklist: ChecklistItemForGuide[],
): GuidedResponse[] {
  const byId = new Map<string, ChecklistItemForGuide>();
  for (const it of checklist) byId.set(it.id, it);

  const out = new Map<string, GuidedResponse>();

  if (raw && typeof raw === "object" && "responses" in raw) {
    const arr = (raw as { responses?: unknown[] }).responses;
    if (Array.isArray(arr)) {
      for (const r of arr) {
        if (!r || typeof r !== "object") continue;
        const row = r as Record<string, unknown>;
        const id = typeof row.checklist_item_id === "string" ? row.checklist_item_id : null;
        if (!id) continue;
        const item = byId.get(id);
        // Drop responses for items we didn't ask about (hallucinated id).
        if (!item) continue;

        const found = row.found === true;
        const confidence =
          typeof row.confidence === "number" &&
          row.confidence >= 0 &&
          row.confidence <= 1
            ? row.confidence
            : 0.5;

        if (!found) {
          out.set(id, {
            checklistItemId: id,
            found: false,
            value: null,
            evidenceQuote: null,
            pageNum: null,
            confidence,
          });
          continue;
        }

        const evidenceQuote =
          typeof row.evidence_quote === "string" && row.evidence_quote.trim().length > 0
            ? row.evidence_quote.trim()
            : null;
        // found=true requires an evidence_quote — without it we can't cite, so drop.
        if (!evidenceQuote) continue;

        const pageNum =
          typeof row.page === "number" && Number.isFinite(row.page) && row.page > 0
            ? Math.floor(row.page)
            : null;

        const validatedValue = validateValueShape(row.value, item.requiredKind);
        if (validatedValue === SHAPE_MISMATCH) continue;

        out.set(id, {
          checklistItemId: id,
          found: true,
          value: validatedValue,
          evidenceQuote,
          pageNum,
          confidence,
        });
      }
    }
  }

  // Fill in synthetic "not found" rows for any checklist item the
  // model omitted. Exhaustive coverage means downstream doesn't have
  // to special-case "did the model forget about item X."
  const responses: GuidedResponse[] = [];
  for (const item of checklist) {
    const existing = out.get(item.id);
    if (existing) {
      responses.push(existing);
    } else {
      responses.push({
        checklistItemId: item.id,
        found: false,
        value: null,
        evidenceQuote: null,
        pageNum: null,
        confidence: 0.3, // low — the model didn't even acknowledge the item
      });
    }
  }
  return responses;
}

// Exposed for unit tests of the batching logic.
export const _internal = { chunk, BATCH_SIZE };

const SHAPE_MISMATCH = Symbol("SHAPE_MISMATCH");

/**
 * Type-check the model's value against the required_kind. Returns the
 * value if it matches the expected shape, or SHAPE_MISMATCH to drop.
 */
function validateValueShape(
  value: unknown,
  requiredKind: ChecklistItemForGuide["requiredKind"],
): GuidedResponse["value"] | typeof SHAPE_MISMATCH {
  switch (requiredKind) {
    case "numeric":
      return typeof value === "number" && Number.isFinite(value) ? value : SHAPE_MISMATCH;
    case "enum":
      return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : SHAPE_MISMATCH;
    case "boolean":
      return typeof value === "boolean" ? value : SHAPE_MISMATCH;
    case "manufacturer_list":
      // Submittal answer is one manufacturer (the actual vendor used);
      // the spec's manufacturer_list is the acceptable set. Single string
      // here is the right shape.
      return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : SHAPE_MISMATCH;
    case "qualitative":
      return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : SHAPE_MISMATCH;
    default:
      return SHAPE_MISMATCH;
  }
}
