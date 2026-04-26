import "server-only";
import { eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import {
  equipment as equipmentTbl,
  equipmentCsiMap,
  findings,
  projects,
} from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import { evaluateSccr } from "@/lib/rag/rules/sccr";
import { retrieve, type RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import {
  buildSccrTriple,
  detectSccrContradiction,
  type SccrContradiction,
} from "@/lib/rag/synthesis/sccr";
import type { RuleEvidence, RuleResult } from "@/lib/rag/rules/types";

/**
 * Stage 6 runner — SCCR rule. Mirrors analyze-project.ts (the AIC
 * runner) — same orchestration shape, different rule. Per per-rule
 * readiness events (DECISIONS.md U2), this function subscribes only to
 * `equipment/sccr-ready`, fired by parse-submittal when a submittal_field
 * with normalized `sccr_ka` lands.
 *
 * The duplication is intentional and discipline-gated. When the third
 * clone (enclosure) lands, it's the same shape; once a fourth rule joins
 * (ampacity / coordination / spec_drift), the orchestration shell
 * factors out. Three clones doesn't justify the abstraction yet.
 */

type SccrReadyEvent = {
  equipmentId: string;
  workspaceId: string;
  projectId: string;
  documentId: string;
};

const SCCR_QUERY =
  "SCCR short-circuit current rating bus bracing withstand rating";
const ATOMS_PER_SECTION = 12;
const CONFLICT_FIELD_SCCR = "sccr_required_ka";

type EquipmentSlice = {
  id: string;
  projectId: string;
  tag: string | null;
  tagNormalized: string | null;
  category: string;
  csiSections: string[];
};

type ProjectSlice = { availableFaultCurrentKa: number | null };

type SubmittalSlice = {
  id: string;
  documentId: string;
  pageNum: number | null;
  sccrKa: number;
};

export const analyzeSccr = inngest.createFunction(
  {
    id: "analyze-project-sccr",
    name: "Analyze project — SCCR rule",
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: "equipment/sccr-ready" }],
  },
  async ({ event, step }) => {
    const { equipmentId, workspaceId, projectId } =
      event.data as SccrReadyEvent;

    const ctx = await step.run("load-equipment-and-project", async () => {
      const equipmentRows = await db
        .select({
          id: equipmentTbl.id,
          projectId: equipmentTbl.projectId,
          tag: equipmentTbl.tag,
          tagNormalized: equipmentTbl.tagNormalized,
          category: equipmentTbl.category,
          csiSections: equipmentTbl.csiSections,
        })
        .from(equipmentTbl)
        .where(eq(equipmentTbl.id, equipmentId))
        .limit(1);
      const equipmentRow = equipmentRows[0] as EquipmentSlice | undefined;
      if (!equipmentRow) return null;

      const projectRows = await db
        .select({ availableFaultCurrentKa: projects.availableFaultCurrentKa })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);
      const project: ProjectSlice = {
        availableFaultCurrentKa:
          projectRows[0]?.availableFaultCurrentKa != null
            ? Number(projectRows[0].availableFaultCurrentKa)
            : null,
      };
      return { equipment: equipmentRow, project };
    });

    if (!ctx) return { equipmentId, skipped: "equipment_not_found" };
    const { equipment, project } = ctx;

    const submittal = await step.run("load-submittal-sccr", async () => {
      if (!equipment.tagNormalized) return null;
      const rows = (await db.execute(sql`
        SELECT
          sf.id,
          sf.document_id    AS "documentId",
          sf.page_num       AS "pageNum",
          (sf.fields ->> 'sccr_ka')::numeric AS "sccrKa"
        FROM submittal_fields sf
        JOIN documents d ON d.id = sf.document_id
        WHERE sf.tag_normalized = ${equipment.tagNormalized}
          AND d.project_id      = ${equipment.projectId}::uuid
          AND sf.fields ? 'sccr_ka'
          AND (
            d.submittal_status IS NULL
            OR d.submittal_status NOT IN ('rejected', 'revise_resubmit')
          )
        ORDER BY sf.created_at DESC
        LIMIT 1
      `)) as unknown as Array<{
        id: string;
        documentId: string;
        pageNum: number | null;
        sccrKa: string | number | null;
      }>;
      const r = rows[0];
      if (!r || r.sccrKa == null) return null;
      return {
        id: r.id,
        documentId: r.documentId,
        pageNum: r.pageNum,
        sccrKa: Number(r.sccrKa),
      } satisfies SubmittalSlice;
    });

    const csiSections = await step.run("resolve-csi-sections", async () => {
      if (equipment.csiSections.length > 0) return equipment.csiSections;
      const map = await db
        .select({ csiSections: equipmentCsiMap.csiSections })
        .from(equipmentCsiMap)
        .where(eq(equipmentCsiMap.category, equipment.category))
        .limit(1);
      return map[0]?.csiSections ?? [];
    });

    const specAtoms = await step.run("retrieve-sccr-atoms", async () => {
      const queryArgs = (csiSection?: string) => ({
        query: `${equipment.tag ?? equipment.tagNormalized ?? ""} ${SCCR_QUERY}`.trim(),
        projectId,
        workspaceId,
        filters: {
          requirementType: "sccr" as const,
          ...(csiSection ? { csiSection } : {}),
        },
        k: ATOMS_PER_SECTION,
      });

      const legs: RetrievedAtom[][] =
        csiSections.length === 0
          ? [await retrieve(queryArgs())]
          : await Promise.all(csiSections.map((s) => retrieve(queryArgs(s))));

      const seen = new Set<string>();
      const merged: RetrievedAtom[] = [];
      for (const leg of legs) {
        for (const a of leg) {
          if (seen.has(a.id)) continue;
          seen.add(a.id);
          merged.push(a);
        }
      }
      return merged;
    });

    const triple = buildSccrTriple({
      equipment: { id: equipment.id, tag: equipment.tag },
      submittal,
      specAtoms,
      projectFaultCurrentKa: project.availableFaultCurrentKa,
    });

    const ruleResult = evaluateSccr(triple);
    const contradiction = detectSccrContradiction(specAtoms);

    if (!ruleResult && !contradiction) {
      return {
        equipmentId,
        skipped: "no_rule_result_no_contradiction",
        atomsRetrieved: specAtoms.length,
      };
    }

    await step.run("persist-findings", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        await tx.execute(sql`
          DELETE FROM findings
          WHERE project_id = ${projectId}::uuid
            AND rule_id    = 'sccr'
            AND kind       = 'rule'
            AND ${equipmentId}::uuid = ANY(equipment_ids)
        `);
        await tx.execute(sql`
          DELETE FROM findings
          WHERE project_id = ${projectId}::uuid
            AND kind       = 'contradiction'
            AND reasoning_trace ->> 'conflict_field' = ${CONFLICT_FIELD_SCCR}
            AND ${equipmentId}::uuid = ANY(equipment_ids)
        `);

        if (ruleResult) {
          await tx
            .insert(findings)
            .values(
              buildSccrRuleFindingRow({
                workspaceId,
                projectId,
                equipment,
                ruleResult,
              }),
            );
        }
        if (contradiction) {
          await tx
            .insert(findings)
            .values(
              buildSccrContradictionFindingRow({
                workspaceId,
                projectId,
                equipment,
                contradiction,
              }),
            );
        }
      });
    });

    return {
      equipmentId,
      ruleVerdict: ruleResult?.verdict ?? null,
      ruleSeverity: ruleResult?.severity ?? null,
      contradictionDetected: contradiction != null,
      atomsRetrieved: specAtoms.length,
    };
  },
);

