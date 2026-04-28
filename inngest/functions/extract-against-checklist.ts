import "server-only";
import crypto from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { memoize } from "@/lib/cache/content_hash";
import { db } from "@/lib/db/client";
import {
  documents,
  specChecklistItems,
  submittalChecklistResponses,
} from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import {
  extractAgainstChecklist,
  type ChecklistItemForGuide,
  type GuidedResponse,
} from "@/lib/rag/extract/guided";
import { getObjectBuffer } from "@/lib/r2/client";

/**
 * Stage 2d — guided submittal extraction. Phase B PR 3 of
 * docs/DECISIONS.md U12.
 *
 * Triggered by `submittal/extract-against-checklist-ready` (fired from
 * the assignment API on assignment-create AND from
 * parse-spec-checklist when the checklist for a spec lands and there
 * are prior assignments waiting for it). Both paths fire with the same
 * payload shape; the runner is idempotent so duplicate fires converge.
 *
 * What the runner does:
 *   1. Load the checklist items for the assigned (spec, csi_section)
 *   2. Load the submittal PDF bytes from R2
 *   3. Call the guided extractor (Sonnet vision + citations) — one
 *      response per checklist item, found=true with quote+page or
 *      found=false (silent on the requirement)
 *   4. Persist with INSERT-on-conflict-DO-NOTHING + DELETE-by-NOT-IN
 *      idempotency on (submittal, checklist_item)
 *
 * Per-(submittal-bytes + checklist-shape) cached so re-firing for the
 * same submittal against an unchanged checklist doesn't re-spend
 * Sonnet tokens.
 */

type ExtractReadyEvent = {
  submittalDocumentId: string;
  specDocumentId: string;
  /** Optional CSI section narrowing — null = whole spec doc. */
  csiSection: string | null;
  workspaceId: string;
  projectId: string;
};

// Bumped to v:guided-2 with the batching + PDF prompt-cache PR. Old
// cached entries (from the single-shot extractor that truncated on
// large checklists) get bypassed so the first re-fire spends real
// tokens against the new, correct logic.
const CACHE_PURPOSE = "parse_submittal/v:guided-2" as const;

type ResponseRow = {
  workspaceId: string;
  submittalDocumentId: string;
  specChecklistItemId: string;
  found: boolean;
  value: GuidedResponse["value"];
  evidenceQuote: string | null;
  pageNum: number | null;
  confidence: string;
  contentSha256: string;
};

/**
 * Pure transform: per-item GuidedResponse → DB row shape. Stable
 * content hash over (submittal_id, item_id, value) so repeated
 * extractions of the same answer dedup cleanly under the unique
 * index.
 *
 * Exported for unit tests.
 */
export function buildResponseRows(input: {
  workspaceId: string;
  submittalDocumentId: string;
  responses: GuidedResponse[];
}): ResponseRow[] {
  const { workspaceId, submittalDocumentId, responses } = input;
  return responses.map((r) => {
    const sha = crypto
      .createHash("sha256")
      .update(
        `${submittalDocumentId}|${r.checklistItemId}|${r.found}|${JSON.stringify(r.value)}`,
      )
      .digest("hex");
    return {
      workspaceId,
      submittalDocumentId,
      specChecklistItemId: r.checklistItemId,
      found: r.found,
      value: r.value,
      evidenceQuote: r.evidenceQuote,
      pageNum: r.pageNum,
      confidence: r.confidence.toFixed(3),
      contentSha256: sha,
    };
  });
}

