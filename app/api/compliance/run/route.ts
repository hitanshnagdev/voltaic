import { auth } from "@clerk/nextjs/server";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import { withWorkspace } from "@/lib/db/rls";
import {
  documents,
  specChecklistItems,
  submittalSpecAssignments,
} from "@/lib/db/schema";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";

export const runtime = "nodejs";

/**
 * POST /api/compliance/run
 *
 * Body: { submittalDocumentId, specDocumentId, csiSection?: string|null }
 *
 * Triggers guided extraction for one (submittal × spec) assignment.
 * The user clicks "Run Compliance" on /compare and this endpoint fires
 * the same Inngest event the auto-trigger used to send — except now
 * it's deliberate, attributable, and gated.
 *
 * Returns 404 when the assignment doesn't exist, 409 when the spec
 * checklist hasn't been parsed yet (extraction would no-op), 200 once
 * the event is queued. The client polls /compare until responses
 * appear in the DB.
 */
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const submittalDocumentId =
    typeof b.submittalDocumentId === "string" ? b.submittalDocumentId : null;
  const specDocumentId =
    typeof b.specDocumentId === "string" ? b.specDocumentId : null;
  if (!submittalDocumentId || !specDocumentId) {
    return NextResponse.json(
      { error: "missing_document_ids" },
      { status: 400 },
    );
  }
  const csiSection =
    typeof b.csiSection === "string" && b.csiSection.trim().length > 0
      ? b.csiSection.trim()
      : null;

  // Validate the assignment exists in this workspace. Defends against
  // PMs running compliance against a pair they don't own (defense in
  // depth — RLS will catch this once the role swap lands).
  const assignmentConds = [
    eq(submittalSpecAssignments.workspaceId, workspace.id),
    eq(submittalSpecAssignments.submittalDocumentId, submittalDocumentId),
    eq(submittalSpecAssignments.specDocumentId, specDocumentId),
  ];
  if (csiSection) {
    assignmentConds.push(eq(submittalSpecAssignments.csiSection, csiSection));
  } else {
    assignmentConds.push(sql`${submittalSpecAssignments.csiSection} IS NULL`);
  }
  const assignmentRows = await db
    .select({ id: submittalSpecAssignments.id })
    .from(submittalSpecAssignments)
    .where(and(...assignmentConds))
    .limit(1);
  if (assignmentRows.length === 0) {
    return NextResponse.json({ error: "assignment_not_found" }, { status: 404 });
  }
  const assignmentId = assignmentRows[0].id;

  // Resolve project for the submittal so the event payload matches the
  // shape extract-against-checklist expects.
  const subRows = await db
    .select({ projectId: documents.projectId })
    .from(documents)
    .where(
      and(
        eq(documents.id, submittalDocumentId),
        eq(documents.workspaceId, workspace.id),
      ),
    )
    .limit(1);
  const projectId = subRows[0]?.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "submittal_not_found" }, { status: 404 });
  }

  // Pre-flight check: the runner exits gracefully when the checklist
  // hasn't been parsed yet, but returning 409 here gives the UI a clean
  // "checklist still parsing — try again in a moment" affordance
  // instead of silently no-opping.
  const checklistConds = [eq(specChecklistItems.documentId, specDocumentId)];
  if (csiSection) {
    checklistConds.push(eq(specChecklistItems.csiSection, csiSection));
  }
  const itemCount = await db
    .select({ id: specChecklistItems.id })
    .from(specChecklistItems)
    .where(and(...checklistConds))
    .limit(1);
  if (itemCount.length === 0) {
    return NextResponse.json(
      { error: "checklist_not_ready" },
      { status: 409 },
    );
  }

  // Flip the assignment to 'queued' before firing the event. The
  // extract function will move it to 'running' once it actually
  // starts work and 'ready' / 'failed' on terminal state. The UI
  // polls /compare and renders an in-progress panel while the
  // status is queued or running — survives browser refresh because
  // the source of truth lives in the DB, not in client state.
  await withWorkspace(workspace.id, async (tx) => {
    await tx
      .update(submittalSpecAssignments)
      .set({ complianceRunStatus: "queued" })
      .where(eq(submittalSpecAssignments.id, assignmentId));
  });

  await inngest.send({
    name: "submittal/extract-against-checklist-ready",
    data: {
      submittalDocumentId,
      specDocumentId,
      csiSection,
      workspaceId: workspace.id,
      projectId,
    },
  });

  return NextResponse.json({ ok: true, queued: true, assignmentId });
}
