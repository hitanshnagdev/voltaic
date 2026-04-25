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
import { evaluateAic } from "@/lib/rag/rules/aic";
import { retrieve, type RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import {
  buildAicTriple,
  detectAicContradiction,
  type AicContradiction,
} from "@/lib/rag/synthesis/aic";
import type { RuleEvidence, RuleResult } from "@/lib/rag/rules/types";

/**
 * Stage 6 runner — durable function. The seam where a rule's pure
 * evaluator gets wired to real DB rows + retrieved atoms and turned into
 * persisted `findings` rows.
 *
 * Subscribes to `equipment/aic-ready`, which `parse-submittal` emits when
 * a submittal field with a normalized `aic_ka` value lands. Per per-rule
 * readiness events (docs/DECISIONS.md U2), this function runs only the
 * AIC rule — sibling rules (SCCR, enclosure, ampacity, coordination) will
 * each subscribe to their own readiness event when their parsers land.
 *
 * Steps:
 *   1. Load equipment + project + the latest non-rejected submittal_fields
 *      row carrying aic_ka for this equipment.
 *   2. Resolve candidate CSI sections from the equipment row (preferred)
 *      or via equipment_csi_map keyed on category (fallback).
 *   3. Retrieve `requirement_type='aic'` spec atoms scoped to those CSI
 *      sections (one parallel retrieve per section, deduped by id).
 *   4. Build the AicTriple and evaluate the rule.
 *   5. Detect a separate spec-vs-spec contradiction (per U5).
 *   6. Idempotently persist findings: delete prior `(equipment, ruleId='aic')`
 *      rule rows and prior AIC-scoped contradiction rows, then insert
 *      fresh rows with full evidence + reasoning_trace.
 *
 * Idempotency on re-fire is handled by a delete-then-insert inside one
 * `withWorkspace` transaction. Re-running for the same equipment converges
 * on the same row state.
 */

type AicReadyEvent = {
  equipmentId: string;
  workspaceId: string;
  projectId: string;
  documentId: string;
};

/** Generic query phrase used to rank aic-typed atoms during retrieval. */
const AIC_QUERY =
  "available interrupting current AIC kAIC short circuit interrupting rating";

/** How many atoms each per-CSI retrieve call pulls before dedup. */
const ATOMS_PER_SECTION = 12;

/** Schema-blessed scope key on contradiction findings (CLAUDE.md schema). */
const CONFLICT_FIELD_AIC = "aic_required_ka";

type EquipmentSlice = {
  id: string;
  projectId: string;
  tag: string | null;
  tagNormalized: string | null;
  category: string;
  csiSections: string[];
};

type ProjectSlice = {
  availableFaultCurrentKa: number | null;
};

type SubmittalSlice = {
  id: string;
  documentId: string;
  pageNum: number | null;
  aicKa: number;
};

export const analyzeProject = inngest.createFunction(
  {
    id: "analyze-project-aic",
    name: "Analyze project — AIC rule",
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: "equipment/aic-ready" }],
  },
  async ({ event, step }) => {
    const { equipmentId, workspaceId, projectId } =
      event.data as AicReadyEvent;

    // 1. Load equipment + project together.
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
        .select({
          availableFaultCurrentKa: projects.availableFaultCurrentKa,
        })
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

    // 2. Load latest non-rejected submittal_field with aic_ka for this equipment.
    const submittal = await step.run("load-submittal-aic", async () => {
      if (!equipment.tagNormalized) return null;
      const rows = (await db.execute(sql`
        SELECT
          sf.id,
          sf.document_id    AS "documentId",
          sf.page_num       AS "pageNum",
          (sf.fields ->> 'aic_ka')::numeric AS "aicKa"
        FROM submittal_fields sf
        JOIN documents d ON d.id = sf.document_id
        WHERE sf.tag_normalized = ${equipment.tagNormalized}
          AND d.project_id      = ${equipment.projectId}::uuid
          AND sf.fields ? 'aic_ka'
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
        aicKa: string | number | null;
      }>;
      const r = rows[0];
      if (!r || r.aicKa == null) return null;
      return {
        id: r.id,
        documentId: r.documentId,
        pageNum: r.pageNum,
        aicKa: Number(r.aicKa),
      } satisfies SubmittalSlice;
    });

    // 3. Resolve candidate CSI sections.
    const csiSections = await step.run("resolve-csi-sections", async () => {
      if (equipment.csiSections.length > 0) return equipment.csiSections;
      const map = await db
        .select({ csiSections: equipmentCsiMap.csiSections })
        .from(equipmentCsiMap)
        .where(eq(equipmentCsiMap.category, equipment.category))
        .limit(1);
      return map[0]?.csiSections ?? [];
    });

    // 4. Retrieve aic-typed spec atoms across the candidate sections.
    const specAtoms = await step.run("retrieve-aic-atoms", async () => {
      const queryArgs = (csiSection?: string) => ({
        query: `${equipment.tag ?? equipment.tagNormalized ?? ""} ${AIC_QUERY}`.trim(),
        projectId,
        workspaceId,
        filters: {
          requirementType: "aic" as const,
          ...(csiSection ? { csiSection } : {}),
        },
        k: ATOMS_PER_SECTION,
      });

      const legs: RetrievedAtom[][] =
        csiSections.length === 0
          ? [await retrieve(queryArgs())]
          : await Promise.all(csiSections.map((s) => retrieve(queryArgs(s))));

      // Dedup by id, preserve order of first appearance.
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

    // 5. Build the triple and run the rule + contradiction passes.
    const triple = buildAicTriple({
      equipment: { id: equipment.id, tag: equipment.tag },
      submittal,
      specAtoms,
      projectFaultCurrentKa: project.availableFaultCurrentKa,
    });

    const ruleResult = evaluateAic(triple);
    const contradiction = detectAicContradiction(specAtoms);

    if (!ruleResult && !contradiction) {
      // Truly nothing to say — silence over false positives.
      return {
        equipmentId,
        skipped: "no_rule_result_no_contradiction",
        atomsRetrieved: specAtoms.length,
      };
    }

    // 6. Persist findings idempotently.
    await step.run("persist-findings", async () => {
      await withWorkspace(workspaceId, async (tx) => {
        // Delete prior AIC rule findings for this equipment.
        await tx.execute(sql`
          DELETE FROM findings
          WHERE project_id = ${projectId}::uuid
            AND rule_id    = 'aic'
            AND kind       = 'rule'
            AND ${equipmentId}::uuid = ANY(equipment_ids)
        `);
        // Delete prior AIC-scoped contradictions for this equipment.
        await tx.execute(sql`
          DELETE FROM findings
          WHERE project_id = ${projectId}::uuid
            AND kind       = 'contradiction'
            AND reasoning_trace ->> 'conflict_field' = ${CONFLICT_FIELD_AIC}
            AND ${equipmentId}::uuid = ANY(equipment_ids)
        `);

        if (ruleResult) {
          await tx.insert(findings).values(
            buildRuleFindingRow({
              workspaceId,
              projectId,
              equipment,
              ruleResult,
            }),
          );
        }
        if (contradiction) {
          await tx.insert(findings).values(
            buildContradictionFindingRow({
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

export function buildRuleFindingRow(args: {
  workspaceId: string;
  projectId: string;
  equipment: Pick<EquipmentSlice, "id" | "tag">;
  ruleResult: RuleResult;
}): FindingInsert {
  const { workspaceId, projectId, equipment, ruleResult } = args;
  const tagLabel = equipment.tag ?? "Equipment";
  const title = ruleTitle(tagLabel, ruleResult);
  return {
    workspaceId,
    projectId,
    title,
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

export function buildContradictionFindingRow(args: {
  workspaceId: string;
  projectId: string;
  equipment: Pick<EquipmentSlice, "id" | "tag">;
  contradiction: AicContradiction;
}): FindingInsert {
  const { workspaceId, projectId, equipment, contradiction } = args;
  const tagLabel = equipment.tag ?? "Equipment";
  const valuesPretty = contradiction.distinctKas
    .map((k) => `${k} kA`)
    .join(" vs ");
  const summary = `Spec sources disagree on the required AIC for ${tagLabel}: ${valuesPretty}. The AIC rule uses the highest value (${contradiction.distinctKas[0]} kA), but the disagreement should be reconciled.`;

  return {
    workspaceId,
    projectId,
    title: `Spec disagrees on AIC requirement for ${tagLabel}`,
    summary,
    kind: "contradiction",
    ruleId: null,
    // Contradictions are at minimum warm — CLAUDE.md core principle 9.
    severity: "warm",
    verdict: "no_conflict",
    // High structural confidence (we know the atoms disagree); leave the
    // numeric value choice to the rule.
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
      conflict_field: CONFLICT_FIELD_AIC,
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
  if (r.verdict === "non_compliant") return `AIC undersized for ${tagLabel}`;
  if (r.verdict === "compliant") return `AIC OK for ${tagLabel}`;
  return `AIC uncertain for ${tagLabel}`;
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
