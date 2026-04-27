import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { withWorkspace } from "./rls";
import { submittalSpecAssignments } from "./schema";

/**
 * Read + write helpers for `submittal_spec_assignments`.
 *
 * All writes go through `withWorkspace` so the RLS GUC is set; reads
 * are explicitly scoped on `workspace_id` in the WHERE clause for
 * defense-in-depth before the connection-role swap that arms RLS.
 */

export type AssignmentSource = "manual" | "auto-suggested" | "auto-applied";

export type AssignmentRow = {
  id: string;
  submittalDocumentId: string;
  specDocumentId: string;
  csiSection: string | null;
  source: AssignmentSource;
  confidence: number | null;
  notes: string | null;
  createdAt: Date;
};

export type AssignmentWithSpec = AssignmentRow & {
  specFilename: string;
  specCsiSections: string[];
};

/**
 * List all assignments for one submittal. Joins through `documents`
 * to pull the spec doc filename + identity-resolved CSI sections, so
 * the UI can render "assigned to spec-26-24-16-panelboards.pdf · §2.05"
 * without a second round-trip.
 */
export async function listAssignmentsForSubmittal(args: {
  workspaceId: string;
  submittalDocumentId: string;
}): Promise<AssignmentWithSpec[]> {
  const rows = (await db.execute(sql`
    SELECT
      a.id,
      a.submittal_document_id  AS "submittalDocumentId",
      a.spec_document_id       AS "specDocumentId",
      a.csi_section            AS "csiSection",
      a.source,
      a.confidence,
      a.notes,
      a.created_at             AS "createdAt",
      d.filename               AS "specFilename",
      COALESCE(
        (d.identity ->> 'csi_sections')::jsonb,
        '[]'::jsonb
      )                        AS "specCsiSections"
    FROM submittal_spec_assignments a
    JOIN documents d ON d.id = a.spec_document_id
    WHERE a.submittal_document_id = ${args.submittalDocumentId}::uuid
      AND a.workspace_id          = ${args.workspaceId}::uuid
    ORDER BY a.created_at DESC
  `)) as unknown as Array<{
    id: string;
    submittalDocumentId: string;
    specDocumentId: string;
    csiSection: string | null;
    source: AssignmentSource;
    confidence: string | number | null;
    notes: string | null;
    createdAt: Date;
    specFilename: string;
    specCsiSections: unknown;
  }>;
  return rows.map((r) => ({
    id: r.id,
    submittalDocumentId: r.submittalDocumentId,
    specDocumentId: r.specDocumentId,
    csiSection: r.csiSection,
    source: r.source,
    confidence: r.confidence != null ? Number(r.confidence) : null,
    notes: r.notes,
    createdAt: new Date(r.createdAt),
    specFilename: r.specFilename,
    specCsiSections: Array.isArray(r.specCsiSections)
      ? (r.specCsiSections as string[])
      : [],
  }));
}

/**
 * One row per (submittal, count) for a project — used by the documents
 * page to show "2 assignments" badges next to each submittal without
 * an N+1 query.
 */
export async function countAssignmentsByDocument(args: {
  workspaceId: string;
  projectId: string;
}): Promise<Map<string, number>> {
  const rows = (await db.execute(sql`
    SELECT
      a.submittal_document_id AS "submittalDocumentId",
      COUNT(*)::int           AS n
    FROM submittal_spec_assignments a
    JOIN documents d ON d.id = a.submittal_document_id
    WHERE a.workspace_id = ${args.workspaceId}::uuid
      AND d.project_id   = ${args.projectId}::uuid
    GROUP BY a.submittal_document_id
  `)) as unknown as Array<{ submittalDocumentId: string; n: number }>;
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.submittalDocumentId, Number(r.n));
  return out;
}

/**
 * Available specs for a project, with their identity-declared CSI
 * sections, so the assign UI can show "26 24 16 — Panelboards" picker
 * options without re-running the identity resolver.
 */
export type SpecOption = {
  documentId: string;
  filename: string;
  csiSections: string[];
};

