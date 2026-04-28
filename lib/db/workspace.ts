import "server-only";
import { and, eq } from "drizzle-orm";
import { COMPLIANCE_REVIEWER_SEED } from "@/lib/agents/defaults";
import { db } from "./client";
import { agents, documents, projects, workspaces } from "./schema";

/**
 * Ensure a workspace + default project exist for the given Clerk org.
 * Idempotent — safe to call on every request.
 */
export async function ensureWorkspace(params: {
  clerkOrgId: string;
  orgName: string;
}) {
  const { clerkOrgId, orgName } = params;

  const existing = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.clerkOrgId, clerkOrgId))
    .limit(1);

  let workspace = existing[0];
  if (!workspace) {
    const inserted = await db
      .insert(workspaces)
      .values({ clerkOrgId, name: orgName })
      .returning();
    workspace = inserted[0];
  }

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspace.id))
    .limit(1);

  let project = projectRows[0];
  if (!project) {
    const inserted = await db
      .insert(projects)
      .values({ workspaceId: workspace.id, name: "Untitled project" })
      .returning();
    project = inserted[0];
  }

  await ensureDefaultAgent(workspace.id);

  return { workspace, project };
}

/**
 * Ensure the seeded Compliance Reviewer agent exists for the workspace.
 * Idempotent — the partial unique index `agents_workspace_default_idx`
 * guarantees at most one default per workspace, so a duplicate insert
 * would error; we check first.
 */
export async function ensureDefaultAgent(workspaceId: string) {
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.workspaceId, workspaceId), eq(agents.isDefault, true)))
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(agents)
    .values({ workspaceId, ...COMPLIANCE_REVIEWER_SEED })
    .returning({ id: agents.id });
  return inserted[0];
}

export async function getWorkspaceByClerkOrg(clerkOrgId: string) {
  const rows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.clerkOrgId, clerkOrgId))
    .limit(1);
  return rows[0];
}

export async function getDocuments(params: {
  workspaceId: string;
  projectId: string;
}) {
  return db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, params.workspaceId),
        eq(documents.projectId, params.projectId),
      ),
    )
    .orderBy(documents.uploadedAt);
}
