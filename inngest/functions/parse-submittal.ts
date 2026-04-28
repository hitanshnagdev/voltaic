import "server-only";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { memoize } from "@/lib/cache/content_hash";
import { db } from "@/lib/db/client";
import { documents, equipment, submittalFields } from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import { documentExtract, type DocumentPageCitation } from "@/lib/llm";
import {
  type CitableField,
  type DroppedField,
  type FallbackInfo,
  type VerifiedField,
  verifyField,
} from "@/lib/rag/citation_guard";
import {
  normalizeAicKa,
  normalizeEquipmentTag,
  normalizeNemaRating,
  normalizePhase,
  normalizeVoltageSystemV,
  normalizeWires,
} from "@/lib/rag/normalize";
import { getObjectBuffer } from "@/lib/r2/client";

/**
 * Stage 2b submittal parser — durable function.
 *
 * Triggered by `document/submittal-classified` (emitted by `ingest-document`
 * after classification). For each submittal:
 *
 *   1. Pull the first N raster pages from R2 (cut sheet data is overwhelmingly
 *      on the leading pages — accessory tables and mounting drawings rarely
 *      add fields that rules consume).
 *   2. Vision-extract structured fields with Sonnet (Textract deferred per
 *      docs/DECISIONS.md U1).
 *   3. Normalize values: tag → tag_normalized, AIC → kA, NEMA → "3R" form.
 *   4. Write one submittal_fields row.
 *   5. Upsert the equipment row by (project_id, tag_normalized), accumulating
 *      tag_aliases.
 *   6. Fire `equipment/aic-ready` when an AIC value is present so the AIC
 *      rule's runner can pick up.
 *
 * Vision output is content-hash cached, so re-uploading identical bytes
 * across projects costs zero tokens after the first run.
 */

type SubmittalClassifiedEvent = {
  documentId: string;
  workspaceId: string;
  projectId: string;
};

/**
 * Tag rolled into the vision cache key so changing the input mode
 * (raster images → PDF document → ...) auto-invalidates prior results.
 * Bump when the extraction strategy changes in a way that affects model
 * output. Strategy log:
 *   v3-pdf-direct        — PDF as document block (vs prior raster pages)
 *   v4-typed+citations   — expanded typed numerics (sccr, voltage_system,
 *                          phase, wires, series_rated, listings, main_type)
 *                          and citations API enabled on the document block
 *   v5-citation-guard    — every typed field carries an explicit
 *                          evidence_quote slot; a verifier drops fields
 *                          whose quote has no token-overlap with any
 *                          API-returned cited_text (DECISIONS.md U13)
 */
const VISION_INPUT_MODE = "v5-citation-guard";

