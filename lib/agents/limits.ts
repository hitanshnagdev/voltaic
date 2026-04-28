/**
 * Constants and pure helpers for the agents surface that need to be
 * importable from BOTH server (lib/db/agents.ts) and client (the
 * ConfigurePanel slider). Kept in this dedicated module so client
 * imports don't transitively pull in the Postgres driver via
 * lib/db/agents.ts → lib/db/client.ts.
 */

export const RETRIEVAL_LIMIT_MIN = 4;
export const RETRIEVAL_LIMIT_MAX = 50;
export const RETRIEVAL_LIMIT_DEFAULT = 12;

export function clampRetrievalLimit(n: number): number {
  if (!Number.isFinite(n)) return RETRIEVAL_LIMIT_DEFAULT;
  return Math.max(
    RETRIEVAL_LIMIT_MIN,
    Math.min(RETRIEVAL_LIMIT_MAX, Math.round(n)),
  );
}
