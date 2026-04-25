import { createHash } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import { documents, projects } from "@/lib/db/schema";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";
import { putObject } from "@/lib/r2/client";
import { bytesToMb, getMaxUploadBytes } from "@/lib/upload/limits";

export const runtime = "nodejs";
// 60s should cover a ~40MB PDF on dev bandwidth; bump later if needed.
export const maxDuration = 60;

export async function POST(req: Request) {
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

  const projectRows = await db
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspace.id))
    .limit(1);
  const project = projectRows[0];
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }

  const maxBytes = getMaxUploadBytes();
  if (file.size > maxBytes) {
    return NextResponse.json(
      {
        error: "file_too_large",
        message: `File "${file.name}" is ${bytesToMb(file.size)} MB; the upload limit is ${bytesToMb(maxBytes)} MB.`,
        filename: file.name,
        sizeBytes: file.size,
        maxBytes,
        maxMb: bytesToMb(maxBytes),
      },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const r2Key = `workspaces/${workspace.id}/projects/${project.id}/${sha256.slice(0, 12)}-${file.name}`;

  try {
    await putObject({
      key: r2Key,
      body: buf,
      contentType: file.type || "application/octet-stream",
    });
  } catch (err) {
    console.error("r2_put_failed", err);
    return NextResponse.json({ error: "r2_upload_failed" }, { status: 502 });
  }

  const [row] = await db
    .insert(documents)
    .values({
      workspaceId: workspace.id,
      projectId: project.id,
      r2Key,
      filename: file.name,
      contentSha256: sha256,
      sizeBytes: file.size,
      mimeType: file.type || null,
      status: "pending",
    })
    .returning();

  await inngest.send({
    name: "document/uploaded",
    data: {
      documentId: row.id,
      workspaceId: workspace.id,
      projectId: project.id,
    },
  });

  return NextResponse.json({ document: row });
}