const VISION_SYSTEM = `You are extracting structured electrical equipment data from a vendor submittal package (cut sheet, datasheet, or product data sheet).

The submittal is for ONE piece of equipment that the contractor is proposing to install. Your job: identify the equipment and extract its key electrical ratings as the contractor IS SUBMITTING them — not as the spec required them.

DISAMBIGUATION RULES (this is the hard part — read carefully):

1. Deviation tables. Many submittals contain a comparison table with columns titled some variation of:
     - "Specified" / "Required" / "Per Spec" / "Spec" — what the spec asked for
     - "Submitted" / "Proposed" / "Provided" / "Furnished" — what the contractor is delivering
   Always extract numeric fields from the SUBMITTED column. The Specified column reflects the spec's requirement (we get that elsewhere); the Submitted column reflects what is actually being supplied. These are often the same, but sometimes they differ — and that difference is exactly what downstream rules need to detect.
   If you see "Conforms? Yes/No" columns next to the values, those are decision columns — ignore them, just extract the Submitted value.

2. AIC vs SCCR. These are different ratings, often shown in the same table:
     - AIC (Available Interrupting Current / Interrupting Rating) is the rating of OVERCURRENT DEVICES — circuit breakers, fuses. It governs how much fault current they can safely interrupt.
     - SCCR (Short-Circuit Current Rating) is the rating of the BUS ASSEMBLY — what the panelboard or switchboard structure can withstand.
     - "Bus bracing" ratings are SCCR, NOT AIC.
   Extract aic_ka from breaker/overcurrent device interrupting ratings. Extract sccr_ka from bus / panel-assembly withstand ratings. If the document only shows one number labeled both ways (rare), it's typically the SCCR; leave aic_ka null.

3. Multi-voltage tables. Some breakers are rated at different AICs at different system voltages (e.g., 100 kA at 240V, 65 kA at 480V). Extract the AIC at the equipment's primary system voltage — usually labeled "Nominal System Voltage", "System Voltage", or stated on the cover page. If the equipment is wye-connected (e.g. "480Y/277V"), use the line-to-line voltage (480V).

4. Multi-equipment cut sheets. If the document covers multiple discrete equipment with different tags, focus on the equipment whose tag is stamped on the cover page or in the title. The first/lead equipment is the one to extract; subsequent submittals will pick up the rest.

5. Approval stamp. Look for a review stamp (often on the cover page) with checkboxes like "Approved", "Approved as Noted", "Revise & Resubmit", "Rejected". Extract whichever is checked. If multiple are checked or it's ambiguous, prefer the most restrictive (Revise > Approved as Noted > Approved). If no stamp is visible, use null.

6. Bus bracing vs SCCR. On switchboards and panelboards, "bus bracing" is the same physical rating as SCCR — the withstand current of the bus assembly. If a submittal labels it "bus bracing", extract it as sccr_ka. (Don't double-extract — pick one source, prefer SCCR if both terms appear.)

7. Series-rated combinations. Some breakers achieve their AIC rating only when paired with a specific upstream device (a "series-rated combination"). The submittal will say so explicitly: "series-rated with upstream X", "series combination per UL", or a footnote on the AIC value. Many specs prohibit series-rated combos — set series_rated = true when the SUBMITTED AIC depends on series rating, false when the device is fully rated standalone, null when unclear.

8. Main type. "MLO" = Main Lugs Only (no main breaker, just lugs). "MCB" = Main Circuit Breaker. "MCCB" = Molded Case Circuit Breaker. Some submittals say "main switch" or "main fusible" — extract verbatim if not one of the standard codes.

9. Voltage system normalization. Extract the raw voltage string (e.g. "480Y/277V", "208Y/120V") AND the normalized line-to-line system voltage as an integer ("480Y/277V" → 480, "208Y/120V" → 208, "240V" → 240). For wye-connected systems use the higher number; for delta or single-voltage use the bare number.

10. EVIDENCE QUOTES — every field that is not null MUST include an "evidence_quote": the verbatim text from the document that supports the value. This is non-negotiable. Use the ACTUAL words you read on the page; do not paraphrase, do not summarize. Include enough context that the quote is identifiable (numbers + their units + 1-3 surrounding words is usually right). The evidence_quote is automatically cross-checked against the document — any field whose quote does not appear in the document will be silently dropped from the output. So: if you cannot quote it, return null. Do not invent supporting text.

OUTPUT FORMAT — JSON ONLY, no prose outside the JSON.

Each typed field is either null OR an object {value, evidence_quote}. Example:
  "aic_ka": null
  "aic_ka": { "value": 65, "evidence_quote": "AIC: 65 kAIC at 480Y/277V" }

{
  "equipment_tag":   { "value": string, "evidence_quote": string } | null,   // Project tag stamped on the cut sheet (e.g. "MDP-A", "PP-1A"). NOT the catalog/model number.
  "vendor":          { "value": string, "evidence_quote": string } | null,   // Manufacturer (e.g. "Square D", "Eaton", "Siemens", "ABB", "Schneider Electric").
  "model_num":       { "value": string, "evidence_quote": string } | null,   // Catalog number (e.g. "NQOD442L225CU", "HCP-1600-3R-65A-AL").
  "fields": {
    "aic_ka":          { "value": number,   "evidence_quote": string } | null,   // SUBMITTED breaker AIC at primary voltage, in kA (so 65, NOT 65000).
    "sccr_ka":         { "value": number,   "evidence_quote": string } | null,   // SUBMITTED bus assembly SCCR (or "bus bracing"), in kA.
    "series_rated":    { "value": boolean,  "evidence_quote": string } | null,   // True when SUBMITTED AIC depends on a series-rated combination. False if fully rated standalone. Null if not stated.
    "voltage":         { "value": string,   "evidence_quote": string } | null,   // Raw voltage label, e.g. "208Y/120V", "480Y/277V", "240V".
    "voltage_system_v":{ "value": number,   "evidence_quote": string } | null,   // Normalized line-to-line system voltage: 208 | 240 | 277 | 480 | 600.
    "phase":           { "value": number,   "evidence_quote": string } | null,   // 1 or 3.
    "wires":           { "value": number,   "evidence_quote": string } | null,   // 2, 3, or 4.
    "ampacity_a":      { "value": number,   "evidence_quote": string } | null,   // Main / frame ampacity, in amperes.
    "main_type":       { "value": string,   "evidence_quote": string } | null,   // "MLO" | "MCB" | "MCCB" | other verbatim if non-standard.
    "poles":           { "value": number,   "evidence_quote": string } | null,   // 1, 2, 3, or 4.
    "enclosure_nema":  { "value": string,   "evidence_quote": string } | null,   // NEMA enclosure code: "1", "3R", "4", "4X", "12".
    "listings":        { "value": string[], "evidence_quote": string } | null    // Listing standards cited, e.g. ["UL 891"], ["UL 67", "UL 891"]. Quote one citation; covers the array.
  },
  "submittal_status":  { "value": string,   "evidence_quote": string } | null,   // From approval stamp: "approved" | "approved_as_noted" | "revise_resubmit" | "rejected".
  "primary_page": number,                                                        // 1-indexed page where the strongest field data is visible. NOT citation-checked (it's an integer, not a claim).
  "extraction_notes": string                                                     // 1-3 sentences explaining where each value came from. NOT citation-checked.
}

CRITICAL: never invent values that are not visually present. Use null when uncertain. Better to return null than to guess. The evidence_quote is the proof — if you cannot quote, you cannot extract.

Return JSON only, no prose outside the JSON.`;

