import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./client";
import { workspaceSettings } from "./schema";

/**
 * Standing-Workflow toggles per workspace. Plain-English automations checked
 * at the end of the relevant Inngest function. Additive — add a key here +
 * a default, render it in the toggles UI, and check it in the pipeline.
 */
export type WorkspaceSettings = {
  // When a meeting contradicts the spec, auto-draft the RFI.
  autoRfiOnContradiction: boolean;
};

export const DEFAULT_SETTINGS: WorkspaceSettings = {
  autoRfiOnContradiction: false,
};

export async function getWorkspaceSettings(
  workspaceId: string,
): Promise<WorkspaceSettings> {
  const rows = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, workspaceId))
    .limit(1);
  const stored = (rows[0]?.settings ?? {}) as Partial<WorkspaceSettings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  patch: Partial<WorkspaceSettings>,
): Promise<WorkspaceSettings> {
  const current = await getWorkspaceSettings(workspaceId);
  const next: WorkspaceSettings = { ...current, ...patch };
  await db
    .insert(workspaceSettings)
    .values({
      workspaceId,
      settings: next as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: {
        settings: next as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    });
  return next;
}
