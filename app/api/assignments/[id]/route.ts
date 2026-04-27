import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { unassignById } from "@/lib/db/assignments";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";

export const runtime = "nodejs";

/**
 * DELETE /api/assignments/[id]
 *
 * Removes one submittal-to-spec assignment. Workspace-scoped to
 * prevent cross-tenant deletion via id guessing.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) {
    return NextResponse.json(
      { error: "workspace_not_found" },
      { status: 404 },
    );
  }

  const { id } = await ctx.params;
  const removed = await unassignById({
    workspaceId: workspace.id,
    assignmentId: id,
  });
  return NextResponse.json({ removed });
}