// ---------- pure row builders (exported for tests) ----------

type FindingInsert = typeof findings.$inferInsert;

export function buildSccrRuleFindingRow(args: {
  workspaceId: string;
  projectId: string;
  equipment: Pick<EquipmentSlice, "id" | "tag">;
  ruleResult: RuleResult;
}): FindingInsert {
  const { workspaceId, projectId, equipment, ruleResult } = args;
  const tagLabel = equipment.tag ?? "Equipment";
  return {
    workspaceId,
    projectId,
    title: ruleTitle(tagLabel, ruleResult),
    summary: ruleResult.summary,
    kind: "rule",
    ruleId: ruleResult.ruleId,
    severity: ruleResult.severity,
    verdict: ruleResult.verdict,
    confidence: String(ruleResult.confidence),
    category: "code",
    equipmentIds: [equipment.id],
    evidence: ruleResult.evidence.map(toEvidenceJson),
    reasoningTrace: {
      kind: "rule",
      ruleId: ruleResult.ruleId,
      comparator: ruleResult.comparator,
      inputs: ruleResult.inputs,
    },
  };
}

export function buildSccrContradictionFindingRow(args: {
  workspaceId: string;
  projectId: string;
  equipment: Pick<EquipmentSlice, "id" | "tag">;
  contradiction: SccrContradiction;
}): FindingInsert {
  const { workspaceId, projectId, equipment, contradiction } = args;
  const tagLabel = equipment.tag ?? "Equipment";
  const valuesPretty = contradiction.distinctKas
    .map((k) => `${k} kA`)
    .join(" vs ");
  const summary = `Spec sources disagree on the required SCCR for ${tagLabel}: ${valuesPretty}. The SCCR rule uses the highest value (${contradiction.distinctKas[0]} kA), but the disagreement should be reconciled.`;

  return {
    workspaceId,
    projectId,
    title: `Spec disagrees on SCCR requirement for ${tagLabel}`,
    summary,
    kind: "contradiction",
    ruleId: null,
    severity: "warm",
    verdict: "no_conflict",
    confidence: "0.9",
    category: "code",
    equipmentIds: [equipment.id],
    evidence: contradiction.candidates.map((c) => ({
      sourceKind: "spec_paragraph",
      sourceId: c.atom.id,
      documentId: c.atom.documentId,
      pageNum: c.atom.pageNum,
      role: "primary",
      snippet: c.atom.content.slice(0, 240),
    })),
    reasoningTrace: {
      kind: "contradiction",
      conflict_field: CONFLICT_FIELD_SCCR,
      values: contradiction.distinctKas,
      sources: contradiction.candidates.map((c) => ({
        sourceId: c.atom.id,
        documentId: c.atom.documentId,
        pageNum: c.atom.pageNum,
        ka: c.ka,
      })),
    },
  };
}

function ruleTitle(tagLabel: string, r: RuleResult): string {
  if (r.verdict === "non_compliant") return `SCCR undersized for ${tagLabel}`;
  if (r.verdict === "compliant") return `SCCR OK for ${tagLabel}`;
  return `SCCR uncertain for ${tagLabel}`;
}

function toEvidenceJson(e: RuleEvidence) {
  return {
    sourceKind: e.sourceKind,
    sourceId: e.sourceId,
    documentId: e.documentId ?? null,
    pageNum: e.pageNum ?? null,
    snippet: e.snippet ?? null,
    role: e.role,
  };
}
