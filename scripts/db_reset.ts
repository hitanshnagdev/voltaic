/**
 * DESTRUCTIVE — drops and recreates the `public` schema on DATABASE_URL.
 * Refuses to run without --yes.
 *
 * Usage:
 *   npx tsx scripts/db_reset.ts --yes
 *
 * Intended for dev/preview branches only. Never point this at production.
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";

async function main() {
  const yes = process.argv.includes("--yes");
  if (!yes) {
    console.error(
      "refusing to run without --yes (drops the `public` schema)",
    );
    process.exit(2);
  }

  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) throw new Error("DATABASE_URL not in .env.local");
  const url = m[1];

  // Guard against accidentally nuking a prod URL.
  if (!/dev|preview|branch/i.test(url) && !/neon\.tech/.test(url)) {
    console.error(
      "DATABASE_URL does not look like a dev URL; refusing. " +
        "Add `dev` to the hostname/comment or edit this guard.",
    );
    process.exit(2);
  }

  const sql = postgres(url, { max: 1 });
  try {
    console.log(`resetting public schema on ${new URL(url).host} ...`);
    await sql.unsafe(`drop schema if exists public cascade`);
    await sql.unsafe(`create schema public`);
    await sql.unsafe(`grant all on schema public to public`);
    console.log("public schema recreated.");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
