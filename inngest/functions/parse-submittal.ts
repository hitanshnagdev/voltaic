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

const VISION_SYSTEM = `You are extracting structured values from a vendor electrical equipment cut sheet ("submittal").

Identify exactly one piece of equipment described by these pages and extract its fields. Return JSON ONLY in this exact shape:

{
  "equipment_tag": string | null,         // Project tag stamped on the cut sheet, e.g. "MDP-A", "PP-1A". null if not visible.
  "vendor": string | null,                // Manufacturer, e.g. "Square D", "Eaton", "Siemens", "ABB"
  "model_num": string | null,             // Catalog number, e.g. "NQOD442L225CU"
  "fields": {
    "aic_ka": number | null,              // Available Interrupting Current rating, kA. e.g. 65 (NOT 65000)
    "sccr_ka": number | null,             // Short-Circuit Current Rating, kA
    "voltage": string | null,             // e.g. "208Y/120V", "480Y/277V", "240V"
    "ampacity_a": number | null,          // Frame/main ampacity, Amps
    "poles": number | null,               // 1, 2, 3, 4
    "enclosure_nema": string | null       // NEMA enclosure code: "1", "3R", "4X", "12"
  },
  "submittal_status": string | null,      // From the approval stamp if visible: "approved" | "approved_as_noted" | "revise_resubmit" | "rejected" | null
  "primary_page": number                  // 1-indexed page number where the field data is most clearly visible
}

Rules:
- Never invent values that are not visually present. Use null when uncertain.
- For AIC/SCCR, return kA NOT amperes (65 not 65000).
- equipment_tag is the PROJECT tag (e.g. "MDP-A"), not a model number.
- If the cut sheet covers multiple discrete pieces of equipment with different tags, return the one tagged for the lead page; the rest will be picked up on subsequent runs.

Return JSON only, no prose.`;

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
