import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { hashCache } from "@/lib/db/schema";

/**
 * Cross-workspace cache keyed on (purpose, content_sha256).
 *
 * Why this is safe across tenants: we cache the deterministic output of pure
 * functions over content bytes (classify a PDF page, parse a Div-XX
 * paragraph, embed a chunk). If the bytes are identical, so is the output.
 * We never cache anything that depends on project or user state.
 *
 * This is what makes Voltaic cheap at scale: Division-26 boilerplate repeats
 * across projects by the hundreds, and submittal datasheets are literally
 * vendor PDFs — one parse per datasheet, forever.
 */

export type CachePurpose =
  | "classify_page"
  | "classify_document"
  | "parse_spec_paragraph"
  | "parse_submittal_field"
  | "parse_drawing_annotation"
  | "identity"
  | "embed"
  // Versioned variants for prompt-driven caches. The version suffix is
  // a short prompt hash so prompt edits auto-invalidate prior entries
  // without needing manual cache busts. Format: "<base>/v:<8-12 hex>".
  // See parse-submittal.ts VISION_CACHE_PURPOSE for the canonical use.
  | `${string}/v:${string}`;

const keyFor = (purpose: CachePurpose, sha256: string) =>
  `${purpose}:${sha256}`;

export async function getCached<T>(
  purpose: CachePurpose,
  sha256: string,
): Promise<T | null> {
  const rows = await db
    .select()
    .from(hashCache)
    .where(eq(hashCache.key, keyFor(purpose, sha256)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  // Fire-and-forget: bump hit counter. We don't await because we don't want
  // cache maintenance to gate the caller.
  void db
    .update(hashCache)
    .set({
      hitCount: sql`${hashCache.hitCount} + 1`,
      lastUsedAt: sql`now()`,
    })
    .where(eq(hashCache.key, row.key))
    .catch(() => {
      // ignore — stale hit counts are non-fatal
    });

  return row.payload as T;
}

export async function setCached<T>(params: {
  purpose: CachePurpose;
  sha256: string;
  payload: T;
  tokenCost?: number;
}): Promise<void> {
  const { purpose, sha256, payload, tokenCost } = params;
  await db
    .insert(hashCache)
    .values({
      key: keyFor(purpose, sha256),
      purpose,
      contentSha256: sha256,
      payload: payload as unknown as object,
      tokenCost: tokenCost ?? null,
    })
    .onConflictDoUpdate({
      target: hashCache.key,
      set: {
        payload: payload as unknown as object,
        lastUsedAt: sql`now()`,
      },
    });
}

/**
 * Memoize an expensive async operation keyed on content bytes.
 *
 *   const cls = await memoize("classify_page", pageSha, () =>
 *     anthropic.classify(pageBytes),
 *   );
 */
export async function memoize<T>(
  purpose: CachePurpose,
  sha256: string,
  compute: () => Promise<{ payload: T; tokenCost?: number }>,
): Promise<T> {
  const hit = await getCached<T>(purpose, sha256);
  if (hit !== null) return hit;

  const { payload, tokenCost } = await compute();
  await setCached({ purpose, sha256, payload, tokenCost });
  return payload;
}

/**
 * Quick stats for the /stats endpoint we'll build in a later PR.
 */
export async function cacheStats() {
  return db
    .select({
      purpose: hashCache.purpose,
      entries: sql<number>`count(*)::int`,
      totalHits: sql<number>`coalesce(sum(${hashCache.hitCount})::int, 0)`,
      totalTokensSaved: sql<number>`
        coalesce(sum(${hashCache.tokenCost} * ${hashCache.hitCount})::int, 0)
      `,
    })
    .from(hashCache)
    .groupBy(hashCache.purpose);
}

export async function clearPurpose(purpose: CachePurpose) {
  await db.delete(hashCache).where(eq(hashCache.purpose, purpose));
}

export async function clearBySha(purpose: CachePurpose, sha256: string) {
  await db
    .delete(hashCache)
    .where(
      and(
        eq(hashCache.purpose, purpose),
        eq(hashCache.contentSha256, sha256),
      ),
    );
}