/**
 * Cache key for vision extraction. Includes hashes of BOTH the prompt
 * and the renderer version so any change to either auto-invalidates
 * prior cache entries.
 *
 * Why both: the cache memoizes vision-output keyed on PDF bytes. A
 * change to the prompt OR the renderer can change what the model
 * returns from those bytes. If either is missing from the key, a
 * stale answer can survive the change.
 *
 * Concrete failure this prevents: PRs #20–#26 fixed pdfjs rendering
 * (fonts, Path2D, path resolution) so text no longer renders as
 * black boxes. But the cache key only included VISION_SYSTEM (which
 * didn't change between those PRs), so retries against the same PDF
 * bytes returned the cached "heavily redacted/obscured" answer from
 * the broken-renderer era. Including the renderer version ensures
 * any future raster behavior change (DPI, font set, page selection)
 * triggers a fresh vision call.
 */
const VISION_CACHE_PURPOSE: `parse_submittal_field/v:${string}` = `parse_submittal_field/v:${crypto
  .createHash("sha256")
  .update(`${VISION_SYSTEM}\n--mode:${VISION_INPUT_MODE}`)
  .digest("hex")
  .slice(0, 12)}`;

/**
 * Per-DECISIONS.md U13 the model returns each typed field as either
 * `null` or `{value, evidence_quote}`. The `evidence_quote` is verified
 * against citations downstream; unsupported quotes get the field
 * dropped before persistence.
 */
type VisionPayload = {
  equipment_tag: CitableField<string>;
  vendor: CitableField<string>;
  model_num: CitableField<string>;
  fields: {
    aic_ka: CitableField<number>;
    sccr_ka: CitableField<number>;
    series_rated: CitableField<boolean>;
    voltage: CitableField<string>;
    voltage_system_v: CitableField<number>;
    phase: CitableField<number>;
    wires: CitableField<number>;
    ampacity_a: CitableField<number>;
    main_type: CitableField<string>;
    poles: CitableField<number>;
    enclosure_nema: CitableField<string>;
    listings: CitableField<string[]>;
  };
  submittal_status: CitableField<string>;
  primary_page: number;
  extraction_notes?: string | null;
};

