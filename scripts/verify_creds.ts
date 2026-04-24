import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import Anthropic from "@anthropic-ai/sdk";
import { S3Client, HeadBucketCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const envFile = path.join(process.cwd(), ".env.local");
try {
  const content = readFileSync(envFile, "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const results: Array<{ name: string; ok: boolean; detail: string }> = [];

async function check(name: string, fn: () => Promise<string>) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

async function checkNeon() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  try {
    const rows = await sql`select version() as v`;
    const exts = await sql`select extname from pg_extension order by extname`;
    const extNames = exts.map((e) => e.extname as string);
    const needed = ["vector", "pg_trgm", "uuid-ossp"];
    const missing = needed.filter((n) => !extNames.includes(n));
    return `ok · ${String(rows[0].v).split(" on ")[0]} · extensions present: [${extNames.join(", ")}] · missing: [${missing.join(", ") || "none"}]`;
  } finally {
    await sql.end({ timeout: 2 });
  }
}

async function checkAnthropic() {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 12,
    messages: [{ role: "user", content: "Reply with exactly: PONG" }],
  });
  const text = res.content.find((b) => b.type === "text")?.type === "text" ? (res.content[0] as { text: string }).text : "";
  return `ok · model=${res.model} · reply="${text.trim()}" · tokens=${res.usage.input_tokens}/${res.usage.output_tokens}`;
}

async function checkVoyage() {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: ["ping"], model: "voyage-3" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: Array<{ embedding: number[] }>; model: string; usage: { total_tokens: number } };
  return `ok · model=${data.model} · dim=${data.data[0].embedding.length} · tokens=${data.usage.total_tokens}`;
}

async function checkR2() {
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  await s3.send(new HeadBucketCommand({ Bucket: process.env.R2_BUCKET }));
  const list = await s3.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, MaxKeys: 3 }));
  return `ok · bucket=${process.env.R2_BUCKET} · objects_sample=${list.KeyCount ?? 0}`;
}

async function main() {
  await Promise.all([
    check("Neon", checkNeon),
    check("Anthropic", checkAnthropic),
    check("Voyage", checkVoyage),
    check("R2", checkR2),
  ]);

  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`[${mark}] ${r.name}: ${r.detail}`);
  }
  const failed = results.filter((r) => !r.ok).length;
  process.exit(failed ? 1 : 0);
}

main();
