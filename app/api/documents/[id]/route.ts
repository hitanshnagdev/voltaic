import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";
import { deleteObject } from "@/lib/r2/client";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { orgId } = await auth();
  if (!orgId) {
    return NextResponse.json({ error: "not_signed_in" }, { status: 401 });
  }

  const workspace = await getWorkspaceByClerkOrg(orgId);
  if (!workspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.id, id), eq(documents.workspaceId, workspace.id)),
    )
    .limit(1);
  const doc = rows[0];
  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    await deleteObject(doc.r2Key);
  } catch (err) {
    console.error("r2_delete_failed", err);
    // Continue with DB delete so the UI doesn't get stuck on a phantom row.
  }

  await db.delete(documents).where(eq(documents.id, id));

  return NextResponse.json({ ok: true });
}
