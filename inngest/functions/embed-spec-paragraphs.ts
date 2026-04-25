import "server-only";
import { eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import { specParagraphs } from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import { embed, MAX_BATCH } from "@/lib/embed";
import { buildEmbedText } from "@/lib/rag/embed_text";

/**
 * Stage 3 — embed spec paragraphs.
 *
 * Triggered by `document/spec-paragraphs-written` (emitted by parse-spec
 * after rows land). Reads paragraphs that don't have an embedding yet,
 * builds metadata-prefixed input strings via buildEmbedText, calls Voyage-3
 * in batches, and writes vectors back row-by-row.
 *
 * Idempotent: only embeds rows where `embedding IS NULL`. Re-firing for
 * the same document after parse-spec re-runs will pick up the freshly
 * inserted rows whose embeddings haven't been computed.
 */

type SpecParagraphsWrittenEvent = {
  documentId: string;
  workspaceId: string;
  projectId: string;
};

export const embedSpecParagraphs = inngest.createFunction(
  {
    id: "embed-spec-paragraphs",
    name: "Embed spec paragraphs",
    retries: 2,
    // Conservative concurrency — each invocation can issue multiple Voyage
    // requests; capping limits the burst rate against the rate limit.
    concurrency: { limit: 2 },
    triggers: [{ event: "document/spec-paragraphs-written" }],
  },
  async ({ event, step }) => {
    const { documentId, workspaceId, projectId } =
      event.data as SpecParagraphsWrittenEvent;

    const rows = await step.run("load-rows-needing-embeddings", async () => {
      return db
        .select({
          id: specParagraphs.id,
          csiSection: specParagraphs.csiSection,
          csiPart: specParagraphs.csiPart,
          csiArticle: specParagraphs.csiArticle,
          csiParagraph: specParagraphs.csiParagraph,
          referencedStandards: specParagraphs.referencedStandards,
          content: specParagraphs.content,
        })
        .from(specParagraphs)
        .where(
          sql`${specParagraphs.documentId} = ${documentId}
              AND ${specParagraphs.embedding} IS NULL`,
        );
    });

    if (rows.length === 0) {
      return { documentId, embedded: 0, skipped: "no_rows_needing_embedding" };
    }

    const inputs = rows.map((r) =>
      buildEmbedText({
        csiSection: r.csiSection,
        csiPart: r.csiPart,
        csiArticle: r.csiArticle,
        csiParagraph: r.csiParagraph,
        referencedStandards: r.referencedStandards ?? [],
        content: r.content,
      }),
    );

    const vectors = await step.run("embed-batch", async () => {
      return embed({
        inputs,
        ctx: { workspaceId, projectId },
        inputType: "document",
      });
    });

    await step.run("write-vectors", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        // Drizzle's `vector` column expects a JS number[] on update.
        // pgvector accepts the canonical "[v1,v2,...]" string format on
        // assignment via raw sql for performance with large rows.
        for (let i = 0; i < rows.length; i++) {
          const literal = `[${vectors[i].join(",")}]`;
          await tx
            .update(specParagraphs)
            .set({ embedding: sql`${literal}::vector` })
            .where(eq(specParagraphs.id, rows[i].id));
        }
      });
    });

    return {
      documentId,
      embedded: rows.length,
      batchCeiling: MAX_BATCH,
    };
  },
);
