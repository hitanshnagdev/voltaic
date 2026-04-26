import "server-only";
import crypto from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { memoize } from "@/lib/cache/content_hash";
import { db } from "@/lib/db/client";
import { specChecklistItems, specParagraphs } from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import {
  parseChecklistFromParagraph,
  type ChecklistItem,
} from "@/lib/rag/parse/checklist";

/**
 * Stage 2c — spec checklist extractor. Phase B PR 1 of docs/DECISIONS.md U12.
 *
 * Triggered by `document/spec-paragraphs-written` (the same event
 * `embed-spec-paragraphs` already subscribes to). For each paragraph
 * the spec parser produced, ask Sonnet to extract structured
 * `ChecklistItem`s — typed requirements that downstream consumers
 * (the comparator, the compare-page table) can evaluate without
 * regex-matching against retrieved spec text.
 *
 * Per-paragraph caching on `spec_paragraphs.contentSha256` — when a
 * spec is re-parsed and the paragraph text didn't change, we don't
 * re-spend Sonnet tokens on it.
 *
 * Idempotent: re-firing for the same document deletes prior checklist
 * items for that document before inserting fresh ones, using the same
 * INSERT-on-conflict-DO-NOTHING then DELETE-by-NOT-IN shape as
 * parse-spec (so the unique-index on (document_id, content_sha256)
 * preserves rows whose payload didn't change).
 */

type SpecParagraphsWrittenEvent = {
  documentId: string;
  workspaceId: string;
  projectId: string;
};

/**
 * Per-paragraph cache key prefix. Bump the version suffix when the
 * prompt or output schema changes — auto-invalidates prior cache
 * entries the same way the submittal vision cache does.
 */
const CHECKLIST_CACHE_PURPOSE = "parse_spec_paragraph/v:checklist-1" as const;

type ChecklistRow = {
  workspaceId: string;
  documentId: string;
  specParagraphId: string;
  csiSection: string;
  csiPath: string;
  attribute: string;
  requiredKind: string;
  comparator: string;
  requiredValue: ChecklistItem["requiredValue"];
  unit: string | null;
  rawQuote: string;
  confidence: string;
  contentSha256: string;
};

/**
 * Pure transform: paragraph + extracted items → DB row shape. Stable
 * content hash over (paragraph_id, attribute, raw_quote, value) so the
 * unique index can dedup re-extractions of identical items.
 *
 * Exported for unit tests.
 */
export function buildChecklistRows(input: {
  workspaceId: string;
  documentId: string;
  specParagraphId: string;
  csiSection: string;
  csiPath: string;
  items: ChecklistItem[];
}): ChecklistRow[] {
  const { workspaceId, documentId, specParagraphId, csiSection, csiPath, items } =
    input;
  return items.map((item) => {
    const sha = crypto
      .createHash("sha256")
      .update(
        `${specParagraphId}|${item.attribute}|${item.rawQuote}|${JSON.stringify(item.requiredValue)}`,
      )
      .digest("hex");
    return {
      workspaceId,
      documentId,
      specParagraphId,
      csiSection,
      csiPath,
      attribute: item.attribute,
      requiredKind: item.requiredKind,
      comparator: item.comparator,
      requiredValue: item.requiredValue,
      unit: item.unit,
      rawQuote: item.rawQuote,
      confidence: item.confidence.toFixed(3),
      contentSha256: sha,
    };
  });
}

export const parseSpecChecklist = inngest.createFunction(
  {
    id: "parse-spec-checklist",
    name: "Parse spec checklist",
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: "document/spec-paragraphs-written" }],
  },
  async ({ event, step }) => {
    const { documentId, workspaceId, projectId } =
      event.data as SpecParagraphsWrittenEvent;

    const paragraphs = await step.run("load-paragraphs", async () => {
      return db
        .select({
          id: specParagraphs.id,
          csiSection: specParagraphs.csiSection,
          csiPart: specParagraphs.csiPart,
          csiArticle: specParagraphs.csiArticle,
          csiParagraph: specParagraphs.csiParagraph,
          content: specParagraphs.content,
          contentSha256: specParagraphs.contentSha256,
        })
        .from(specParagraphs)
        .where(eq(specParagraphs.documentId, documentId));
    });

    if (paragraphs.length === 0) {
      return { documentId, skipped: "no_paragraphs" };
    }

    // Process in series — Sonnet rate limits + the cache layer means
    // most paragraphs will hit cache after the first parse, and going
    // serial keeps the API budget predictable for first runs.
    const allRows: ChecklistRow[] = [];
    for (const p of paragraphs) {
      if (!p.csiSection) continue;
      const csiPath = [
        p.csiSection,
        p.csiPart ?? "",
        p.csiArticle ?? "",
        p.csiParagraph ?? "",
      ].join("/");
      const items = await step.run(
        `extract-${p.id.slice(0, 8)}`,
        async () => {
          return memoize<ChecklistItem[]>(
            CHECKLIST_CACHE_PURPOSE,
            p.contentSha256,
            async () => {
              const extracted = await parseChecklistFromParagraph({
                input: {
                  csiSection: p.csiSection!,
                  csiPath,
                  content: p.content,
                },
                ctx: { workspaceId, projectId },
              });
              return { payload: extracted };
            },
          );
        },
      );
      const rows = buildChecklistRows({
        workspaceId,
        documentId,
        specParagraphId: p.id,
        csiSection: p.csiSection,
        csiPath,
        items,
      });
      allRows.push(...rows);
    }

    await step.run("save-checklist", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        // Same idempotency shape as parse-spec save-paragraphs (post/002):
        // INSERT-on-conflict-DO-NOTHING preserves unchanged rows; then
        // DELETE-by-NOT-IN drops anything that vanished. Both inside one
        // transaction so readers never see neither.
        if (allRows.length > 0) {
          await tx
            .insert(specChecklistItems)
            .values(allRows)
            .onConflictDoNothing({
              target: [
                specChecklistItems.documentId,
                specChecklistItems.contentSha256,
              ],
            });
          const newShas = allRows.map((r) => r.contentSha256);
          await tx
            .delete(specChecklistItems)
            .where(
              and(
                eq(specChecklistItems.documentId, documentId),
                notInArray(specChecklistItems.contentSha256, newShas),
              ),
            );
        } else {
          await tx
            .delete(specChecklistItems)
            .where(eq(specChecklistItems.documentId, documentId));
        }
      });
    });

    return {
      documentId,
      paragraphCount: paragraphs.length,
      checklistItemCount: allRows.length,
    };
  },
);
