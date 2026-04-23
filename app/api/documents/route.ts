import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { documents, projects } from "@/lib/db/schema";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";

export const runtime = "nodejs";

export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) {
    return NextResponse.json({ documents: [] });
  }

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspace.id))
    .limit(1);
  const project = projectRows[0];
  if (!project) {
    return NextResponse.json({ documents: [] });
  }

  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.projectId, project.id))
    .orderBy(desc(documents.uploadedAt));

  return NextResponse.json({ documents: rows });
}
