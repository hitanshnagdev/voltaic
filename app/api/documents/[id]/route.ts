import { auth } from "@clerk/nextjs/server";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import { withWorkspace } from "@/lib/db/rls";
import {
  documents,
  drawingAnnotations,
  specChecklistItems,
  specParagraphs,
  submittalChecklistResponses,
  submittalFields,
  submittalSpecAssignments,
} from "@/lib/db/schema";
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

type ReclassifyTarget = "spec" | "submittal" | "other";

const VALID_TARGETS: ReadonlySet<ReclassifyTarget> = new Set([
  "spec",
  "submittal",
  "other",
]);

/**
 * PATCH /api/documents/[id]
 *
 * Manual reclassification override. Body: `{ docType: 'spec' | 'submittal' | 'other' }`.
 *
 * The PM uses this when auto-classify gets it wrong. Destructive: any
 * extracted artifacts derived from the *previous* doc_type are cleaned
 * up (paragraphs / checklist / fields / assignments / drawing
 * annotations). FK cascades take care of deeper levels (responses
 * vanish with their parent assignment, checklist items vanish with
 * their parent paragraph). Document_pages stay — they're shared
 * infrastructure (text + raster) reused by every parser.
 *
 * Re-fires `document/<new-type>-classified` so the matching parser
 * re-runs. Content-hash caches mean reclassifying back to a previously
 * seen type costs zero LLM tokens.
 */
export async function PATCH(
  req: Request,
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

  let body: { docType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const target = body.docType as ReclassifyTarget | undefined;
  if (!target || !VALID_TARGETS.has(target)) {
    return NextResponse.json(
      { error: "invalid_doc_type", allowed: Array.from(VALID_TARGETS) },
      { status: 400 },
    );
  }

  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.workspaceId, workspace.id)))
    .limit(1);
  const doc = rows[0];
  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const previous = doc.docType;
  if (previous === target) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  await withWorkspace(workspace.id, async (tx) => {
    // Cleanup of artifacts derived from the previous classification.
    // Each branch deletes only the rows directly attached to this
    // document; deeper FK cascades handle dependents.
    if (previous === "spec") {
      await tx
        .delete(specChecklistItems)
        .where(eq(specChecklistItems.documentId, id));
      await tx
        .delete(specParagraphs)
        .where(eq(specParagraphs.documentId, id));
      // Assignments pointing at this doc as a spec become orphaned.
      await tx
        .delete(submittalSpecAssignments)
        .where(eq(submittalSpecAssignments.specDocumentId, id));
    } else if (previous === "submittal") {
      await tx
        .delete(submittalChecklistResponses)
        .where(eq(submittalChecklistResponses.submittalDocumentId, id));
      await tx
        .delete(submittalFields)
        .where(eq(submittalFields.documentId, id));
      await tx
        .delete(submittalSpecAssignments)
        .where(eq(submittalSpecAssignments.submittalDocumentId, id));
    } else if (previous === "drawing") {
      await tx
        .delete(drawingAnnotations)
        .where(eq(drawingAnnotations.documentId, id));
    }

    await tx
      .update(documents)
      .set({
        docType: target,
        // 'pending' triggers the new parser; 'ready' if there's
        // nothing to do (target = 'other').
        status: target === "other" ? "ready" : "pending",
      })
      .where(eq(documents.id, id));
  });

  if (target === "spec") {
    await inngest.send({
      name: "document/spec-classified",
      data: {
        documentId: id,
        workspaceId: workspace.id,
        projectId: doc.projectId,
      },
    });
  } else if (target === "submittal") {
    await inngest.send({
      name: "document/submittal-classified",
      data: {
        documentId: id,
        workspaceId: workspace.id,
        projectId: doc.projectId,
      },
    });
  }

  return NextResponse.json({ ok: true, previous, current: target });
}
