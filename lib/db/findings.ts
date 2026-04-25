import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { documents, equipment, findings } from "./schema";

/**
 * Read-side helpers for the Today view.
 *
 * The page renders one card per finding, sorted by what we want the PM
 * to act on first. The hydration step turns raw `equipment_ids[]` and
 * raw evidence `documentId`s into human labels (equipment tag, document
 * filename) so the cards don't expose UUIDs.
 *
 * Pure helpers (sortFindingsForToday, severityRank) are exported so the
 * comparator is unit-testable without spinning up Postgres.
 */

export type EvidenceItem = {
  sourceKind: string;
  sourceId: string | null;
  documentId: string | null;
  pageNum: number | null;
  snippet: string | null;
  role: "primary" | "supporting" | string;
  /** Hydrated post-query — null if the document is missing. */
  documentName: string | null;
};

export type FindingForToday = {
  id: string;
  title: string;
  summary: string;
  kind: "rule" | "interpretive" | "contradiction";
  ruleId: string | null;
  severity: "hot" | "warm" | "cool";
  verdict: string;
  confidence: number;
  timeToImpactDays: number | null;
  category: string;
  equipmentTags: string[];
  evidence: EvidenceItem[];
};

/**
 * Sort priority for the severity tier. Higher = surface first.
 * Exported for the comparator's unit tests; not used at the row level.
 */
export function severityRank(severity: string): number {
  if (severity === "hot") return 3;
  if (severity === "warm") return 2;
  if (severity === "cool") return 1;
  return 0;
}

/**
 * Pure comparator. Sort order:
 *   1. severity DESC          (hot before warm before cool)
 *   2. time_to_impact_days ASC NULLS LAST  (sooner first; unset goes last)
 *   3. confidence DESC        (most-trusted first within a tier)
 *
 * In-place mutation is fine — callers always operate on a fresh array
 * out of the DB.
 */
export function sortFindingsForToday<T extends Pick<
  FindingForToday,
  "severity" | "timeToImpactDays" | "confidence"
>>(rows: T[]): T[] {
  return rows.sort((a, b) => {
    const sev = severityRank(b.severity) - severityRank(a.severity);
    if (sev !== 0) return sev;
    const aTti = a.timeToImpactDays ?? Number.POSITIVE_INFINITY;
    const bTti = b.timeToImpactDays ?? Number.POSITIVE_INFINITY;
    if (aTti !== bTti) return aTti - bTti;
    return b.confidence - a.confidence;
  });
}

type RawEvidenceItem = {
  sourceKind?: string;
  sourceId?: string | null;
  documentId?: string | null;
  pageNum?: number | null;
  snippet?: string | null;
  role?: string;
};

/**
 * Load every open finding for the project, hydrate equipment tags and
 * document filenames, and return them sorted ready for render.
 *
 * Three queries (findings + equipment + documents) are issued in
 * parallel; stitching is in TS. We don't denormalize because findings
 * touch <100 rows in v1 — joining at the DB doesn't pay for itself.
 */
export async function listOpenFindingsForProject(params: {
  workspaceId: string;
  projectId: string;
}): Promise<FindingForToday[]> {
  const { workspaceId, projectId } = params;

  const rows = await db
    .select()
    .from(findings)
    .where(
      and(
        eq(findings.workspaceId, workspaceId),
        eq(findings.projectId, projectId),
        eq(findings.status, "open"),
      ),
    );

  if (rows.length === 0) return [];

  // Collect the ids we need to hydrate.
  const equipmentIds = new Set<string>();
  const documentIds = new Set<string>();
  for (const r of rows) {
    for (const id of r.equipmentIds ?? []) equipmentIds.add(id);
    const ev = (r.evidence ?? []) as RawEvidenceItem[];
    for (const e of ev) {
      if (e.documentId) documentIds.add(e.documentId);
    }
  }

  const [equipmentRows, documentRows] = await Promise.all([
    equipmentIds.size > 0
      ? db
          .select({ id: equipment.id, tag: equipment.tag })
          .from(equipment)
          .where(inArray(equipment.id, Array.from(equipmentIds)))
      : Promise.resolve<{ id: string; tag: string | null }[]>([]),
    documentIds.size > 0
      ? db
          .select({ id: documents.id, filename: documents.filename })
          .from(documents)
          .where(inArray(documents.id, Array.from(documentIds)))
      : Promise.resolve<{ id: string; filename: string }[]>([]),
  ]);

  const tagById = new Map(equipmentRows.map((r) => [r.id, r.tag]));
  const filenameById = new Map(documentRows.map((r) => [r.id, r.filename]));

  const hydrated: FindingForToday[] = rows.map((r) => {
    const ev = (r.evidence ?? []) as RawEvidenceItem[];
    return {
      id: r.id,
      title: r.title,
      summary: r.summary,
      kind: r.kind as FindingForToday["kind"],
      ruleId: r.ruleId,
      severity: r.severity as FindingForToday["severity"],
      verdict: r.verdict,
      confidence: Number(r.confidence),
      timeToImpactDays: r.timeToImpactDays,
      category: r.category,
      equipmentTags: (r.equipmentIds ?? [])
        .map((id) => tagById.get(id) ?? null)
        .filter((t): t is string => Boolean(t && t.trim().length > 0)),
      evidence: ev.map((e) => ({
        sourceKind: e.sourceKind ?? "unknown",
        sourceId: e.sourceId ?? null,
        documentId: e.documentId ?? null,
        pageNum: e.pageNum ?? null,
        snippet: e.snippet ?? null,
        role: e.role ?? "supporting",
        documentName: e.documentId ? filenameById.get(e.documentId) ?? null : null,
      })),
    };
  });

  return sortFindingsForToday(hydrated);
}
