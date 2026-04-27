import "server-only";
import { classify, type LogCtx } from "@/lib/llm";

/**
 * Spec → checklist parser. Phase B of docs/DECISIONS.md U12.
 *
 * Takes a spec paragraph (text + CSI context) and returns 0+ structured
 * checklist items. Each item is a single requirement: an attribute key,
 * a typed required value, a comparator, and the verbatim spec quote.
 *
 * Why this is a separate parser from `classify.ts` (which assigns one
 * `requirementType` per paragraph): one paragraph routinely contains
 * multiple distinct requirements. Spec §2.2.B might say:
 *   "Short-circuit current rating shall be not less than 65,000 amperes
 *    RMS at 480Y/277V. Series-rated combinations are not acceptable."
 * That's two checklist items (aic_ka ≥ 65, series_rated = false), even
 * though `classify` correctly marks the paragraph as `requirementType =
 * 'aic'`. The checklist parser is the next layer of structure.
 *
 * The model returns strict JSON. Each item carries a confidence score so
 * downstream consumers can filter weak extractions.
 */

/**
 * Canonical attribute keys. Shared with the submittal extractor so the
 * compare page can join checklist items to submittal responses by
 * `attribute`. Add to this list when a new attribute appears in real
 * spec language; the model is also told it can emit other_<name> when
 * it sees something genuinely novel (lower confidence).
 */
export const CANONICAL_ATTRIBUTES = [
  // electrical ratings
  "aic_ka",
  "sccr_ka",
  "voltage_system_v",
  "phase",
  "wires",
  "ampacity_a",
  "main_type",
  "poles",
  "series_rated",
  // listings + standards
  "ul_listing",
  "approved_manufacturer",
  // construction
  "enclosure_nema",
  "bus_material",
  "bus_plating",
  "bus_rating_pct",
  "ground_bus",
  // installation
  "working_clearance_in",
  "mounting",
] as const;

export type CanonicalAttribute = (typeof CANONICAL_ATTRIBUTES)[number] | string;

export type RequiredKind =
  | "numeric"
  | "enum"
  | "boolean"
  | "manufacturer_list"
  | "qualitative";

export type Comparator = "≥" | "≤" | "=" | "⊇" | "in";

/**
 * Discriminated by `requiredKind` so consumers can switch with type
 * safety. The `comparator` field is independent — a numeric value
 * could compare with `≥` or `≤` depending on whether it's a minimum
 * or maximum.
 */
export type ChecklistItem =
  | {
      attribute: CanonicalAttribute;
      requiredKind: "numeric";
      comparator: "≥" | "≤" | "=";
      requiredValue: number;
      unit: string | null;
      rawQuote: string;
      confidence: number;
    }
  | {
      attribute: CanonicalAttribute;
      requiredKind: "enum";
      comparator: "=" | "in";
      /** Single canonical code (when comparator is `=`) or array of acceptable codes (when `in`). */
      requiredValue: string | string[];
      unit: null;
      rawQuote: string;
      confidence: number;
    }
  | {
      attribute: CanonicalAttribute;
      requiredKind: "boolean";
      comparator: "=";
      requiredValue: boolean;
      unit: null;
      rawQuote: string;
      confidence: number;
    }
  | {
      attribute: CanonicalAttribute;
      requiredKind: "manufacturer_list";
      comparator: "in";
      requiredValue: string[];
      unit: null;
      rawQuote: string;
      confidence: number;
    }
  | {
      attribute: CanonicalAttribute;
      requiredKind: "qualitative";
      comparator: "⊇";
      /** Raw spec text — comparison delegates to LLM equivalence judge later. */
      requiredValue: string;
      unit: null;
      rawQuote: string;
      confidence: number;
    };

