import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });
  try {
    console.log("=== submittal documents ===");
    const docs = await sql<
      Array<{
        id: string;
        filename: string;
        content_sha256: string;
        status: string;
      }>
    >`
      SELECT id, filename, content_sha256, status
      FROM documents
      WHERE doc_type = 'submittal'
    `;
    console.table(docs);

    if (docs.length === 0) return;

    console.log("\n=== hash_cache hits for parse_submittal_field/v:* ===");
    const cached = await sql<
      Array<{
        key: string;
        purpose: string;
        content_sha256: string;
        token_cost: number | null;
        hit_count: number;
        created_at: Date;
        last_used_at: Date;
        payload: unknown;
      }>
    >`
      SELECT key, purpose, content_sha256, token_cost, hit_count,
             created_at, last_used_at, payload
      FROM hash_cache
      WHERE purpose LIKE 'parse_submittal_field/v:%'
      ORDER BY created_at DESC
    `;
    console.log(`found ${cached.length} cached entries`);

    for (const c of cached) {
      console.log(`\n--- cache key: ${c.key} (purpose: ${c.purpose}) ---`);
      console.log(
        `content_sha256: ${c.content_sha256.slice(0, 12)}... ` +
          `hit_count=${c.hit_count} created=${c.created_at.toISOString()}`,
      );
      // memoize stores { payload: { payload: VisionPayload, citations: [...] } }
      const wrapped = c.payload as {
        payload?: { payload?: unknown; citations?: unknown[] };
      };
      const visionPayload = wrapped?.payload?.payload as
        | Record<string, unknown>
        | undefined;
      const citations = wrapped?.payload?.citations as
        | Array<{
            citedText?: string;
            cited_text?: string;
            startPageNumber?: number;
            start_page_number?: number;
          }>
        | undefined;

      if (visionPayload) {
        console.log("\nvision payload keys + values:");
        const vp = visionPayload as Record<string, unknown>;
        for (const k of Object.keys(vp)) {
          if (k === "fields") continue;
          const v = vp[k];
          if (v == null) console.log(`  ${k}: null`);
          else if (typeof v === "object") {
            console.log(`  ${k}: ${JSON.stringify(v).slice(0, 140)}`);
          } else {
            console.log(`  ${k}: ${String(v).slice(0, 140)}`);
          }
        }
        const fields = vp.fields as Record<string, unknown> | undefined;
        if (fields) {
          console.log("\nvision payload .fields:");
          for (const k of Object.keys(fields)) {
            const v = fields[k];
            if (v == null) console.log(`  ${k}: null`);
            else
              console.log(`  ${k}: ${JSON.stringify(v).slice(0, 200)}`);
          }
        }
      } else {
        console.log("(no vision payload found in cache entry)");
      }

      console.log(`\ncitations: ${citations?.length ?? 0} entries`);
      if (citations) {
        for (let i = 0; i < Math.min(citations.length, 12); i++) {
          const cit = citations[i];
          const text = cit.citedText ?? cit.cited_text ?? "";
          const page = cit.startPageNumber ?? cit.start_page_number ?? "?";
          console.log(`  [${i}] p.${page}: ${text.slice(0, 140)}`);
        }
        if (citations.length > 12) {
          console.log(`  ... and ${citations.length - 12} more`);
        }
      }
    }
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
