import "server-only";
import { eq, sql } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import { db } from "@/lib/db/client";
import {
  equipment as equipmentTbl,
  equipmentCsiMap,
  findings,
  transcriptUtterances,
} from "@/lib/db/schema";
import { withWorkspace } from "@/lib/db/rls";
import { classify } from "@/lib/llm";
import { retrieve, type RetrievedAtom } from "@/lib/rag/retrieve/hybrid";
import { extractRequiredKaFromSpec } from "@/lib/rag/rules/aic";
import { normalizeAicKa, normalizeEquipmentTag } from "@/lib/rag/normalize";
import {
  CLAIM_SYSTEM,
  type ClaimExtraction,
} from "@/lib/rag/transcript/claims";

/**
 * Meeting-layer Stage 2 — cross-modal contradiction detection.
 *
 * Triggered by `transcript/utterances-ready`. Extracts spoken AIC claims from
 * the transcript (LLM, grounded against the project's real equipment tags),
 * then deterministically compares each spoken value against the spec-required
 * AIC for that equipment (reusing `extractRequiredKaFromSpec`). When they
 * disagree, it emits a `kind='contradiction'` finding whose evidence pairs the
 * transcript utterance with the spec paragraph — the cross-modal "what was
 * said contradicts the contract" finding.
 *
 * Idempotent: deletes prior contradictions scoped to this transcript
 * (reasoning_trace ->> 'source_transcript_id') before inserting fresh rows.
 */

type UtterancesReadyEvent = {
  transcriptId: string;
  workspaceId: string;
  projectId: string;
};

const AIC_QUERY =
  "available interrupting current AIC kAIC short circuit interrupting rating";
const ATOMS_PER_SECTION = 12;
const CONFLICT_FIELD_AIC = "aic_required_ka";

type FindingInsert = typeof findings.$inferInsert;

type EquipmentSlice = {
  id: string;
  tag: string | null;
  tagNormalized: string | null;
  category: string;
  csiSections: string[];
};

type UtteranceSlice = {
  id: string;
  idx: number;
  speaker: string | null;
  content: string;
};

