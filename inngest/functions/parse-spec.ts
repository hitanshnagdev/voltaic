import "server-only";
import crypto from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { memoize } from "@/lib/cache/content_hash";
import { db } from "@/lib/db/client";
import { documentPages, documents, specParagraphs } from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import {
  resolveSpecIdentity,
  type DocumentIdentity,
} from "@/lib/rag/identity";
import { parseSpec, type ParsedParagraph } from "@/lib/rag/parse/spec";

/**
 * Stage 2b spec parser — durable function.
 *
 * Triggered by `document/spec-classified` (emitted by `ingest-document` after
 * classification). Reads page text from `document_pages`, resolves the
 * document's CSI identity, runs the deterministic spec parser, writes one
 * row per paragraph into `spec_paragraphs`, and stamps `documents.identity`.
 *
 * Both expensive deterministic outputs (identity + paragraph rows) are
 * memoized in `hash_cache` keyed on `documents.content_sha256`. Re-uploading
 * the same spec PDF across projects costs zero CPU after the first run.
 *
 * Idempotent: re-firing for the same document deletes existing
 * `spec_paragraphs` rows for that document before inserting fresh ones.
 */

type SpecClassifiedEvent = {
  documentId: string;
  workspaceId: string;
  projectId: string;
};

type SpecParagraphRow = {
  workspaceId: string;
  documentId: string;
  csiSection: string | null;
  csiPart: string | null;
  csiArticle: string | null;
  csiParagraph: string | null;
  requirementType: string;
  referencedStandards: string[];
  content: string;
  pageNum: number | null;
  contentSha256: string;
};

/**
 * Pure transform from ParsedParagraph → DB row shape. Computes a stable
 * content_sha256 over `(documentId, csiPath, content)` so the same paragraph
 * text under the same CSI path always hashes the same regardless of how
 * many times the doc is reparsed.
 */
export function buildSpecParagraphRows(input: {
  workspaceId: string;
  documentId: string;
  paragraphs: ParsedParagraph[];
}): SpecParagraphRow[] {
  const { workspaceId, documentId, paragraphs } = input;
  return paragraphs
    .filter((p) => p.content.trim().length > 0)
    .map((p) => {
      const csiPath = [
        p.csiSection ?? "",
        p.csiPart ?? "",
        p.csiArticle ?? "",
        p.csiParagraph ?? "",
      ].join("/");
      const sha = crypto
        .createHash("sha256")
        .update(`${documentId}|${csiPath}|${p.content}`)
        .digest("hex");
      return {
        workspaceId,
        documentId,
        csiSection: p.csiSection,
        csiPart: p.csiPart,
        csiArticle: p.csiArticle,
        csiParagraph: p.csiParagraph,
        requirementType: p.requirementType,
        referencedStandards: p.referencedStandards,
        content: p.content,
        pageNum: p.pageNum,
        contentSha256: sha,
      };
    });
}

export const parseSpecDocument = inngest.createFunction(
  {
    id: "parse-spec-document",
    name: "Parse spec document",
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: "document/spec-classified" }],
  },
  async ({ event, step }) => {
    const { documentId, workspaceId, projectId } =
      event.data as SpecClassifiedEvent;

    const doc = await step.run("load-doc", async () => {
      const rows = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      const row = rows[0];
      if (!row) throw new Error(`document not found: ${documentId}`);
      if (row.docType !== "spec") {
        // Defensive: someone fired the wrong event. Don't blow up — just exit.
        return null;
      }
      return {
        id: row.id,
        filename: row.filename,
        contentSha256: row.contentSha256,
      };
    });

    if (!doc) return { documentId, skipped: "not_a_spec" };

    const pages = await step.run("load-pages", async () => {
      const rows = await db
        .select({
          pageNum: documentPages.pageNum,
          textContent: documentPages.textContent,
        })
        .from(documentPages)
        .where(eq(documentPages.documentId, documentId))
        .orderBy(asc(documentPages.pageNum));
      return rows.map((r) => r.textContent ?? "");
    });

    if (pages.length === 0) {
      return { documentId, skipped: "no_pages" };
    }

    const identity = await step.run("resolve-identity", async () => {
      return memoize<DocumentIdentity>(
        "identity",
        doc.contentSha256,
        async () => ({
          payload: resolveSpecIdentity({
            pages,
            filename: doc.filename,
          }),
        }),
      );
    });

    await step.run("save-identity", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        await tx
          .update(documents)
          .set({ identity })
          .where(eq(documents.id, documentId));
      });
    });

    const paragraphs = await step.run("parse-paragraphs", async () => {
      return memoize<ParsedParagraph[]>(
        "parse_spec_paragraph",
        doc.contentSha256,
        async () => ({ payload: parseSpec(pages) }),
      );
    });

    const rows = buildSpecParagraphRows({
      workspaceId,
      documentId,
      paragraphs,
    });

    await step.run("save-paragraphs", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        // Idempotent: re-firing always replaces the row set for this doc.
        // spec_paragraphs has no unique constraint we can lean on for upsert.
        await tx
          .delete(specParagraphs)
          .where(eq(specParagraphs.documentId, documentId));
        if (rows.length) {
          await tx.insert(specParagraphs).values(rows);
        }
      });
    });

    return {
      documentId,
      projectId,
      identity,
      paragraphCount: rows.length,
    };
  },
);
