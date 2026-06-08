import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import { projects, transcripts } from "@/lib/db/schema";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";
import { putObject } from "@/lib/r2/client";

export const runtime = "nodejs";
export const maxDuration = 60;

async function resolveProject(orgId: string) {
  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) return { workspace: null, project: null };
  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspace.id))
    .limit(1);
  return { workspace, project: projectRows[0] ?? null };
}

// List transcripts for the current project.
export async function GET() {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const { workspace, project } = await resolveProject(orgId);
  if (!workspace || !project) {
    return NextResponse.json({ transcripts: [] });
  }
  const rows = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.projectId, project.id))
    .orderBy(desc(transcripts.createdAt));
  return NextResponse.json({ transcripts: rows });
}

// Create a transcript from pasted text (manual upload). Stores the raw text
// in R2, inserts a `transcripts` row, and kicks off the ingest pipeline.
export async function POST(req: Request) {
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }
  const { workspace, project } = await resolveProject(orgId);
  if (!workspace) {
    return NextResponse.json({ error: "workspace_not_found" }, { status: 404 });
  }
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as {
    title?: unknown;
    text?: unknown;
  } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }
  const title =
    typeof body?.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Untitled meeting";

  const sha256 = createHash("sha256").update(text).digest("hex");
  const r2Key = `workspaces/${workspace.id}/projects/${project.id}/transcripts/${sha256.slice(0, 12)}.txt`;

  try {
    await putObject({
      key: r2Key,
      body: Buffer.from(text, "utf-8"),
      contentType: "text/plain; charset=utf-8",
    });
  } catch (err) {
    console.error("r2_put_failed", err);
    return NextResponse.json({ error: "r2_upload_failed" }, { status: 502 });
  }

  const [row] = await db
    .insert(transcripts)
    .values({
      workspaceId: workspace.id,
      projectId: project.id,
      sourceType: "manual_upload",
      title,
      r2Key,
      contentSha256: sha256,
      status: "pending",
    })
    .returning();

  await inngest.send({
    name: "transcript/uploaded",
    data: {
      transcriptId: row.id,
      workspaceId: workspace.id,
      projectId: project.id,
    },
  });

  return NextResponse.json({ transcript: row });
}
