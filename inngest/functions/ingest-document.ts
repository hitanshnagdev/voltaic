import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import { documentPages, documents } from "@/lib/db/schema";
import { classify } from "@/lib/llm";
import { parsePdf } from "@/lib/pdf/parse";
import { rasterPdf, targetWidthForDocType } from "@/lib/pdf/raster";
import { getObjectBuffer, putObject } from "@/lib/r2/client";

type DocType = "drawing" | "spec" | "submittal" | "other";
type Classification = {
  type: DocType;
  confidence: number;
  reasoning: string;
};

const CLASSIFY_SYSTEM = `You classify construction PDFs. Given the first few pages' text, return one of: "drawing", "spec", "submittal", "other".

- drawings: plan-view or schematic graphics, often large-format with title blocks, sheet numbers (E-101, etc.), revision ribbons.
- specs: CSI-formatted written documents (Division 26 for electrical), section headers like "SECTION 26 24 16", PART 1/2/3, articles.
- submittals: vendor product data packages, cut sheets, datasheets, submittal stamps.
- other: anything not clearly one of the above.

Reply JSON ONLY, no prose: {"type":"drawing|spec|submittal|other","confidence":0-1,"reasoning":"brief"}`;

function firstNPages(pages: { text: string }[], n: number): string {
  return pages
    .slice(0, n)
    .map((p, i) => `--- page ${i + 1} ---\n${p.text}`)
    .join("\n\n")
    .slice(0, 12_000);
}

export const ingestDocument = inngest.createFunction(
  {
    id: "ingest-document",
    name: "Ingest document",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: "document/uploaded" }],
  },
  async ({ event, step }) => {
    const { documentId, workspaceId, projectId } = event.data as {
      documentId: string;
      workspaceId: string;
      projectId: string;
    };

    const doc = await step.run("load-doc", async () => {
      const rows = await db
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
      if (!rows[0]) throw new Error(`document not found: ${documentId}`);
      return rows[0];
    });

    await step.run("mark-parsing", async () => {
      await db
        .update(documents)
        .set({ status: "parsing" })
        .where(eq(documents.id, documentId));
    });

    const parsed = await step.run("download-and-parse", async () => {
      const buf = await getObjectBuffer(doc.r2Key);
      const p = await parsePdf(buf);
      return { pageCount: p.pageCount, pages: p.pages };
    });

    const classification = await step.run("classify", async () => {
      const sample = firstNPages(parsed.pages, 3);
      if (!sample.trim()) {
        return {
          type: "other" as DocType,
          confidence: 0,
          reasoning: "no extractable text",
        } satisfies Classification;
      }
      return classify<Classification>({
        system: CLASSIFY_SYSTEM,
        user: `Filename: ${doc.filename}\n\nFirst pages:\n${sample}`,
        ctx: { workspaceId, projectId },
        maxTokens: 300,
      });
    });

    await step.run("save-classification", async () => {
      await db
        .update(documents)
        .set({
          docType: classification.type,
          pageCount: parsed.pageCount,
        })
        .where(eq(documents.id, documentId));
    });

    const rasters = await step.run("raster-pages", async () => {
      const buf = await getObjectBuffer(doc.r2Key);
      // Drawings need higher pixel density than letter-size specs/submittals
      // (architectural sheets are 30x42" — at the default width they
      // collapse to ~37 DPI). Pick the right width for the classified type.
      const pages = await rasterPdf(buf, {
        targetWidthPx: targetWidthForDocType(classification.type),
      });
      const uploaded: { pageNum: number; rasterR2Key: string }[] = [];
      for (const r of pages) {
        const key = `workspaces/${workspaceId}/projects/${projectId}/rasters/${documentId}/p${r.pageNum}.png`;
        await putObject({ key, body: r.png, contentType: "image/png" });
        uploaded.push({ pageNum: r.pageNum, rasterR2Key: key });
      }
      return uploaded;
    });

    await step.run("write-pages", async () => {
      const rasterByPage = new Map(
        rasters.map((r) => [r.pageNum, r.rasterR2Key]),
      );
      const rows = parsed.pages.map((p) => ({
        workspaceId,
        documentId,
        pageNum: p.pageNum,
        textContent: p.text || null,
        rasterR2Key: rasterByPage.get(p.pageNum) ?? null,
        pageSha256: crypto
          .createHash("sha256")
          .update(`${p.pageNum}::${p.text}`)
          .digest("hex"),
      }));
      if (rows.length) {
        await db.insert(documentPages).values(rows).onConflictDoNothing();
      }
    });

    await step.run("mark-ready", async () => {
      await db
        .update(documents)
        .set({ status: "ready" })
        .where(eq(documents.id, documentId));
    });

    // Fan out to per-doc-type structural parsers. Each parser is its own
    // durable function so failures are isolated and retries are independent.
    // Drawing / panel-schedule events land as those parsers ship.
    if (classification.type === "spec") {
      await step.sendEvent("emit-spec-classified", {
        name: "document/spec-classified",
        data: { documentId, workspaceId, projectId },
      });
    } else if (classification.type === "submittal") {
      await step.sendEvent("emit-submittal-classified", {
        name: "document/submittal-classified",
        data: { documentId, workspaceId, projectId },
      });
    }

    return {
      documentId,
      docType: classification.type,
      pageCount: parsed.pageCount,
    };
  },
);
