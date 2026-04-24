/**
 * CLI: parse a local spec PDF (or .txt) and pretty-print structured paragraphs.
 *
 * Usage:
 *   npx tsx scripts/parse_spec.ts path/to/spec.pdf
 *   npx tsx scripts/parse_spec.ts path/to/spec.pdf --json
 *
 * Useful for quick eyeball-checks as we iterate on the parser. No DB writes;
 * no API calls. Handy when the user drops a spec in and we want to see what
 * the structural pass picked up before spending tokens.
 */
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseSpec } from "../lib/rag/parse/spec";
import { extractPdfText } from "../lib/rag/parse/pdf_text";

async function loadPages(path: string): Promise<string[]> {
  const buf = await readFile(path);
  if (extname(path).toLowerCase() === ".txt") {
    // Treat the whole .txt as a single page for quick local testing.
    return [buf.toString("utf8")];
  }
  const { pages, emptyPageRatio } = await extractPdfText(buf);
  if (emptyPageRatio > 0.5) {
    console.error(
      `warning: ${Math.round(emptyPageRatio * 100)}% of pages returned empty text — this PDF likely needs OCR`,
    );
  }
  return pages;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: parse_spec.ts <path-to-pdf-or-txt> [--json]");
    process.exit(2);
  }
  const jsonMode = process.argv.includes("--json");

  const pages = await loadPages(path);
  const rows = parseSpec(pages);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
    return;
  }

  console.log(`parsed ${rows.length} paragraphs from ${pages.length} pages\n`);
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.requirementType] = (byType[r.requirementType] ?? 0) + 1;
  console.log("requirement_type breakdown:");
  for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(24)} ${n}`);
  }
  console.log("");

  for (const r of rows) {
    const cite = [
      r.csiSection ?? "?",
      r.csiPart ? `PART ${r.csiPart}` : null,
      r.csiArticle,
      r.csiParagraph,
    ]
      .filter(Boolean)
      .join(" · ");
    const page = r.pageNum ? ` (p${r.pageNum})` : "";
    const stds =
      r.referencedStandards.length > 0
        ? ` [${r.referencedStandards.join(", ")}]`
        : "";
    console.log(`[${r.requirementType}] ${cite}${page}${stds}`);
    const preview =
      r.content.length > 180 ? r.content.slice(0, 180) + "…" : r.content;
    console.log(`  ${preview}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