const SYSTEM_PROMPT = `You are extracting structured install-readiness requirements from one paragraph of a Division-26 electrical spec.

A "requirement" is anything an electrical PM would need to verify on a submittal: a numeric rating (AIC, SCCR, ampacity), an enclosure code, a listing standard, a material specification, a manufacturer constraint, an installation rule.

ONE PARAGRAPH OFTEN CONTAINS MULTIPLE REQUIREMENTS. Extract every one as a separate item.

OUTPUT FORMAT — JSON ONLY, an array of items.

Each item is one of these shapes:

1. NUMERIC requirements (AIC kA, SCCR kA, ampacity A, voltage V, etc.):
   {
     "attribute": "<canonical_key>",
     "required_kind": "numeric",
     "comparator": "≥" | "≤" | "=",
     "required_value": <number>,
     "unit": "<unit string, e.g. 'kA', 'A', 'V', 'in'>",
     "raw_quote": "<verbatim text from the paragraph supporting this>",
     "confidence": <0..1>
   }

2. ENUM requirements (NEMA enclosure, voltage system code, listing standard):
   {
     "attribute": "<canonical_key>",
     "required_kind": "enum",
     "comparator": "=" | "in",
     "required_value": "<single code>" OR ["<code1>", "<code2>"],
     "unit": null,
     "raw_quote": "...",
     "confidence": <0..1>
   }
   Use comparator "in" + array when the spec lists alternatives ("NEMA 1 indoor or NEMA 3R outdoor"). Use "=" + single string when the spec mandates one specific code.

3. BOOLEAN requirements (series-rated allowed/prohibited, isolated ground required):
   {
     "attribute": "<canonical_key>",
     "required_kind": "boolean",
     "comparator": "=",
     "required_value": true | false,
     "unit": null,
     "raw_quote": "...",
     "confidence": <0..1>
   }
   Example: "Series-rated combinations are not acceptable" → {"attribute": "series_rated", "required_kind": "boolean", "comparator": "=", "required_value": false, ...}

4. MANUFACTURER LIST (approved manufacturers):
   {
     "attribute": "approved_manufacturer",
     "required_kind": "manufacturer_list",
     "comparator": "in",
     "required_value": ["Square D", "Eaton", "Siemens"],
     "unit": null,
     "raw_quote": "...",
     "confidence": <0..1>
   }

5. QUALITATIVE requirements (free-text installation rules, narrative requirements):
   {
     "attribute": "<canonical_key>",
     "required_kind": "qualitative",
     "comparator": "⊇",
     "required_value": "<the spec text itself, lightly normalized>",
     "unit": null,
     "raw_quote": "...",
     "confidence": <0..1>
   }
   Use this only when the requirement is prose that doesn't fit numeric/enum/boolean shapes (e.g. "Provide adequate working clearance per NEC 110.26" without specific numbers).

CANONICAL ATTRIBUTE KEYS (use these when applicable):
  Electrical ratings: aic_ka, sccr_ka, voltage_system_v, phase, wires, ampacity_a, main_type, poles, series_rated
  Listings + standards: ul_listing, approved_manufacturer
  Construction: enclosure_nema, bus_material, bus_plating, bus_rating_pct, ground_bus
  Installation: working_clearance_in, mounting

When a requirement names something not in this list, use a snake_case key prefixed "other_" (e.g. "other_ground_bus_isolation") with confidence ≤ 0.7.

CRITICAL:
- raw_quote MUST be verbatim text from the paragraph (the basis for evidence binding downstream).
- raw_quote should be the SHORTEST verbatim span that supports the requirement — usually 5–25 words. If the supporting span is longer, just quote the most relevant clause. NEVER quote the entire paragraph.
- Never invent numeric values — if the paragraph doesn't state a number, don't use the "numeric" shape.
- If the paragraph contains zero install-readiness requirements (e.g. it's a definitions section, a reference list, or pure boilerplate), return [].
- Return the JSON array only, no prose outside it.`;

const USER_TEMPLATE = (input: ChecklistInput) =>
  `CSI: ${input.csiSection}
PATH: ${input.csiPath}

PARAGRAPH:
${input.content.trim()}

Extract structured requirements as JSON array.`;