export async function listSpecsForProject(args: {
  workspaceId: string;
  projectId: string;
}): Promise<SpecOption[]> {
  const rows = (await db.execute(sql`
    SELECT
      d.id                                          AS "documentId",
      d.filename                                    AS "filename",
      COALESCE((d.identity ->> 'csi_sections')::jsonb, '[]'::jsonb)
                                                    AS "csiSections"
    FROM documents d
    WHERE d.workspace_id = ${args.workspaceId}::uuid
      AND d.project_id   = ${args.projectId}::uuid
      AND d.doc_type     = 'spec'
    ORDER BY d.uploaded_at DESC
  `)) as unknown as Array<{
    documentId: string;
    filename: string;
    csiSections: unknown;
  }>;
  return rows.map((r) => ({
    documentId: r.documentId,
    filename: r.filename,
    csiSections: Array.isArray(r.csiSections)
      ? (r.csiSections as string[])
      : [],
  }));
}

export type AssignArgs = {
  workspaceId: string;
  submittalDocumentId: string;
  specDocumentId: string;
  csiSection: string | null;
  source?: AssignmentSource;
  confidence?: number | null;
  notes?: string | null;
};

/**
 * Create one assignment. Idempotent on the unique
 * (submittal, spec, csi_section) triple — re-asserting an existing
 * assignment doesn't error and doesn't update the timestamp. Returns
 * the existing or newly-created row id.
 *
 * Validates that both documents belong to the same workspace + project
 * before writing; cross-project assignments are rejected explicitly.
 */
export async function assignSubmittalToSpec(args: AssignArgs): Promise<{
  id: string;
  created: boolean;
}> {
  const validation = await db.execute(sql`
    SELECT
      sub.project_id  AS "subProject",
      sub.doc_type    AS "subType",
      spec.project_id AS "specProject",
      spec.doc_type   AS "specType"
    FROM documents sub
    JOIN documents spec ON spec.id = ${args.specDocumentId}::uuid
    WHERE sub.id = ${args.submittalDocumentId}::uuid
      AND sub.workspace_id = ${args.workspaceId}::uuid
      AND spec.workspace_id = ${args.workspaceId}::uuid
  `);
  const v = (validation as unknown as Array<{
    subProject: string;
    subType: string;
    specProject: string;
    specType: string;
  }>)[0];
  if (!v) throw new Error("documents not found in this workspace");
  if (v.subType !== "submittal")
    throw new Error("submittal_document_id must be a submittal");
  if (v.specType !== "spec")
    throw new Error("spec_document_id must be a spec");
  if (v.subProject !== v.specProject)
    throw new Error("submittal and spec must be in the same project");

  const inserted = await withWorkspace(args.workspaceId, async (tx) => {
    return tx
      .insert(submittalSpecAssignments)
      .values({
        workspaceId: args.workspaceId,
        submittalDocumentId: args.submittalDocumentId,
        specDocumentId: args.specDocumentId,
        csiSection: args.csiSection,
        source: args.source ?? "manual",
        confidence: args.confidence != null ? args.confidence.toFixed(3) : null,
        notes: args.notes ?? null,
      })
      .onConflictDoNothing({
        target: [
          submittalSpecAssignments.submittalDocumentId,
          submittalSpecAssignments.specDocumentId,
          submittalSpecAssignments.csiSection,
        ],
      })
      .returning({ id: submittalSpecAssignments.id });
  });

  if (inserted.length > 0) {
    return { id: inserted[0].id, created: true };
  }
  // Conflict path: pull the existing row so the caller still gets an id.
  const existing = await db
    .select({ id: submittalSpecAssignments.id })
    .from(submittalSpecAssignments)
    .where(
      and(
        eq(submittalSpecAssignments.submittalDocumentId, args.submittalDocumentId),
        eq(submittalSpecAssignments.specDocumentId, args.specDocumentId),
        args.csiSection
          ? eq(submittalSpecAssignments.csiSection, args.csiSection)
          : sql`csi_section IS NULL`,
      ),
    )
    .limit(1);
  return { id: existing[0]?.id ?? "", created: false };
}

/**
 * Remove one assignment by id. Returns true when a row was deleted.
 * Workspace-scoped to prevent cross-tenant deletion via id guessing.
 */
export async function unassignById(args: {
  workspaceId: string;
  assignmentId: string;
}): Promise<boolean> {
  const deleted = await withWorkspace(args.workspaceId, async (tx) => {
    return tx
      .delete(submittalSpecAssignments)
      .where(
        and(
          eq(submittalSpecAssignments.id, args.assignmentId),
          eq(submittalSpecAssignments.workspaceId, args.workspaceId),
        ),
      )
      .returning({ id: submittalSpecAssignments.id });
  });
  return deleted.length > 0;
}
