import "server-only";
import crypto from "node:crypto";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { memoize } from "@/lib/cache/content_hash";
import { db } from "@/lib/db/client";
import {
  documents,
  specChecklistItems,
  submittalChecklistResponses,
  submittalSpecAssignments,
} from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import {
  extractAgainstChecklist,
  type ChecklistItemForGuide,
  type GuidedResponse,
} from "@/lib/rag/extract/guided";
import { getObjectBuffer } from "@/lib/r2/client";

/**
 * Flip the assignment row that drove this run to a target status.
 * Scoped on (submittal × spec × csi) so we only update the assignment
 * the user actually clicked Run Compliance on, not every assignment
 * for this submittal. csi_section nullable makes the WHERE awkward —
 * use IS NULL when the run was for the whole spec.
 */
type ComplianceStatus =
  | "not_run"
  | "queued"
  | "running"
  | "ready"
  | "failed";

async function setAssignmentStatus(args: {
  workspaceId: string;
  submittalDocumentId: string;
  specDocumentId: string;
  csiSection: string | null;
  status: ComplianceStatus;
  setLastRunAt?: boolean;
}) {
  await withWorkspace(args.workspaceId, async (tx) => {
    const csiCond = args.csiSection
      ? eq(submittalSpecAssignments.csiSection, args.csiSection)
      : isNull(submittalSpecAssignments.csiSection);
    const update: {
      complianceRunStatus: ComplianceStatus;
      lastRunAt?: Date;
    } = { complianceRunStatus: args.status };
    if (args.setLastRunAt) update.lastRunAt = new Date();
    await tx
      .update(submittalSpecAssignments)
      .set(update)
      .where(
        and(
          eq(submittalSpecAssignments.workspaceId, args.workspaceId),
          eq(
            submittalSpecAssignments.submittalDocumentId,
            args.submittalDocumentId,
          ),
          eq(submittalSpecAssignments.specDocumentId, args.specDocumentId),
          csiCond,
        ),
      );
  });
}

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
    // Inngest fires onFailure after every retry is exhausted. Flip the
    // assignment to 'failed' so the /compare UI surfaces a retry CTA
    // instead of leaving it stuck in 'running' forever.
    onFailure: async ({ event }) => {
      const e = event.data.event.data as ExtractReadyEvent;
      try {
        await setAssignmentStatus({
          workspaceId: e.workspaceId,
          submittalDocumentId: e.submittalDocumentId,
          specDocumentId: e.specDocumentId,
          csiSection: e.csiSection ?? null,
          status: "failed",
          setLastRunAt: true,
        });
      } catch (err) {
        // Don't mask the original failure with a status-update failure.
        console.error("compliance_status_failed_update_failed", err);
      }
    },
  },
  async ({ event, step }) => {
    const { submittalDocumentId, specDocumentId, csiSection, workspaceId, projectId } =
      event.data as ExtractReadyEvent;

    // Mark assignment as 'running' so /compare can render the proper
    // in-progress panel. Idempotent: queued → running is fine, and
    // running → running is a no-op write. If no assignment row matches
    // the (submittal × spec × csi) triple — pre-PR-3 the runner could
    // be triggered without an assignment — this is a no-op.
    await step.run("mark-running", async () => {
      await setAssignmentStatus({
        workspaceId,
        submittalDocumentId,
        specDocumentId,
        csiSection: csiSection ?? null,
        status: "running",
      });
    });

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
      // Roll back to 'failed' so the UI doesn't show a phantom run.
      await setAssignmentStatus({
        workspaceId,
        submittalDocumentId,
        specDocumentId,
        csiSection: csiSection ?? null,
        status: "failed",
        setLastRunAt: true,
      });
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
      // Roll the assignment back to 'not_run' so the UI shows the
      // Run CTA again rather than a stuck spinner. Don't mark
      // 'failed' — this case is "spec checklist still being parsed,"
      // a transient race, not a real failure.
      await setAssignmentStatus({
        workspaceId,
        submittalDocumentId,
        specDocumentId,
        csiSection: csiSection ?? null,
        status: "not_run",
      });
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

    // Persist landed cleanly — flip the assignment to 'ready'. The
    // /compare polling sees this and renders the table on the next
    // refresh tick.
    await step.run("mark-ready", async () => {
      await setAssignmentStatus({
        workspaceId,
        submittalDocumentId,
        specDocumentId,
        csiSection: csiSection ?? null,
        status: "ready",
        setLastRunAt: true,
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
