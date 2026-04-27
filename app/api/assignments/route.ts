import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { inngest } from "@/inngest/client";
import {
  assignSubmittalToSpec,
  type AssignmentSource,
} from "@/lib/db/assignments";
import { db } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { getWorkspaceByClerkOrg } from "@/lib/db/workspace";

export const runtime = "nodejs";

/**
 * POST /api/assignments
 *
 * Body: { submittalDocumentId, specDocumentId, csiSection?, source?, notes? }
 *
 * Creates a submittal-to-spec assignment. Idempotent on the
 * (submittal, spec, csi_section) triple — re-asserting the same triple
 * returns the existing row id with `created: false`.
 *
 * Rejects cross-project assignments and validates that both ids point
 * at the right `doc_type`.
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
  const source: AssignmentSource =
    b.source === "auto-suggested" || b.source === "auto-applied"
      ? b.source
      : "manual";
  const notes = typeof b.notes === "string" ? b.notes : null;

  try {
    const result = await assignSubmittalToSpec({
      workspaceId: workspace.id,
      submittalDocumentId,
      specDocumentId,
      csiSection,
      source,
      notes,
    });

    // Fire the guided-extraction event. Even on a no-op (created=false)
    // we re-fire — the runner is idempotent and will pick up any
    // checklist changes since the last extraction. Cheap insurance
    // against the spec-was-re-parsed-after-assignment race.
    const subRows = await db
      .select({ projectId: documents.projectId })
      .from(documents)
      .where(eq(documents.id, submittalDocumentId))
      .limit(1);
    const projectId = subRows[0]?.projectId;
    if (projectId) {
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
    }

    return NextResponse.json({ assignment: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "assign_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
