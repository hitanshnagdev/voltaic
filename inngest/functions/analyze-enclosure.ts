import "server-only";
import { eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import {
  equipment as equipmentTbl,
  equipmentCsiMap,
  findings,
} from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import { evaluateEnclosure } from "@/lib/rag/rules/enclosure";
import { retrieve, type RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import {
  buildEnclosureTriple,
  detectEnclosureContradiction,
  type EnclosureContradiction,
} from "@/lib/rag/synthesis/enclosure";
import type { RuleEvidence, RuleResult } from "@/lib/rag/rules/types";

/**
 * Stage 6 runner — enclosure rule. Subscribes to
 * `equipment/enclosure-ready`. No project fallback to load (enclosure is
 * environment-driven, not a global project parameter — see the enclosure
 * rule's docstring), so the equipment+project load step skips the
 * project query.
 */

type EnclosureReadyEvent = {
  equipmentId: string;
  workspaceId: string;
  projectId: string;
  documentId: string;
};

const ENCLOSURE_QUERY =
  "enclosure NEMA rating outdoor indoor weather rated";
const ATOMS_PER_SECTION = 12;
const CONFLICT_FIELD_ENCLOSURE = "enclosure_required_nema";

type EquipmentSlice = {
  id: string;
  projectId: string;
  tag: string | null;
  tagNormalized: string | null;
  category: string;
  csiSections: string[];
};

type SubmittalSlice = {
  id: string;
  documentId: string;
  pageNum: number | null;
  enclosureNema: string;
};

export const analyzeEnclosure = inngest.createFunction(
  {
    id: "analyze-project-enclosure",
    name: "Analyze project — enclosure rule",
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: "equipment/enclosure-ready" }],
  },
  async ({ event, step }) => {
    const { equipmentId, workspaceId, projectId } =
      event.data as EnclosureReadyEvent;

    const equipment = await step.run("load-equipment", async () => {
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
      return (equipmentRows[0] as EquipmentSlice | undefined) ?? null;
    });

    if (!equipment) return { equipmentId, skipped: "equipment_not_found" };

    const submittal = await step.run("load-submittal-enclosure", async () => {
      if (!equipment.tagNormalized) return null;
      const rows = (await db.execute(sql`
        SELECT
          sf.id,
          sf.document_id    AS "documentId",
          sf.page_num       AS "pageNum",
          (sf.fields ->> 'enclosure_nema') AS "enclosureNema"
        FROM submittal_fields sf
        JOIN documents d ON d.id = sf.document_id
        WHERE sf.tag_normalized = ${equipment.tagNormalized}
          AND d.project_id      = ${equipment.projectId}::uuid
          AND sf.fields ? 'enclosure_nema'
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
        enclosureNema: string | null;
      }>;
      const r = rows[0];
      if (!r || !r.enclosureNema) return null;
      return {
        id: r.id,
        documentId: r.documentId,
        pageNum: r.pageNum,
        enclosureNema: r.enclosureNema,
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

    const specAtoms = await step.run("retrieve-enclosure-atoms", async () => {
      const queryArgs = (csiSection?: string) => ({
        query: `${equipment.tag ?? equipment.tagNormalized ?? ""} ${ENCLOSURE_QUERY}`.trim(),
        projectId,
        workspaceId,
        filters: {
          requirementType: "enclosure" as const,
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

    const triple = buildEnclosureTriple({
      equipment: { id: equipment.id, tag: equipment.tag },
      submittal,
      specAtoms,
    });

    const ruleResult = evaluateEnclosure(triple);
    const contradiction = detectEnclosureContradiction(specAtoms);

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
            AND rule_id    = 'enclosure'
            AND kind       = 'rule'
            AND ${equipmentId}::uuid = ANY(equipment_ids)
        `);
        await tx.execute(sql`
          DELETE FROM findings
          WHERE project_id = ${projectId}::uuid
            AND kind       = 'contradiction'
            AND reasoning_trace ->> 'conflict_field' = ${CONFLICT_FIELD_ENCLOSURE}
            AND ${equipmentId}::uuid = ANY(equipment_ids)
        `);

        if (ruleResult) {
          await tx
            .insert(findings)
            .values(
              buildEnclosureRuleFindingRow({
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
              buildEnclosureContradictionFindingRow({
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

export function buildEnclosureRuleFindingRow(args: {
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

export function buildEnclosureContradictionFindingRow(args: {
  workspaceId: string;
  projectId: string;
  equipment: Pick<EquipmentSlice, "id" | "tag">;
  contradiction: EnclosureContradiction;
}): FindingInsert {
  const { workspaceId, projectId, equipment, contradiction } = args;
  const tagLabel = equipment.tag ?? "Equipment";
  const valuesPretty = contradiction.distinctCodes
    .map((c) => `NEMA ${c}`)
    .join(" vs ");
  const summary = `Spec sources disagree on the required enclosure for ${tagLabel}: ${valuesPretty}. The enclosure rule uses the strictest value, but the disagreement should be reconciled.`;

  return {
    workspaceId,
    projectId,
    title: `Spec disagrees on enclosure requirement for ${tagLabel}`,
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
      conflict_field: CONFLICT_FIELD_ENCLOSURE,
      values: contradiction.distinctCodes,
      sources: contradiction.candidates.map((c) => ({
        sourceId: c.atom.id,
        documentId: c.atom.documentId,
        pageNum: c.atom.pageNum,
        code: c.code,
      })),
    },
  };
}

function ruleTitle(tagLabel: string, r: RuleResult): string {
  if (r.verdict === "non_compliant")
    return `Enclosure undermatched for ${tagLabel}`;
  if (r.verdict === "compliant") return `Enclosure OK for ${tagLabel}`;
  return `Enclosure uncertain for ${tagLabel}`;
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