/**
 * One per-field evidence record persisted alongside the value bag.
 * Lets the compare page render "spec required X · cited at page N" by
 * reading `_evidence[fieldName]` without re-running vision.
 */
type FieldEvidence = {
  evidence_quote: string;
  page_num: number;
};

type SubmittalFieldValue =
  | number
  | string
  | boolean
  | string[]
  | DocumentPageCitation[]
  | Record<string, FieldEvidence>;

type NormalizedSubmittal = {
  rawTag: string | null;
  tagNormalized: string | null;
  vendor: string | null;
  modelNum: string | null;
  fields: Record<string, SubmittalFieldValue>;
  submittalStatus: string | null;
  pageNum: number;
  /**
   * Fields the citation guard rejected. NOT persisted — caller can log
   * for debugging, but the dropped values never reach the DB. Treating
   * a rejected field as "absent" is exactly the desired behavior for
   * downstream rules (an unverifiable AIC value is the same as no AIC
   * value — the rule produces an `uncertain` finding either way).
   */
  dropped: DroppedField[];
  /**
   * Fields the guard accepted via the empty-citations fallback path
   * (Anthropic citations API returned zero spans — common for
   * image-rendered or complex-layout PDFs). These ARE persisted, but
   * tagged so the runner can log how often the fallback fires. A
   * sudden spike across many submittals is a regression signal.
   */
  fallbacks: FallbackInfo[];
};

/**
 * Pure transform from VisionPayload → row-ready normalized values.
 * Exported for unit tests; doesn't touch the DB.
 *
 * Citation guard pipeline (DECISIONS.md U13):
 *   1. Each typed field comes in as `{value, evidence_quote}` or null.
 *   2. `verifyField` checks the quote has token-overlap with at least
 *      one cited_text in the citations array.
 *   3. Verified fields flow through the existing value normalizers
 *      (AIC kA scaling, NEMA canonicalization, voltage system code, ...).
 *   4. Each verified field's page number — sourced from the citation
 *      that backed it — lands in `_evidence[fieldName]` so the compare
 *      page can render "cited on page N" without re-running vision.
 *   5. Dropped fields are returned alongside the result for logging;
 *      they never enter the persisted fields bag.
 */
