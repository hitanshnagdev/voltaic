import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { documentPages, documents, llmCalls } from "../lib/db/schema";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 1,
    prepare: false,
  });
  const db = drizzle(sql);

  const docs = await db
    .select()
    .from(documents)
    .orderBy(desc(documents.uploadedAt))
    .limit(3);
  console.log("=== documents ===");
  for (const d of docs) {
    console.log(
      `  ${d.filename}  status=${d.status}  type=${d.docType ?? "null"}  pages=${d.pageCount ?? "null"}`,
    );
    const pages = await db
      .select()
      .from(documentPages)
      .where(eq(documentPages.documentId, d.id))
      .orderBy(documentPages.pageNum);
    console.log(`    document_pages rows: ${pages.length}`);
    for (const p of pages.slice(0, 2)) {
      const preview = (p.textContent ?? "").slice(0, 80).replace(/\s+/g, " ");
      console.log(
        `      p${p.pageNum}: raster=${p.rasterR2Key ? "yes" : "no"}  text="${preview}${p.textContent && p.textContent.length > 80 ? "…" : ""}"`,
      );
    }
  }

  const calls = await db
    .select()
    .from(llmCalls)
    .orderBy(desc(llmCalls.createdAt))
    .limit(5);
  console.log("\n=== llm_calls ===");
  for (const c of calls) {
    console.log(
      `  ${c.model} ${c.purpose}  in=${c.tokensIn} out=${c.tokensOut}  cost=$${c.costUsd ?? "?"}  ${c.latencyMs}ms${c.error ? ` ERROR=${c.error}` : ""}`,
    );
  }

  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