export type ChecklistInput = {
  csiSection: string;
  csiPath: string;
  content: string;
};

/**
 * Extract checklist items from one paragraph. Returns [] when the
 * paragraph contains no install-readiness requirements (boilerplate,
 * references, definitions). Filters out malformed items at the boundary
 * — never trust the model's shape past this layer.
 *
 * Exported for tests; the durable runner wraps this with caching.
 */
export async function parseChecklistFromParagraph(args: {
  input: ChecklistInput;
  ctx: LogCtx;
}): Promise<ChecklistItem[]> {
  const raw = await classify<unknown>({
    system: SYSTEM_PROMPT,
    user: USER_TEMPLATE(args.input),
    ctx: args.ctx,
    purpose: "parse_spec",
    // 8192 because some panelboard paragraphs encode 6+ distinct
    // requirements. Even with the prompt constraint that raw_quote
    // should be 5-25 words, dense paragraphs (working clearance + bus
    // bracing + AIC + listing + manufacturer list in one) overflow
    // 4096. The extractJson defensive-fence-strip catches partial
    // truncation but the right answer is to give the model enough
    // budget to close cleanly.
    maxTokens: 8192,
    model: "claude-sonnet-4-6",
  });
  return validateItems(raw);
}

/**
 * Boundary validator: drops any item that fails shape checks. Keeps
 * the rest of the array — partial validity is better than throwing
 * out a whole paragraph because one item was malformed.
 *
 * Exported for unit tests.
 */
export function validateItems(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const item = it as Record<string, unknown>;
    const attribute = typeof item.attribute === "string" ? item.attribute : null;
    const requiredKind = item.required_kind as RequiredKind | undefined;
    const comparator = item.comparator as Comparator | undefined;
    const rawQuote = typeof item.raw_quote === "string" ? item.raw_quote : "";
    const confidence =
      typeof item.confidence === "number" &&
      item.confidence >= 0 &&
      item.confidence <= 1
        ? item.confidence
        : 0.5;
    const unit =
      typeof item.unit === "string" && item.unit.trim().length > 0
        ? item.unit.trim()
        : null;
    if (!attribute || !requiredKind || !comparator || !rawQuote.trim()) continue;

    const v = item.required_value;
    switch (requiredKind) {
      case "numeric":
        if (
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          (comparator !== "≥" && comparator !== "≤" && comparator !== "=")
        )
          continue;
        out.push({
          attribute,
          requiredKind: "numeric",
          comparator,
          requiredValue: v,
          unit,
          rawQuote,
          confidence,
        });
        break;
      case "enum":
        if (comparator !== "=" && comparator !== "in") continue;
        if (comparator === "=" && typeof v !== "string") continue;
        if (
          comparator === "in" &&
          (!Array.isArray(v) || !v.every((x) => typeof x === "string"))
        )
          continue;
        out.push({
          attribute,
          requiredKind: "enum",
          comparator,
          requiredValue: v as string | string[],
          unit: null,
          rawQuote,
          confidence,
        });
        break;
      case "boolean":
        if (typeof v !== "boolean" || comparator !== "=") continue;
        out.push({
          attribute,
          requiredKind: "boolean",
          comparator: "=",
          requiredValue: v,
          unit: null,
          rawQuote,
          confidence,
        });
        break;
      case "manufacturer_list":
        if (
          !Array.isArray(v) ||
          !v.every((x) => typeof x === "string") ||
          comparator !== "in"
        )
          continue;
        out.push({
          attribute: "approved_manufacturer",
          requiredKind: "manufacturer_list",
          comparator: "in",
          requiredValue: v,
          unit: null,
          rawQuote,
          confidence,
        });
        break;
      case "qualitative":
        if (typeof v !== "string" || comparator !== "⊇") continue;
        out.push({
          attribute,
          requiredKind: "qualitative",
          comparator: "⊇",
          requiredValue: v,
          unit: null,
          rawQuote,
          confidence,
        });
        break;
      default:
        continue;
    }
  }
  return out;
}
