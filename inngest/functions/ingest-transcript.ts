import "server-only";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import { transcripts, transcriptUtterances } from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import { embed, MAX_BATCH } from "@/lib/embed";
import { getObjectBuffer } from "@/lib/r2/client";
import { parseTranscript } from "@/lib/rag/transcript/parse";

/**
 * Meeting-layer Stage 1 — ingest a transcript.
 *
 * Triggered by `transcript/uploaded` (manual upload now; Google Meet / Zoom
 * later). Downloads the raw text from R2, parses it into utterances, embeds
 * them (Voyage-3), and writes `transcript_utterances` rows. Then fires
 * `transcript/utterances-ready` for the claim-extraction + contradiction
 * pass (Increment 2).
 *
 * Idempotent: re-ingest deletes the transcript's existing utterances first,
 * so re-firing the event rebuilds cleanly.
 */

type TranscriptUploadedEvent = {
  transcriptId: string;
  workspaceId: string;
  projectId: string;
};

export const ingestTranscript = inngest.createFunction(
  {
    id: "ingest-transcript",
    name: "Ingest transcript",
    retries: 2,
    concurrency: { limit: 2 },
    triggers: [{ event: "transcript/uploaded" }],
  },
  async ({ event, step }) => {
    const { transcriptId, workspaceId, projectId } =
      event.data as TranscriptUploadedEvent;

    const transcript = await step.run("load-transcript", async () => {
      const rows = await db
        .select()
        .from(transcripts)
        .where(eq(transcripts.id, transcriptId))
        .limit(1);
      return rows[0] ?? null;
    });

    if (!transcript) {
      return { transcriptId, skipped: "transcript_not_found" };
    }

    await step.run("mark-processing", async () => {
      await db
        .update(transcripts)
        .set({ status: "processing" })
        .where(eq(transcripts.id, transcriptId));
    });

    const utterances = await step.run("download-and-parse", async () => {
      const buf = await getObjectBuffer(transcript.r2Key);
      return parseTranscript(buf.toString("utf-8"));
    });

    if (utterances.length === 0) {
      await step.run("mark-ready-empty", async () => {
        await db
          .update(transcripts)
          .set({ status: "ready" })
          .where(eq(transcripts.id, transcriptId));
      });
      return { transcriptId, utterances: 0, skipped: "no_utterances" };
    }

    // Embed + persist in one step so the (large) vector arrays never cross an
    // Inngest step boundary as serialized JSON.
    await step.run("embed-and-persist", async () => {
      const inputs = utterances.map((u) =>
        u.speaker ? `${u.speaker}: ${u.content}` : u.content,
      );
      const vectors: number[][] = [];
      for (let i = 0; i < inputs.length; i += MAX_BATCH) {
        const chunk = inputs.slice(i, i + MAX_BATCH);
        const v = await embed({
          inputs: chunk,
          ctx: { workspaceId, projectId },
          inputType: "document",
        });
        vectors.push(...v);
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx
          .delete(transcriptUtterances)
          .where(eq(transcriptUtterances.transcriptId, transcriptId));

        const inserted = await tx
          .insert(transcriptUtterances)
          .values(
            utterances.map((u, i) => ({
              workspaceId,
              transcriptId,
              idx: i,
              speaker: u.speaker ?? null,
              startMs: u.startMs ?? null,
              endMs: u.endMs ?? null,
              content: u.content,
              contentSha256: createHash("sha256")
                .update(u.content)
                .digest("hex"),
            })),
          )
          .returning({ id: transcriptUtterances.id });

        // Drizzle's `vector` column takes the canonical "[v1,v2,...]" literal
        // via raw sql on assignment (mirrors embed-spec-paragraphs).
        for (let i = 0; i < inserted.length; i++) {
          const literal = `[${vectors[i].join(",")}]`;
          await tx
            .update(transcriptUtterances)
            .set({ embedding: sql`${literal}::vector` })
            .where(eq(transcriptUtterances.id, inserted[i].id));
        }
      });
    });

    await step.run("mark-ready", async () => {
      await db
        .update(transcripts)
        .set({ status: "ready" })
        .where(eq(transcripts.id, transcriptId));
    });

    await step.sendEvent("emit-utterances-ready", {
      name: "transcript/utterances-ready",
      data: { transcriptId, workspaceId, projectId },
    });

    return { transcriptId, utterances: utterances.length };
  },
);
