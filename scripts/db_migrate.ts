/**
 * Apply SQL migrations in a deterministic order:
 *   1. drizzle/pre/*.sql   (sorted) — things that must exist BEFORE Drizzle
 *                                     schema migrations run (extensions).
 *   2. drizzle/[0-9]*.sql  (sorted) — Drizzle-generated schema migrations.
 *   3. drizzle/post/*.sql  (sorted) — things that depend on tables existing
 *                                     (RLS policies, triggers, etc).
 *
 * Idempotent: tracked via the `voltaic_migrations` table.
 *
 * Intentionally does NOT use drizzle-kit's own migrator. The pre/gen/post
 * layering is simpler to reason about as plain SQL files.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const ROOT = "drizzle";

function listSql(dir: string) {
  if (!existsSync(dir)) return [] as string[];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Resolve DATABASE_URL with explicit precedence:
 *   1. process.env.DATABASE_URL — lets ops do one-shot prod migrations via
 *      `DATABASE_URL='<prod>' npm run db:migrate` without touching .env.local.
 *   2. .env.local — the dev default; what `npm run db:migrate` reads bare.
 *
 * Logs the masked URL host so the operator can confirm which database
 * they're about to write to before the script proceeds.
 */
function resolveDatabaseUrl(): string {
  const fromEnv = process.env.DATABASE_URL;
  if (fromEnv) return fromEnv;
  if (!existsSync(".env.local")) {
    throw new Error(
      "DATABASE_URL not set in process.env and no .env.local present",
    );
  }
  const env = readFileSync(".env.local", "utf8");
  const m = env.match(/^DATABASE_URL=(.+)$/m);
  if (!m) {
    throw new Error(
      "DATABASE_URL not set in process.env and not found in .env.local",
    );
  }
  return m[1];
}

async function main() {
  const databaseUrl = resolveDatabaseUrl();
  // Mask credentials when echoing — the operator just needs to confirm
  // the host (Neon shows distinct hostnames per env).
  const masked = databaseUrl.replace(/\/\/[^@]+@/, "//***:***@");
  console.log(`migrator → ${masked}`);
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql.unsafe(`
      create table if not exists voltaic_migrations (
        id text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (
        await sql<{ id: string }[]>`select id from voltaic_migrations`
      ).map((r) => r.id),
    );

    const files = [
      ...listSql(join(ROOT, "pre")).map((f) => ({
        id: `pre/${f}`,
        path: join(ROOT, "pre", f),
      })),
      ...readdirSync(ROOT)
        .filter((f) => /^\d+.*\.sql$/.test(f))
        .sort()
        .map((f) => ({ id: f, path: join(ROOT, f) })),
      ...listSql(join(ROOT, "post")).map((f) => ({
        id: `post/${f}`,
        path: join(ROOT, "post", f),
      })),
    ];

    for (const f of files) {
      if (applied.has(f.id)) {
        console.log(`= ${f.id} (already applied)`);
        continue;
      }
      console.log(`> ${f.id}`);
      const body = readFileSync(f.path, "utf8");
      // Drizzle-generated files use `--> statement-breakpoint` separators.
      const statements = body
        .split(/-->\s*statement-breakpoint/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await sql.unsafe(stmt);
      }
      await sql`insert into voltaic_migrations (id) values (${f.id})`;
    }

    console.log("migrations up-to-date.");
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
