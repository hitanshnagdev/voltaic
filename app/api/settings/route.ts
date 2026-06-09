import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  type WorkspaceSettings,
} from "@/lib/db/settings";

export const runtime = "nodejs";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  const settings = await getWorkspaceSettings(workspace.id);
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Partial<WorkspaceSettings> | null;
  const patch: Partial<WorkspaceSettings> = {};
  if (typeof body?.autoRfiOnContradiction === "boolean") {
    patch.autoRfiOnContradiction = body.autoRfiOnContradiction;
  }
  const settings = await updateWorkspaceSettings(workspace.id, patch);
  return NextResponse.json({ settings });
}
