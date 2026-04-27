import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { listAssignmentsForSubmittal } from "@/lib/db/assignments";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";

export const runtime = "nodejs";

/**
 * GET /api/documents/[id]/assignments
 *
 * Returns the spec assignments for one submittal (with spec filename
 * + identity-resolved CSI sections joined in). Used by the docs page
 * assign modal to render existing assignments before letting the user
 * add a new one.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) {
    return NextResponse.json({ assignments: [] });
  }

  const { id } = await ctx.params;
  const assignments = await listAssignmentsForSubmittal({
    workspaceId: workspace.id,
    submittalDocumentId: id,
  });
  return NextResponse.json({ assignments });
}
