import "server-only";
import crypto from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { memoize } from "@/lib/cache/content_hash";
import { db } from "@/lib/db/client";
import {
  documentPages,
  documents,
  equipment,
  submittalFields,
} from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import { visionExtract } from "@/lib/llm";
import {
  normalizeAicKa,
  normalizeEquipmentTag,
  normalizeNemaRating,
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

/** How many leading raster pages to send to vision. */
const MAX_PAGES_TO_VISION = 4;

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

OUTPUT FORMAT — JSON ONLY, no prose outside the JSON:

{
  "equipment_tag": string | null,         // Project tag stamped on the cut sheet (e.g. "MDP-A", "PP-1A"). NOT the catalog/model number.
  "vendor": string | null,                // Manufacturer (e.g. "Square D", "Eaton", "Siemens", "ABB", "Schneider Electric").
  "model_num": string | null,             // Catalog number (e.g. "NQOD442L225CU", "HCP-1600-3R-65A-AL").
  "fields": {
    "aic_ka": number | null,              // SUBMITTED breaker AIC at primary voltage, in kA (so 65, NOT 65000).
    "sccr_ka": number | null,             // SUBMITTED bus assembly SCCR, in kA.
    "voltage": string | null,             // e.g. "208Y/120V", "480Y/277V", "240V".
    "ampacity_a": number | null,          // Main / frame ampacity, in amperes.
    "poles": number | null,               // 1, 2, 3, or 4.
    "enclosure_nema": string | null       // NEMA enclosure code: "1", "3R", "4", "4X", "12".
  },
  "submittal_status": string | null,      // From approval stamp: "approved" | "approved_as_noted" | "revise_resubmit" | "rejected" | null.
  "primary_page": number,                 // 1-indexed page where the strongest field data is visible.
  "extraction_notes": string              // 1-3 sentences. Briefly explain where each numeric field came from, especially when a deviation table or multi-voltage table was used. Aids debugging and trust. Example: "AIC and SCCR extracted from page 2 deviation table's Submitted column. Specified called for 65 kA; submitted is 42 kA."
}

CRITICAL: never invent values that are not visually present. Use null when uncertain. Better to return null than to guess.

Return JSON only, no prose outside the JSON.`;

type VisionPayload = {
  equipment_tag: string | null;
  vendor: string | null;
  model_num: string | null;
  fields: {
    aic_ka: number | null;
    sccr_ka: number | null;
    voltage: string | null;
    ampacity_a: number | null;
    poles: number | null;
    enclosure_nema: string | null;
  };
  submittal_status: string | null;
  primary_page: number;
  extraction_notes?: string | null;
};

type NormalizedSubmittal = {
  rawTag: string | null;
  tagNormalized: string | null;
  vendor: string | null;
  modelNum: string | null;
  fields: Record<string, number | string | null>;
  submittalStatus: string | null;
  pageNum: number;
};

/**
 * Pure transform from VisionPayload → row-ready normalized values.
 * Exported for unit tests; doesn't touch the DB.
 */
export function normalizeSubmittalPayload(
  payload: VisionPayload,
): NormalizedSubmittal {
  const rawTag = payload.equipment_tag;
  const tagNormalized = normalizeEquipmentTag(rawTag);

  // Run AIC/SCCR through normalize even though the prompt asks for kA
  // already — sometimes models return strings like "65 kAIC" or 65000.
  const aicNormalized = normalizeAicKa(
    payload.fields.aic_ka != null ? String(payload.fields.aic_ka) : null,
  );
  const sccrNormalized = normalizeAicKa(
    payload.fields.sccr_ka != null ? String(payload.fields.sccr_ka) : null,
  );
  const enclosureNormalized = normalizeNemaRating(payload.fields.enclosure_nema);

  const fields: Record<string, number | string | null> = {};
  if (aicNormalized != null) fields.aic_ka = aicNormalized;
  if (sccrNormalized != null) fields.sccr_ka = sccrNormalized;
  if (payload.fields.voltage) fields.voltage = payload.fields.voltage;
  if (
    payload.fields.ampacity_a != null &&
    Number.isFinite(payload.fields.ampacity_a)
  ) {
    fields.ampacity_a = payload.fields.ampacity_a;
  }
  if (payload.fields.poles != null && Number.isFinite(payload.fields.poles)) {
    fields.poles = payload.fields.poles;
  }
  if (enclosureNormalized) fields.enclosure_nema = enclosureNormalized;
  // extraction_notes is bookkeeping, not a rule input — store it alongside
  // the values it explains so debugging an extraction can read directly
  // from submittal_fields without re-running vision.
  if (
    typeof payload.extraction_notes === "string" &&
    payload.extraction_notes.trim().length > 0
  ) {
    fields.extraction_notes = payload.extraction_notes.trim();
  }

  return {
    rawTag,
    tagNormalized,
    vendor: payload.vendor,
    modelNum: payload.model_num,
    fields,
    submittalStatus: payload.submittal_status,
    pageNum: payload.primary_page > 0 ? payload.primary_page : 1,
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

    const rasterKeys = await step.run("load-raster-keys", async () => {
      const rows = await db
        .select({
          pageNum: documentPages.pageNum,
          rasterR2Key: documentPages.rasterR2Key,
        })
        .from(documentPages)
        .where(eq(documentPages.documentId, documentId))
        .orderBy(asc(documentPages.pageNum))
        .limit(MAX_PAGES_TO_VISION);
      return rows.filter((r) => r.rasterR2Key);
    });

    if (rasterKeys.length === 0) {
      return { documentId, skipped: "no_rasters" };
    }

    const payload = await step.run("vision-extract", async () => {
      return memoize<VisionPayload>(
        "parse_submittal_field",
        doc.contentSha256,
        async () => {
          const images = await Promise.all(
            rasterKeys.map(async (r) => ({
              mediaType: "image/png" as const,
              data: (await getObjectBuffer(r.rasterR2Key!)).toString("base64"),
            })),
          );
          const result = await visionExtract<VisionPayload>({
            system: VISION_SYSTEM,
            prompt: `Filename: ${doc.filename}\n\nExtract the structured fields and return JSON.`,
            images,
            ctx: { workspaceId, projectId },
            purpose: "parse_submittal",
          });
          return { payload: result };
        },
      );
    });

    const normalized = normalizeSubmittalPayload(payload);

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

    return {
      documentId,
      equipmentId,
      tag: normalized.rawTag,
      tagNormalized,
      fieldsExtracted: Object.keys(normalized.fields).length,
      hasAic: normalized.fields.aic_ka != null,
    };
  },
);