export const detectTranscriptContradictions = inngest.createFunction(
  {
    id: "detect-transcript-contradictions",
    name: "Detect transcript contradictions",
    retries: 2,
    concurrency: { limit: 2 },
    triggers: [{ event: "transcript/utterances-ready" }],
  },
  async ({ event, step }) => {
    const { transcriptId, workspaceId, projectId } =
      event.data as UtterancesReadyEvent;

    const utterances = await step.run("load-utterances", async () => {
      return db
        .select({
          id: transcriptUtterances.id,
          idx: transcriptUtterances.idx,
          speaker: transcriptUtterances.speaker,
          content: transcriptUtterances.content,
        })
        .from(transcriptUtterances)
        .where(eq(transcriptUtterances.transcriptId, transcriptId))
        .orderBy(transcriptUtterances.idx);
    });

    if (utterances.length === 0) {
      return { transcriptId, skipped: "no_utterances" };
    }

    const equipmentRows = (await step.run("load-equipment", async () => {
      return db
        .select({
          id: equipmentTbl.id,
          tag: equipmentTbl.tag,
          tagNormalized: equipmentTbl.tagNormalized,
          category: equipmentTbl.category,
          csiSections: equipmentTbl.csiSections,
        })
        .from(equipmentTbl)
        .where(eq(equipmentTbl.projectId, projectId));
    })) as EquipmentSlice[];

    if (equipmentRows.length === 0) {
      // No equipment graph yet → nothing to resolve a spoken claim against.
      return { transcriptId, skipped: "no_equipment" };
    }

    // Extract spoken AIC claims, grounded against the known tags.
    const extraction = await step.run("extract-claims", async () => {
      const knownTags = equipmentRows
        .map((e) => e.tag)
        .filter((t): t is string => !!t);
      if (knownTags.length === 0) return { claims: [] } as ClaimExtraction;

      const numbered = (utterances as UtteranceSlice[])
        .map(
          (u) =>
            `#${u.idx} ${u.speaker ? `[${u.speaker}] ` : ""}${u.content}`,
        )
        .join("\n");
      const user = `Known equipment tags: ${knownTags.join(", ")}\n\nUtterances:\n${numbered}`;

      const result = await classify<ClaimExtraction>({
        system: CLAIM_SYSTEM,
        user,
        ctx: { workspaceId, projectId },
        maxTokens: 1200,
      });
      return result?.claims ? result : ({ claims: [] } as ClaimExtraction);
    });

    if (extraction.claims.length === 0) {
      return { transcriptId, claims: 0, contradictions: 0 };
    }

    const byNormTag = new Map<string, EquipmentSlice>();
    for (const e of equipmentRows) {
      if (e.tagNormalized) byNormTag.set(e.tagNormalized, e);
    }
    const byIdx = new Map<number, UtteranceSlice>();
    for (const u of utterances as UtteranceSlice[]) byIdx.set(u.idx, u);

    // Resolve + compare each claim, then persist. Retrieval (I/O) happens
    // before the withWorkspace write so the transaction is delete+insert only.
    const result = await step.run("evaluate-and-persist", async () => {
      const rows: FindingInsert[] = [];

      for (const claim of extraction.claims) {
        const spokenKa = normalizeAicKa(claim.valueRaw);
        if (spokenKa == null) continue;
        const normTag = normalizeEquipmentTag(claim.equipmentTag);
        if (!normTag) continue;
        const equip = byNormTag.get(normTag);
        if (!equip) continue;
        const utt = byIdx.get(claim.utteranceIdx);
        if (!utt) continue;

        // Resolve candidate CSI sections (equipment first, map fallback).
        let csiSections = equip.csiSections ?? [];
        if (csiSections.length === 0) {
          const map = await db
            .select({ csiSections: equipmentCsiMap.csiSections })
            .from(equipmentCsiMap)
            .where(eq(equipmentCsiMap.category, equip.category))
            .limit(1);
          csiSections = map[0]?.csiSections ?? [];
        }

        // Retrieve aic-typed spec atoms scoped to those sections.
        const queryArgs = (csiSection?: string) => ({
          query: `${equip.tag ?? ""} ${AIC_QUERY}`.trim(),
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
            : await Promise.all(
                csiSections.map((s) => retrieve(queryArgs(s))),
              );

        let requiredKa: number | null = null;
        let bestAtom: RetrievedAtom | null = null;
        const seen = new Set<string>();
        for (const leg of legs) {
          for (const atom of leg) {
            if (seen.has(atom.id)) continue;
            seen.add(atom.id);
            const ka = extractRequiredKaFromSpec(atom.content);
            if (ka != null && (requiredKa == null || ka > requiredKa)) {
              requiredKa = ka;
              bestAtom = atom;
            }
          }
        }

        // Nothing to contradict against, or they agree — no finding.
        if (requiredKa == null || !bestAtom) continue;
        if (spokenKa === requiredKa) continue;

        const tag = equip.tag ?? "equipment";
        const under = spokenKa < requiredKa;
        rows.push({
          workspaceId,
          projectId,
          title: `Meeting decision conflicts with spec AIC for ${tag}`,
          summary: `On the call, ${spokenKa} kAIC was proposed for ${tag}, but the spec requires ${requiredKa} kAIC.${under ? " That would leave it under-rated for the available fault current." : ""} Flagged before it reaches procurement.`,
          kind: "contradiction",
          ruleId: null,
          severity: under ? "hot" : "warm",
          verdict: under ? "non_compliant" : "no_conflict",
          confidence: "0.85",
          category: "code",
          equipmentIds: [equip.id],
          evidence: [
            {
              sourceKind: "transcript_utterance",
              sourceId: utt.id,
              transcriptId,
              documentId: null,
              pageNum: null,
              snippet: `${utt.speaker ? `[${utt.speaker}] ` : ""}"${utt.content.slice(0, 240)}"`,
              role: "primary",
            },
            {
              sourceKind: "spec_paragraph",
              sourceId: bestAtom.id,
              documentId: bestAtom.documentId,
              pageNum: bestAtom.pageNum,
              snippet: bestAtom.content.slice(0, 240),
              role: "primary",
            },
          ],
          reasoningTrace: {
            kind: "contradiction",
            conflict_field: CONFLICT_FIELD_AIC,
            source_transcript_id: transcriptId,
            values: [requiredKa, spokenKa],
            sources: [
              {
                sourceKind: "spec_paragraph",
                sourceId: bestAtom.id,
                documentId: bestAtom.documentId,
                pageNum: bestAtom.pageNum,
                ka: requiredKa,
              },
              {
                sourceKind: "transcript_utterance",
                sourceId: utt.id,
                transcriptId,
                ka: spokenKa,
              },
            ],
          },
        });
      }

      await withWorkspace(workspaceId, async (tx) => {
        await tx.execute(sql`
          DELETE FROM findings
          WHERE project_id = ${projectId}::uuid
            AND kind       = 'contradiction'
            AND reasoning_trace ->> 'source_transcript_id' = ${transcriptId}
        `);
        if (rows.length > 0) {
          await tx.insert(findings).values(rows);
        }
      });

      return { contradictions: rows.length };
    });

    return {
      transcriptId,
      claims: extraction.claims.length,
      contradictions: result.contradictions,
    };
  },
);
