import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { artifacts, documents, equipment, findings, type Artifact } from "./schema";
import { listOpenFindingsForProject } from "./findings";

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

export type ComplianceRow = {
  equipment: string;
  title: string;
  verdict: string;
  severity: string;
  summary: string;
  references: RfiReference[];
};

export type ComplianceReportContent = {
  counts: { hot: number; warm: number; cool: number; total: number };
  rows: ComplianceRow[];
};

// Compliance report — snapshots the project's open findings into a
// deliverable. Deterministic (reuses the hydrated findings read).
export async function createComplianceReportFromProject(params: {
  workspaceId: string;
  projectId: string;
}): Promise<Artifact | null> {
  const { workspaceId, projectId } = params;
  const items = await listOpenFindingsForProject({ workspaceId, projectId });

  const rows: ComplianceRow[] = items.map((f) => ({
    equipment: f.equipmentTags.join(", ") || "—",
    title: f.title,
    verdict: f.verdict,
    severity: f.severity,
    summary: f.summary,
    references: f.evidence.map((e) => ({
      label: refLabel(e.sourceKind),
      documentName: e.documentName,
      pageNum: e.pageNum,
      snippet: e.snippet,
      sourceKind: e.sourceKind,
    })),
  }));

  const counts = {
    hot: items.filter((f) => f.severity === "hot").length,
    warm: items.filter((f) => f.severity === "warm").length,
    cool: items.filter((f) => f.severity === "cool").length,
    total: items.length,
  };
  const content: ComplianceReportContent = { counts, rows };

  const docIds = Array.from(
    new Set(
      items.flatMap((f) =>
        f.evidence.map((e) => e.documentId).filter((x): x is string => !!x),
      ),
    ),
  );

  const [row] = await db
    .insert(artifacts)
    .values({
      workspaceId,
      projectId,
      type: "compliance_report",
      title: `Compliance Report · ${items.length} finding${items.length === 1 ? "" : "s"}`,
      status: "draft",
      content: content as unknown as Record<string, unknown>,
      findingIds: items.map((f) => f.id),
      sourceDocumentIds: docIds,
      trigger: { kind: "manual" },
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
