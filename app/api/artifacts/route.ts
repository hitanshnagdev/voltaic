import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";
import {
  createComplianceReportFromProject,
  createRfiFromFinding,
  listArtifactsForProject,
} from "@/lib/db/artifacts";

export const runtime = "nodejs";

async function resolveProject(orgId: string) {
  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) return { workspace: null, project: null };
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspace.id))
    .limit(1);
  return { workspace, project: rows[0] ?? null };
}

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const { workspace, project } = await resolveProject(orgId);
  if (!workspace || !project) return NextResponse.json({ artifacts: [] });
  const artifacts = await listArtifactsForProject({
    workspaceId: workspace.id,
    projectId: project.id,
  });
  return NextResponse.json({ artifacts });
}

// Create an artifact. Chunk 1: { type: "rfi", findingId } → RFI from a finding.
export async function POST(req: Request) {
  const { orgId } = await auth();
  if (!orgId) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  const { workspace, project } = await resolveProject(orgId);
  if (!workspace) return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  if (!project) return NextResponse.json({ error: "project_not_found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    type?: unknown;
    findingId?: unknown;
  } | null;
  const type = typeof body?.type === "string" ? body.type : "";
  const findingId = typeof body?.findingId === "string" ? body.findingId : "";

  let artifact = null;
  if (type === "rfi" && findingId) {
    artifact = await createRfiFromFinding({
      workspaceId: workspace.id,
      projectId: project.id,
      findingId,
    });
  } else if (type === "compliance_report") {
    artifact = await createComplianceReportFromProject({
      workspaceId: workspace.id,
      projectId: project.id,
    });
  } else {
    return NextResponse.json({ error: "unsupported_request" }, { status: 400 });
  }

  if (!artifact) {
    return NextResponse.json({ error: "not_created" }, { status: 404 });
  }
  return NextResponse.json({ artifact });
}
