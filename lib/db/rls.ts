import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./client";

/**
 * Run a block with `app.current_workspace_id` set for the duration of a
 * transaction. RLS policies on tenant-scoped tables gate rows via this GUC.
 *
 * Today (Phase 1) the connection role has BYPASSRLS, so this is a no-op
 * guardrail that's safe to scatter through the codebase. In Phase 10 we
 * switch to a restricted role and the same callsites become enforcement.
 *
 * Usage:
 *   const docs = await withWorkspace(workspaceId, async (tx) => {
 *     return tx.select().from(documents).where(eq(documents.projectId, pid));
 *   });
 */
export async function withWorkspace<T>(
  workspaceId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_workspace_id', ${workspaceId}, true)`,
    );
    return fn(tx);
  });
}
