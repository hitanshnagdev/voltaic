import { readFileSync } from "node:fs";
import postgres from "postgres";

async function main() {
  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not in .env.local");
  const sql = postgres(m[1], { max: 1 });
  try {
    await sql`create extension if not exists pg_trgm`;
    await sql`create extension if not exists pgcrypto`;
    const ext = await sql`select extname from pg_extension order by extname`;
    console.log("extensions:", ext.map((e) => e.extname).join(", "));
    const test = await sql`select gen_random_uuid() as id`;
    console.log("gen_random_uuid:", test[0].id);
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