export function normalizeSubmittalPayload(
  payload: VisionPayload,
  citations: DocumentPageCitation[] = [],
): NormalizedSubmittal {
  const dropped: DroppedField[] = [];
  const fallbacks: FallbackInfo[] = [];
  const evidence: Record<string, FieldEvidence> = {};

  // For the empty-citations fallback path: use the model's own
  // primary_page as the fallback page number (better than 1).
  const fallbackPage = payload.primary_page > 0 ? payload.primary_page : 1;

  /**
   * Verify a CitableField, log any drop or fallback, and capture the
   * evidence record on success. Returns the verified field or null.
   */
  function guard<T>(name: string, raw: unknown): VerifiedField<T> | null {
    const { verified, dropped: d, fallback: fb } = verifyField<T>(
      name,
      raw,
      citations,
      fallbackPage,
    );
    if (d) dropped.push(d);
    if (fb) fallbacks.push(fb);
    if (verified) {
      evidence[name] = {
        evidence_quote: verified.evidenceQuote,
        page_num: verified.pageNum,
      };
    }
    return verified;
  }

  const verifiedTag = guard<string>("equipment_tag", payload.equipment_tag);
  const verifiedVendor = guard<string>("vendor", payload.vendor);
  const verifiedModel = guard<string>("model_num", payload.model_num);
  const verifiedAic = guard<number>("aic_ka", payload.fields.aic_ka);
  const verifiedSccr = guard<number>("sccr_ka", payload.fields.sccr_ka);
  const verifiedSeries = guard<boolean>("series_rated", payload.fields.series_rated);
  const verifiedVoltage = guard<string>("voltage", payload.fields.voltage);
  const verifiedVoltageSystem = guard<number>(
    "voltage_system_v",
    payload.fields.voltage_system_v,
  );
  const verifiedPhase = guard<number>("phase", payload.fields.phase);
  const verifiedWires = guard<number>("wires", payload.fields.wires);
  const verifiedAmpacity = guard<number>("ampacity_a", payload.fields.ampacity_a);
  const verifiedMainType = guard<string>("main_type", payload.fields.main_type);
  const verifiedPoles = guard<number>("poles", payload.fields.poles);
  const verifiedEnclosure = guard<string>("enclosure_nema", payload.fields.enclosure_nema);
  const verifiedListings = guard<string[]>("listings", payload.fields.listings);
  const verifiedStatus = guard<string>("submittal_status", payload.submittal_status);

  const rawTag = verifiedTag?.value ?? null;
  const tagNormalized = normalizeEquipmentTag(rawTag);

  // Value normalizers — verified-field values flow through the same
  // post-extraction normalization (kA scaling, NEMA canonicalization)
  // so downstream rules see consistent shapes.
  const aicNormalized = normalizeAicKa(
    verifiedAic != null ? String(verifiedAic.value) : null,
  );
  const sccrNormalized = normalizeAicKa(
    verifiedSccr != null ? String(verifiedSccr.value) : null,
  );
  const enclosureNormalized = normalizeNemaRating(verifiedEnclosure?.value ?? null);
  const voltageSystemNormalized = normalizeVoltageSystemV(
    verifiedVoltageSystem?.value ?? verifiedVoltage?.value ?? null,
  );
  const phaseNormalized = normalizePhase(verifiedPhase?.value ?? null);
  const wiresNormalized = normalizeWires(verifiedWires?.value ?? null);

  const fields: Record<string, SubmittalFieldValue> = {};
  if (aicNormalized != null) fields.aic_ka = aicNormalized;
  if (sccrNormalized != null) fields.sccr_ka = sccrNormalized;
  if (verifiedSeries != null && typeof verifiedSeries.value === "boolean") {
    fields.series_rated = verifiedSeries.value;
  }
  if (verifiedVoltage?.value) fields.voltage = verifiedVoltage.value;
  if (voltageSystemNormalized != null) {
    fields.voltage_system_v = voltageSystemNormalized;
  }
  if (phaseNormalized != null) fields.phase = phaseNormalized;
  if (wiresNormalized != null) fields.wires = wiresNormalized;
  if (
    verifiedAmpacity != null &&
    typeof verifiedAmpacity.value === "number" &&
    Number.isFinite(verifiedAmpacity.value)
  ) {
    fields.ampacity_a = verifiedAmpacity.value;
  }
  if (
    verifiedMainType != null &&
    typeof verifiedMainType.value === "string" &&
    verifiedMainType.value.trim().length > 0
  ) {
    fields.main_type = verifiedMainType.value.trim().toUpperCase();
  }
  if (
    verifiedPoles != null &&
    typeof verifiedPoles.value === "number" &&
    Number.isFinite(verifiedPoles.value)
  ) {
    fields.poles = verifiedPoles.value;
  }
  if (enclosureNormalized) fields.enclosure_nema = enclosureNormalized;
  // Listings: filter to non-empty trimmed strings; drop entirely when empty.
  if (verifiedListings != null && Array.isArray(verifiedListings.value)) {
    const cleaned = verifiedListings.value
      .filter((s): s is string => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (cleaned.length > 0) fields.listings = cleaned;
  }
  // extraction_notes is NOT citation-guarded — it's the model's own
  // reasoning, not a quoted value. Pass through verbatim when present.
  if (
    typeof payload.extraction_notes === "string" &&
    payload.extraction_notes.trim().length > 0
  ) {
    fields.extraction_notes = payload.extraction_notes.trim();
  }
  // Per-field evidence map: each verified field's evidence_quote +
  // citation-derived page number. Compare page reads this to render
  // "cited on page N" per row without re-running vision.
  if (Object.keys(evidence).length > 0) {
    fields._evidence = evidence;
  }
  // Full citation array stays available for audit + future drilldown.
  if (citations.length > 0) {
    fields._citations = citations;
  }

  // Page number for the row: prefer the AIC field's citation page since
  // AIC is the most-cited compliance field; fall back to the
  // model-reported primary_page (already computed above).
  const aicPage = evidence.aic_ka?.page_num;
  const pageNum = aicPage != null && aicPage > 0 ? aicPage : fallbackPage;

  return {
    rawTag,
    tagNormalized,
    vendor: verifiedVendor?.value ?? null,
    modelNum: verifiedModel?.value ?? null,
    fields,
    submittalStatus: verifiedStatus?.value ?? null,
    pageNum,
    dropped,
    fallbacks,
  };
}

/**
 * Pick a default category for an equipment row given the fields we
 * extracted. Coarse heuristic for v0 — drawings parser will refine.
 */
function inferCategory(fields: Record<string, unknown>): string {
  // Has AIC + ampacity + poles → likely a panel.
  if (fields.aic_ka != null && fields.poles != null) return "panel";
  // Has SCCR but no AIC → switchboard / switchgear.
  if (fields.sccr_ka != null && fields.aic_ka == null) return "switchgear";
  return "other";
}

export const parseSubmittalDocument = inngest.createFunction(
  {
    id: "parse-submittal-document",
    name: "Parse submittal document",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: "document/submittal-classified" }],
  },
  async ({ event, step }) => {
    const { documentId, workspaceId, projectId } =
      event.data as SubmittalClassifiedEvent;

    const doc = await step.run("load-doc", async () => {
      const rows = await db
        .select({
          id: documents.id,
          filename: documents.filename,
          contentSha256: documents.contentSha256,
          docType: documents.docType,
          submittalStatus: documents.submittalStatus,
          r2Key: documents.r2Key,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      const row = rows[0];
      if (!row) throw new Error(`document not found: ${documentId}`);
      if (row.docType !== "submittal") return null;
      return row;
    });

    if (!doc) return { documentId, skipped: "not_a_submittal" };

    // Pull the original PDF bytes — sent directly to Claude as a document
    // input (see lib/llm.ts documentExtract). Bypasses node-canvas/pdfjs
    // entirely. We tried several layers of server-side rasterization with
    // bundled fonts and a custom BinaryDataFactory; node-canvas + cairo
    // can't render PDF text without fontconfig + system fonts, and Vercel
    // serverless has neither. Sonnet's PDF input handles this in one
    // round-trip with guaranteed-correct rendering.
    const pdfBuffer = await step.run("load-pdf-bytes", async () => {
      const buf = await getObjectBuffer(doc.r2Key);
      return buf.toString("base64");
    });

    const extracted = await step.run("vision-extract", async () => {
      return memoize<{ payload: VisionPayload; citations: DocumentPageCitation[] }>(
        VISION_CACHE_PURPOSE,
        doc.contentSha256,
        async () => {
          const result = await documentExtract<VisionPayload>({
            system: VISION_SYSTEM,
            prompt: `Filename: ${doc.filename}\n\nExtract the structured fields and return JSON.`,
            pdf: { mediaType: "application/pdf", data: pdfBuffer },
            ctx: { workspaceId, projectId },
            purpose: "parse_submittal",
            enableCitations: true,
            documentTitle: doc.filename,
          });
          return {
            payload: { payload: result.data, citations: result.citations },
          };
        },
      );
    });

    const normalized = normalizeSubmittalPayload(
      extracted.payload,
      extracted.citations,
    );

    if (!normalized.tagNormalized) {
      // Without an equipment tag we can't link the submittal to anything.
      // Still persist the field row — a human can fix the tag later — but
      // skip equipment upsert and don't fire AIC-ready.
      await step.run("save-orphan-fields", async () => {
        await withWorkspace(workspaceId, async (tx) => {
          await tx.insert(submittalFields).values({
            workspaceId,
            documentId,
            equipmentTag: normalized.rawTag,
            tagNormalized: null,
            vendor: normalized.vendor,
            modelNum: normalized.modelNum,
            fields: normalized.fields,
            pageNum: normalized.pageNum,
            contentSha256: crypto
              .createHash("sha256")
              .update(`${documentId}|orphan|${JSON.stringify(normalized.fields)}`)
              .digest("hex"),
          });
        });
      });
      return { documentId, skipped: "no_tag", saved: "orphan" };
    }

    const tagNormalized = normalized.tagNormalized;

    const equipmentId = await step.run("upsert-equipment", async () => {
      return withWorkspace(workspaceId, async (tx) => {
        const category = inferCategory(normalized.fields);
        const inserted = await tx
          .insert(equipment)
          .values({
            workspaceId,
            projectId,
            tag: normalized.rawTag,
            tagNormalized,
            category,
            tagAliases: normalized.rawTag ? [normalized.rawTag] : [],
            evidence: [],
          })
          .onConflictDoUpdate({
            target: [equipment.projectId, equipment.tagNormalized],
            set: {
              // Preserve the prior tag if already set; only fill from new
              // submittal when the existing row has none.
              tag: sql`coalesce(${equipment.tag}, excluded.tag)`,
              // Accumulate aliases — Postgres array_distinct preserves
              // existing entries while appending new ones.
              tagAliases: sql`(
                select array(
                  select distinct unnest(
                    ${equipment.tagAliases} || excluded.tag_aliases
                  )
                )
              )`,
            },
          })
          .returning({ id: equipment.id });
        return inserted[0].id;
      });
    });

    await step.run("save-fields", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        // Idempotent on re-fire: replace this document's submittal_fields
        // for this equipment.
        await tx
          .delete(submittalFields)
          .where(
            and(
              eq(submittalFields.documentId, documentId),
              eq(submittalFields.tagNormalized, tagNormalized),
            ),
          );
        await tx.insert(submittalFields).values({
          workspaceId,
          documentId,
          equipmentTag: normalized.rawTag,
          tagNormalized,
          vendor: normalized.vendor,
          modelNum: normalized.modelNum,
          fields: normalized.fields,
          pageNum: normalized.pageNum,
          contentSha256: crypto
            .createHash("sha256")
            .update(
              `${documentId}|${tagNormalized}|${JSON.stringify(normalized.fields)}`,
            )
            .digest("hex"),
        });
      });
    });

    if (normalized.submittalStatus) {
      await step.run("save-submittal-status", async () => {
        await withWorkspace(workspaceId, async (tx) => {
          await tx
            .update(documents)
            .set({ submittalStatus: normalized.submittalStatus })
            .where(eq(documents.id, documentId));
        });
      });
    }

    // Per docs/DECISIONS.md U2: per-rule readiness events, not a generic
    // triple-ready. Each rule subscribes to its own readiness event so the
    // rule engine never assumes "spec + submittal = sufficient evidence".
    if (normalized.fields.aic_ka != null) {
      await step.sendEvent("emit-aic-ready", {
        name: "equipment/aic-ready",
        data: { equipmentId, workspaceId, projectId, documentId },
      });
    }
    if (normalized.fields.sccr_ka != null) {
      await step.sendEvent("emit-sccr-ready", {
        name: "equipment/sccr-ready",
        data: { equipmentId, workspaceId, projectId, documentId },
      });
    }
    if (normalized.fields.enclosure_nema != null) {
      await step.sendEvent("emit-enclosure-ready", {
        name: "equipment/enclosure-ready",
        data: { equipmentId, workspaceId, projectId, documentId },
      });
    }

    return {
      documentId,
      equipmentId,
      tag: normalized.rawTag,
      tagNormalized,
      fieldsExtracted: Object.keys(normalized.fields).length,
      hasAic: normalized.fields.aic_ka != null,
      // Surface citation-guard drops in the run summary so debugging a
      // missing field in /today or compare doesn't require re-running
      // vision — the Inngest run logs show what got rejected and why.
      droppedFieldNames: normalized.dropped.map((d) => d.fieldName),
      droppedCount: normalized.dropped.length,
      // Empty-citations fallback fired for these fields — model gave a
      // quote but the API returned no spans to verify against. Watch
      // for spikes; per-doc fallback rate of 100% is normal for some
      // PDF render flavors and still gives useful structured data.
      fallbackFieldNames: normalized.fallbacks.map((f) => f.fieldName),
      fallbackCount: normalized.fallbacks.length,
    };
  },
);
