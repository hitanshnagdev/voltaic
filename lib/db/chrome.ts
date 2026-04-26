import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "./client";
import { documents, equipment, findings, llmCalls, projects } from "./schema";

/**
 * Project-level "chrome" data — small bag of values consumed by the
 * sidebar / topbar / revision ribbon to replace the prior hardcoded
 * mock strings ("Riverside Medical · $6.5M · 54 docs · 87 equipment").
 *
 * Per the post-mortem on session 2026-04-26: anything that can't be
 * sourced from real data is REMOVED, not faked. This helper returns
 * what we genuinely know; consumers render conditionally on presence.
 */
export type ProjectChrome = {
  projectName: string;
  projectStatus: string;
  documentCount: number;
  equipmentCount: number;
  findingCounts: {
    open: number;
    hot: number;
    warm: number;
    cool: number;
  };
  /**
   * Last LLM-call timestamp scoped to this project. Approximates "last
   * AI activity." Null if the project has never run any LLM call —
   * notably true for empty projects that haven't ingested anything.
   */
  lastAnalysisAt: Date | null;
};

/**
 * Fetch the chrome bag for one project. Single round-trip via parallel
 * queries — chrome renders on every authed page so we keep this cheap.
 *
 * RLS scoping is handled by the workspace_id filter on each query; we
 * don't need to wrap in withWorkspace() because all reads are
 * workspace-scoped at the WHERE clause level.
 */
export async function getProjectChrome(args: {
  workspaceId: string;
  projectId: string;
}): Promise<ProjectChrome> {
  const { workspaceId, projectId } = args;

  const [
    projectRows,
    documentRows,
    equipmentRows,
    findingsRows,
    lastAnalysisRows,
  ] = await Promise.all([
    db
      .select({ name: projects.name, status: projects.status })
      .from(projects)
      .where(
        and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
      )
      .limit(1),
    db
      .select({ count: count() })
      .from(documents)
      .where(
        and(
          eq(documents.projectId, projectId),
          eq(documents.workspaceId, workspaceId),
        ),
      ),
    db
      .select({ count: count() })
      .from(equipment)
      .where(
        and(
          eq(equipment.projectId, projectId),
          eq(equipment.workspaceId, workspaceId),
        ),
      ),
    db
      .select({ severity: findings.severity, count: count() })
      .from(findings)
      .where(
        and(
          eq(findings.projectId, projectId),
          eq(findings.workspaceId, workspaceId),
          eq(findings.status, "open"),
        ),
      )
      .groupBy(findings.severity),
    db
      .select({ createdAt: llmCalls.createdAt })
      .from(llmCalls)
      .where(
        and(
          eq(llmCalls.projectId, projectId),
          eq(llmCalls.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(llmCalls.createdAt))
      .limit(1),
  ]);

  // Defensive: if the project somehow doesn't exist (race during workspace
  // bootstrap), surface a useful name rather than crashing the chrome.
  const project = projectRows[0] ?? { name: "Project", status: "active" };

  const counts = { open: 0, hot: 0, warm: 0, cool: 0 };
  for (const row of findingsRows) {
    const n = Number(row.count);
    counts.open += n;
    if (row.severity === "hot") counts.hot = n;
    else if (row.severity === "warm") counts.warm = n;
    else if (row.severity === "cool") counts.cool = n;
  }

  return {
    projectName: project.name,
    projectStatus: project.status,
    documentCount: Number(documentRows[0]?.count ?? 0),
    equipmentCount: Number(equipmentRows[0]?.count ?? 0),
    findingCounts: counts,
    lastAnalysisAt: lastAnalysisRows[0]?.createdAt ?? null,
  };
}
