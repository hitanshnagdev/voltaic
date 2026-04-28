import "server-only";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { projects, workspaces } from "@/lib/db/schema";

export type AuthedContext = {
  workspaceId: string;
  projectId: string;
};

/**
 * Resolve the current user's workspace + active project from the Clerk
 * org. Returns null when not signed in, no org selected, or workspace
 * not provisioned. Used by every /api/agents/* route — replaces a
 * 5-line copypasta with one call.
 */
export async function resolveAuthedContext(): Promise<AuthedContext | null> {
  const { orgId } = await auth();
  if (!orgId) return null;

  const wsRows = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.clerkOrgId, orgId))
    .limit(1);
  const workspace = wsRows[0];
  if (!workspace) return null;

  const projRows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.workspaceId, workspace.id))
    .limit(1);
  const project = projRows[0];
  if (!project) return null;

  return { workspaceId: workspace.id, projectId: project.id };
}