export const extractSubmittalAgainstChecklist = inngest.createFunction(
  {
    id: "extract-submittal-against-checklist",
    name: "Extract submittal against assigned spec checklist",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: "submittal/extract-against-checklist-ready" }],
  },
  async ({ event, step }) => {
    const { submittalDocumentId, specDocumentId, csiSection, workspaceId, projectId } =
      event.data as ExtractReadyEvent;

    // 1. Load the submittal doc (need filename + r2 key + content hash for caching).
    const submittal = await step.run("load-submittal", async () => {
      const rows = await db
        .select({
          id: documents.id,
          filename: documents.filename,
          contentSha256: documents.contentSha256,
          r2Key: documents.r2Key,
          docType: documents.docType,
        })
        .from(documents)
        .where(eq(documents.id, submittalDocumentId))
        .limit(1);
      const r = rows[0];
      if (!r) return null;
      if (r.docType !== "submittal") return null;
      return r;
    });

    if (!submittal) {
      return { submittalDocumentId, skipped: "submittal_not_found" };
    }

    // 2. Load the checklist for the assigned (spec, csi_section).
    //    Empty result → checklist hasn't been parsed yet, exit gracefully.
    //    parse-spec-checklist will fire `submittal/extract-against-
    //    checklist-ready` for any prior assignments when the checklist
    //    eventually lands.
    const checklist = await step.run("load-checklist", async () => {
      const conditions = [eq(specChecklistItems.documentId, specDocumentId)];
      if (csiSection)
        conditions.push(eq(specChecklistItems.csiSection, csiSection));
      const rows = await db
        .select({
          id: specChecklistItems.id,
          attribute: specChecklistItems.attribute,
          requiredKind: specChecklistItems.requiredKind,
          comparator: specChecklistItems.comparator,
          requiredValue: specChecklistItems.requiredValue,
          unit: specChecklistItems.unit,
          rawQuote: specChecklistItems.rawQuote,
        })
        .from(specChecklistItems)
        .where(and(...conditions));
      return rows as ChecklistItemForGuide[];
    });

    if (checklist.length === 0) {
      return {
        submittalDocumentId,
        skipped: "checklist_not_ready",
        specDocumentId,
        csiSection,
      };
    }

    // 3. Load PDF bytes from R2.
    const pdfBuffer = await step.run("load-pdf-bytes", async () => {
      const buf = await getObjectBuffer(submittal.r2Key);
      return buf.toString("base64");
    });

    // 4. Vision extraction. Cached on (submittal_sha + checklist_sha)
    //    so re-extracting the same submittal against an unchanged
    //    checklist costs zero tokens. Different checklist (spec was
    //    re-parsed, items changed) → fresh extraction.
    const checklistSha = crypto
      .createHash("sha256")
      .update(JSON.stringify(checklist.map((c) => c.id).sort()))
      .digest("hex")
      .slice(0, 16);
    const cacheKey = `${submittal.contentSha256}|${checklistSha}`;

    const responses = await step.run("vision-extract-guided", async () => {
      return memoize<GuidedResponse[]>(CACHE_PURPOSE, cacheKey, async () => {
        const r = await extractAgainstChecklist({
          pdfBase64: pdfBuffer,
          filename: submittal.filename,
          checklist,
          ctx: { workspaceId, projectId },
        });
        return { payload: r };
      });
    });

    // 5. Persist with the same INSERT-on-conflict-DO-NOTHING +
    //    DELETE-by-NOT-IN shape as parse-spec / parse-spec-checklist.
    const rows = buildResponseRows({
      workspaceId,
      submittalDocumentId,
      responses,
    });

    await step.run("save-responses", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        if (rows.length > 0) {
          await tx
            .insert(submittalChecklistResponses)
            .values(rows)
            .onConflictDoNothing({
              target: [
                submittalChecklistResponses.submittalDocumentId,
                submittalChecklistResponses.specChecklistItemId,
              ],
            });
          // Clear stale rows whose checklist_item_id is no longer in
          // the current set (spec was re-parsed, items disappeared).
          const currentItemIds = rows.map((r) => r.specChecklistItemId);
          await tx
            .delete(submittalChecklistResponses)
            .where(
              and(
                eq(
                  submittalChecklistResponses.submittalDocumentId,
                  submittalDocumentId,
                ),
                notInArray(
                  submittalChecklistResponses.specChecklistItemId,
                  currentItemIds,
                ),
              ),
            );
        } else {
          await tx
            .delete(submittalChecklistResponses)
            .where(
              eq(
                submittalChecklistResponses.submittalDocumentId,
                submittalDocumentId,
              ),
            );
        }
      });
    });

    return {
      submittalDocumentId,
      checklistItemCount: checklist.length,
      foundCount: responses.filter((r) => r.found).length,
      missingCount: responses.filter((r) => !r.found).length,
    };
  },
);
