import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { documents, equipment, submittalFields } from "./schema";
import type { AttributeDef, AttributeGroup, InlineVerdict } from "@/lib/rag/compare/attributes";
import {
  ATTRIBUTE_GROUPS,
  PANELBOARD_ATTRIBUTES,
} from "@/lib/rag/compare/attributes";
import { retrieve, type RetrievedAtom } from "@/lib/rag/retrieve/hybrid";

/**
 * Data layer for the /compare page.
 *
 * Two entry points:
 *   listEquipmentForCompare() — sidebar dropdown content (which equipment
 *     exists in the active project, sorted by flagged-count desc so the
 *     most-broken thing surfaces first).
 *   buildCompareData()        — per-equipment compliance table:
 *     submitted values (from submittal_fields), spec required values
 *     (from real retrieve() calls — NOT hardcoded per U15 condition 3),
 *     and verdicts (from findings rows for rule_driven attributes,
 *     inline equality checks for value_equality, MISSING for
 *     not_extracted).
 */

export type CompareEquipmentSummary = {
  id: string;
  tag: string | null;
  category: string;
  flaggedCount: number;
};

/**
 * Lists equipment in a project, sorted by open-findings count desc
 * (so the equipment with the most flagged issues defaults first in the
 * selector). Equipment with no findings still appears, just lower.
 */
export async function listEquipmentForCompare(args: {
  workspaceId: string;
  projectId: string;
}): Promise<CompareEquipmentSummary[]> {
  const { workspaceId, projectId } = args;
  const rows = (await db.execute(sql`
    SELECT
      e.id,
      e.tag,
      e.category,
      COALESCE(f.flagged_count, 0)::int AS flagged_count
    FROM equipment e
    LEFT JOIN (
      SELECT
        unnest(equipment_ids) AS equipment_id,
        COUNT(*) AS flagged_count
      FROM findings
      WHERE project_id = ${projectId}::uuid
        AND workspace_id = ${workspaceId}::uuid
        AND status = 'open'
      GROUP BY equipment_id
    ) f ON f.equipment_id = e.id
    WHERE e.project_id = ${projectId}::uuid
      AND e.workspace_id = ${workspaceId}::uuid
    ORDER BY COALESCE(f.flagged_count, 0) DESC, e.tag NULLS LAST
  `)) as unknown as Array<{
    id: string;
    tag: string | null;
    category: string;
    flagged_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    tag: r.tag,
    category: r.category,
    flaggedCount: Number(r.flagged_count),
  }));
}

export type CompareVerdict =
  | "compliant"
  | "non_compliant"
  | "uncertain"
  | "missing_value"
  | "missing_requirement"
  | "informational"
  | "not_extracted";

export type CompareRow = {
  attribute: string;
  group: AttributeGroup;
  kind: AttributeDef["kind"];
  /** Display string like "§2.2.B · p.3" — null when no spec atom found. */
  specRef: string | null;
  /** Spec-side display value, e.g. "≥ 65 kA" or "UL 891". */
  required: string | null;
  /** Submittal-side display value, e.g. "42 kA". */
  submitted: string | null;
  verdict: CompareVerdict;
  severity: "hot" | "warm" | "cool" | null;
  /**
   * Brief one-line explanation for MISSING / NON_COMPLIANT / UNCERTAIN
   * verdicts. Powers the failure-visibility surface — the post-mortem
   * called this out specifically.
   */
  reason: string | null;
  /** Linked finding (when one exists) so the row can deep-link to /today. */
  findingId: string | null;
  /** Source IDs for click-through. */
  submittalDocumentId: string | null;
  specDocumentId: string | null;
  specPage: number | null;
};

export type CompareGroup = {
  name: AttributeGroup;
  rows: CompareRow[];
  passCount: number;
  evaluatedCount: number;
};

export type CompareData = {
  equipment: {
    id: string;
    tag: string | null;
    category: string;
    csiSections: string[];
  };
  groups: CompareGroup[];
  summary: {
    /** Rows that were evaluated (excludes not_extracted + missing_requirement). */
    evaluatedCount: number;
    /** Of evaluated rows, how many came back compliant. */
    passCount: number;
    /** Total flagged (non_compliant) rows. */
    flaggedCount: number;
    /** Total rows shown (includes MISSING). */
    totalCount: number;
  };
};

