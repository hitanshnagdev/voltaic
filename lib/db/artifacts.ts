import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { artifacts, documents, equipment, findings, type Artifact } from "./schema";

/**
 * Artifact service — the single seam through which deliverables are created,
 * so the autonomous workflow toggles AND the future action copilot call the
 * same code (no divergent paths). Chunk 1: RFI-from-finding, assembled
 * deterministically from the finding (no LLM) so it's instant and reliable.
 */

export type RfiReference = {
  label: string;
  documentName: string | null;
  pageNum: number | null;
  snippet: string | null;
  sourceKind: string;
};

export type RfiContent = {
  subject: string;
  equipment: string;
  question: string;
  rationale: string;
  references: RfiReference[];
};

type RawEvidence = {
  documentId?: string | null;
  pageNum?: number | null;
  snippet?: string | null;
  sourceKind?: string;
  role?: string;
};

function refLabel(sourceKind: string | undefined): string {
  switch (sourceKind) {
    case "spec_paragraph":
      return "Spec";
    case "submittal_field":
    case "submittal_response":
      return "Submittal";
    case "transcript_utterance":
      return "Meeting";
    case "project_setting":
      return "Project setting";
    default:
      return "Source";
  }
}

export async function createRfiFromFinding(params: {
  workspaceId: string;
  projectId: string;
  findingId: string;
}): Promise<Artifact | null> {
  const { workspaceId, projectId, findingId } = params;

  const rows = await db
    .select()
    .from(findings)
    .where(and(eq(findings.id, findingId), eq(findings.projectId, projectId)))
    .limit(1);
  const f = rows[0];
  if (!f) return null;

  const ev = (f.evidence ?? []) as RawEvidence[];
  const docIds = Array.from(
    new Set(ev.map((e) => e.documentId).filter((x): x is string => !!x)),
  );
  const eqIds = f.equipmentIds ?? [];

  const [docs, eqRows] = await Promise.all([
    docIds.length
      ? db
          .select({ id: documents.id, filename: documents.filename })
          .from(documents)
          .where(inArray(documents.id, docIds))
      : Promise.resolve<{ id: string; filename: string }[]>([]),
    eqIds.length
      ? db
          .select({ id: equipment.id, tag: equipment.tag })
          .from(equipment)
          .where(inArray(equipment.id, eqIds))
      : Promise.resolve<{ id: string; tag: string | null }[]>([]),
  ]);
  const nameById = new Map(docs.map((d) => [d.id, d.filename]));
  const tags = eqRows
    .map((e) => e.tag)
    .filter((t): t is string => !!t && t.trim().length > 0);
  const equipmentLabel = tags.join(", ");

  const references: RfiReference[] = ev.map((e) => ({
    label: refLabel(e.sourceKind),
    documentName: e.documentId ? (nameById.get(e.documentId) ?? null) : null,
    pageNum: e.pageNum ?? null,
    snippet: e.snippet ?? null,
    sourceKind: e.sourceKind ?? "unknown",
  }));

  const content: RfiContent = {
    subject: f.title,
    equipment: equipmentLabel,
    question: `Please confirm and direct resolution: ${f.summary}`,
    rationale: f.summary,
    references,
  };

  const [row] = await db
    .insert(artifacts)
    .values({
      workspaceId,
      projectId,
      type: "rfi",
      title: equipmentLabel ? `RFI · ${equipmentLabel}` : `RFI · ${f.title}`,
      status: "draft",
      content: content as unknown as Record<string, unknown>,
      findingIds: [f.id],
      sourceDocumentIds: docIds,
      trigger: { kind: "manual", fromFindingId: f.id },
    })
    .returning();
  return row;
}

export async function listArtifactsForProject(params: {
  workspaceId: string;
  projectId: string;
}): Promise<Artifact[]> {
  return db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.workspaceId, params.workspaceId),
        eq(artifacts.projectId, params.projectId),
      ),
    )
    .orderBy(desc(artifacts.createdAt));
}

export async function getArtifact(params: {
  workspaceId: string;
  id: string;
}): Promise<Artifact | null> {
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      and(eq(artifacts.id, params.id), eq(artifacts.workspaceId, params.workspaceId)),
    )
    .limit(1);
  return rows[0] ?? null;
}