type SubmittalSlice = {
  documentId: string;
  fields: Record<string, unknown>;
};

type FindingSlice = {
  id: string;
  ruleId: string | null;
  verdict: string;
  severity: "hot" | "warm" | "cool";
  summary: string;
  evidence: Array<{
    sourceKind: string;
    documentId: string | null;
    pageNum: number | null;
    snippet: string | null;
  }>;
};

/**
 * Build the compliance-table data for one equipment. Returns null if
 * the equipment doesn't exist or doesn't belong to the project.
 *
 * Performance shape:
 *   - 1 query each: equipment, latest submittal fields, all findings
 *   - N parallel retrieve() calls (N = number of value_equality
 *     attributes ~ 5). Each retrieve does 2 SQL legs (BM25 + vector).
 *     Total ~10 round-trips per page render. Acceptable for v0; can
 *     batch into one combined retrieve later.
 */
export async function buildCompareData(args: {
  workspaceId: string;
  projectId: string;
  equipmentId: string;
}): Promise<CompareData | null> {
  const { workspaceId, projectId, equipmentId } = args;

  // 1. Load equipment.
  const equipmentRows = await db
    .select({
      id: equipment.id,
      tag: equipment.tag,
      tagNormalized: equipment.tagNormalized,
      category: equipment.category,
      csiSections: equipment.csiSections,
    })
    .from(equipment)
    .where(
      and(
        eq(equipment.id, equipmentId),
        eq(equipment.projectId, projectId),
        eq(equipment.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  const eq0 = equipmentRows[0];
  if (!eq0) return null;

  // 2. Load latest non-rejected submittal_fields for this equipment.
  const submittal = await loadLatestSubmittal({
    workspaceId,
    projectId,
    tagNormalized: eq0.tagNormalized,
  });

  // 3. Load all open findings linked to this equipment.
  const findingsList = await loadFindingsForEquipment({
    workspaceId,
    projectId,
    equipmentId,
  });

  // 4. ONE broad retrieve() for all value_equality attributes (was 5
  //    parallel calls — instantly hit Voyage's 3-RPM free-tier rate
  //    limit on the first page load and crashed the route). The
  //    panelboard requirements live within the same spec section
  //    (typically 26 24 16 §2.x), so a single broad query against the
  //    project + a generous k pulls a candidate pool that covers
  //    every attribute. Per-attribute extractors then pick their best
  //    match from the shared pool.
  //
  //    Trade-off: a broad query gives slightly less-targeted ranking
  //    than per-attribute queries did. Acceptable for v0 — the demo
  //    spec is small and the candidate pool dominates the per-attr
  //    relevance signal anyway. If precision suffers as the corpus
  //    grows, the answer is to memoize embeds (deterministic query
  //    strings) rather than re-fan-out the retrievals.
  const equalityAttrs = PANELBOARD_ATTRIBUTES.filter(
    (a) => a.kind === "value_equality",
  );
  const queryHint = eq0.tag ?? eq0.tagNormalized ?? "";
  const broadQuery = [
    queryHint,
    ...equalityAttrs.map((a) => a.retrievalQuery ?? ""),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const candidatePool = broadQuery
    ? await retrieve({
        query: broadQuery,
        projectId,
        workspaceId,
        // No requirementType filter on the pool — different attributes
        // need different filters; pulling the union and letting
        // extractors decide is simpler than per-leg filtering.
        k: 24,
      })
    : [];
  const equalityAtomByDisplay = new Map<string, RetrievedAtom | null>();
  for (const a of equalityAttrs) {
    // Optional per-attribute filter: if the attribute names a
    // requirementType, narrow the pool to atoms of that type before
    // running the extractor. Otherwise the extractor walks the whole
    // pool and picks the first atom that yields a non-null required
    // value.
    const pool = a.requirementType
      ? candidatePool.filter((atom) => atom.requirementType === a.requirementType)
      : candidatePool;
    const found = pool.find((atom) =>
      a.extractRequired ? a.extractRequired(atom) != null : false,
    );
    equalityAtomByDisplay.set(a.display, found ?? null);
  }

  // 5. Walk the schema, build CompareRows.
  const rows: CompareRow[] = PANELBOARD_ATTRIBUTES.map((attr) =>
    buildRow({
      attr,
      submittal,
      findings: findingsList,
      retrievedAtom: equalityAtomByDisplay.get(attr.display) ?? null,
    }),
  );

  // 6. Group + summary.
  const groups: CompareGroup[] = ATTRIBUTE_GROUPS.map((name) => {
    const groupRows = rows.filter((r) => r.group === name);
    const evaluated = groupRows.filter((r) => isEvaluated(r));
    return {
      name,
      rows: groupRows,
      passCount: evaluated.filter((r) => r.verdict === "compliant").length,
      evaluatedCount: evaluated.length,
    };
  });
  const evaluatedRows = rows.filter(isEvaluated);
  const summary = {
    evaluatedCount: evaluatedRows.length,
    passCount: evaluatedRows.filter((r) => r.verdict === "compliant").length,
    flaggedCount: rows.filter((r) => r.verdict === "non_compliant").length,
    totalCount: rows.length,
  };

  return {
    equipment: {
      id: eq0.id,
      tag: eq0.tag,
      category: eq0.category,
      csiSections: eq0.csiSections,
    },
    groups,
    summary,
  };
}

// ---------- pure helpers (exported for tests) ----------

/**
 * A row "counts" toward pass/total when it had real inputs to evaluate.
 * Not-extracted rows and rows where the spec doesn't ask for the
 * attribute (informational) don't dilute the pass-rate denominator.
 */
export function isEvaluated(row: CompareRow): boolean {
  return (
    row.verdict === "compliant" ||
    row.verdict === "non_compliant" ||
    row.verdict === "uncertain" ||
    row.verdict === "missing_value"
  );
}

/**
 * Pure row builder. Given an attribute definition + the equipment's
 * submittal/findings/retrieved atom, returns the rendered CompareRow.
 *
 * Three branches by attribute kind:
 *   not_extracted   → MISSING with reason explaining we don't extract it yet
 *   rule_driven     → look up matching finding, pull verdict + severity +
 *                     spec citation from the finding's primary evidence
 *   value_equality  → pull required from retrieved atom + run inlineCheck
 */
export function buildRow(args: {
  attr: AttributeDef;
  submittal: SubmittalSlice | null;
  findings: FindingSlice[];
  retrievedAtom: RetrievedAtom | null;
}): CompareRow {
  const { attr, submittal, findings: findingsList, retrievedAtom } = args;
  const submittedDisplay = submittal
    ? attr.readSubmitted(submittal.fields)
    : null;
  const submittalDocumentId = submittal?.documentId ?? null;

  if (attr.kind === "not_extracted") {
    return {
      attribute: attr.display,
      group: attr.group,
      kind: attr.kind,
      specRef: null,
      required: null,
      submitted: submittedDisplay,
      verdict: "not_extracted",
      severity: null,
      reason: "Not yet extracted by Voltaic — Phase B coverage gap",
      findingId: null,
      submittalDocumentId,
      specDocumentId: null,
      specPage: null,
    };
  }

  if (attr.kind === "rule_driven") {
    const finding = findingsList.find((f) => f.ruleId === attr.ruleId) ?? null;
    if (!finding) {
      // Rule didn't fire — usually because submitted value is missing
      // (the readiness event never emitted), or the spec atom never
      // surfaced. Either way: surface as MISSING with the right reason.
      const reason = !submittedDisplay
        ? "No submitted value extracted from cut sheet"
        : "Rule did not produce a finding (spec requirement not retrieved)";
      return {
        attribute: attr.display,
        group: attr.group,
        kind: attr.kind,
        specRef: null,
        required: null,
        submitted: submittedDisplay,
        verdict: !submittedDisplay ? "missing_value" : "missing_requirement",
        severity: null,
        reason,
        findingId: null,
        submittalDocumentId,
        specDocumentId: null,
        specPage: null,
      };
    }
    const specEvidence = finding.evidence.find(
      (e) => e.sourceKind === "spec_paragraph",
    );
    const required = specEvidence?.snippet ?? "(see finding)";
    const verdict = mapFindingVerdict(finding.verdict);
    return {
      attribute: attr.display,
      group: attr.group,
      kind: attr.kind,
      specRef: specEvidence?.pageNum
        ? `p. ${specEvidence.pageNum}`
        : null,
      required,
      submitted: submittedDisplay,
      verdict,
      severity: finding.severity,
      reason:
        verdict === "non_compliant" || verdict === "uncertain"
          ? finding.summary
          : null,
      findingId: finding.id,
      submittalDocumentId,
      specDocumentId: specEvidence?.documentId ?? null,
      specPage: specEvidence?.pageNum ?? null,
    };
  }

  // kind === 'value_equality'
  const required = retrievedAtom && attr.extractRequired
    ? attr.extractRequired(retrievedAtom)
    : null;
  const inlineVerdict: InlineVerdict = attr.inlineCheck
    ? attr.inlineCheck(submittedDisplay, required)
    : "uncertain";
  const verdict = mapInlineVerdict({ submittedDisplay, required, inlineVerdict });
  return {
    attribute: attr.display,
    group: attr.group,
    kind: attr.kind,
    specRef: retrievedAtom?.pageNum ? `p. ${retrievedAtom.pageNum}` : null,
    required,
    submitted: submittedDisplay,
    verdict,
    severity: null,
    reason:
      verdict === "non_compliant"
        ? "Submitted value does not match spec requirement"
        : verdict === "missing_value"
          ? "No submitted value extracted from cut sheet"
          : verdict === "missing_requirement"
            ? "Spec doesn't appear to call out this attribute"
            : null,
    findingId: null,
    submittalDocumentId,
    specDocumentId: retrievedAtom?.documentId ?? null,
    specPage: retrievedAtom?.pageNum ?? null,
  };
}

function mapFindingVerdict(v: string): CompareVerdict {
  if (v === "compliant") return "compliant";
  if (v === "non_compliant") return "non_compliant";
  if (v === "uncertain") return "uncertain";
  // "no_conflict" (used by contradictions) treated as informational here.
  return "informational";
}

function mapInlineVerdict(args: {
  submittedDisplay: string | null;
  required: string | null;
  inlineVerdict: InlineVerdict;
}): CompareVerdict {
  const { submittedDisplay, required, inlineVerdict } = args;
  if (!submittedDisplay && !required) return "informational";
  if (!submittedDisplay) return "missing_value";
  if (!required) return "missing_requirement";
  if (inlineVerdict === "compliant") return "compliant";
  if (inlineVerdict === "non_compliant") return "non_compliant";
  return "uncertain";
}

// ---------- private DB helpers ----------

async function loadLatestSubmittal(args: {
  workspaceId: string;
  projectId: string;
  tagNormalized: string | null;
}): Promise<SubmittalSlice | null> {
  if (!args.tagNormalized) return null;
  const rows = await db
    .select({
      documentId: submittalFields.documentId,
      fields: submittalFields.fields,
      submittalStatus: documents.submittalStatus,
      createdAt: submittalFields.createdAt,
    })
    .from(submittalFields)
    .innerJoin(documents, eq(documents.id, submittalFields.documentId))
    .where(
      and(
        eq(submittalFields.workspaceId, args.workspaceId),
        eq(documents.projectId, args.projectId),
        eq(submittalFields.tagNormalized, args.tagNormalized),
      ),
    )
    .orderBy(desc(submittalFields.createdAt));
  // Skip rejected / revise_resubmit submittals (consistent with the
  // rules' xref filter).
  const usable = rows.find(
    (r) =>
      r.submittalStatus == null ||
      (r.submittalStatus !== "rejected" &&
        r.submittalStatus !== "revise_resubmit"),
  );
  if (!usable) return null;
  return {
    documentId: usable.documentId,
    fields: (usable.fields as Record<string, unknown>) ?? {},
  };
}

async function loadFindingsForEquipment(args: {
  workspaceId: string;
  projectId: string;
  equipmentId: string;
}): Promise<FindingSlice[]> {
  const rows = (await db.execute(sql`
    SELECT
      id,
      rule_id        AS "ruleId",
      verdict,
      severity,
      summary,
      evidence
    FROM findings
    WHERE project_id   = ${args.projectId}::uuid
      AND workspace_id = ${args.workspaceId}::uuid
      AND status       = 'open'
      AND ${args.equipmentId}::uuid = ANY(equipment_ids)
  `)) as unknown as Array<{
    id: string;
    ruleId: string | null;
    verdict: string;
    severity: "hot" | "warm" | "cool";
    summary: string;
    evidence: FindingSlice["evidence"];
  }>;
  return rows;
}
