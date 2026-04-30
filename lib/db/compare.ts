import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import {
  documents,
  specChecklistItems,
  submittalChecklistResponses,
} from "./schema";

/**
 * Data layer for /compare. Phase B PR 3: reads from the spec-driven
 * extraction path (assignments + checklist + responses) instead of the
 * old hardcoded panelboard schema. The shim in lib/rag/compare/
 * attributes.ts is now unused by the compare page; analyze-* runners
 * still rely on parts of it but those will migrate next.
 *
 * Two entry points:
 *   listSubmittalsForCompare — sidebar selector content (which
 *     submittals exist in the project, sorted by flagged-count desc).
 *   buildCompareDataForSubmittal — for one (submittal, spec) pair,
 *     join the spec's checklist with the submittal's responses and
 *     compute a verdict per row.
 */

export type SubmittalSummary = {
  id: string;
  filename: string;
  /** How many checklist responses the submittal failed (computed via comparator). */
  flaggedCount: number;
  /** Total checklist items across all assigned specs. */
  totalCount: number;
  /** Number of distinct spec assignments. */
  assignmentCount: number;
};

export async function listSubmittalsForCompare(args: {
  workspaceId: string;
  projectId: string;
}): Promise<SubmittalSummary[]> {
  const rows = (await db.execute(sql`
    SELECT
      d.id,
      d.filename,
      COALESCE(asgn.n, 0)::int AS "assignmentCount"
    FROM documents d
    LEFT JOIN (
      SELECT submittal_document_id, COUNT(*) AS n
      FROM submittal_spec_assignments
      WHERE workspace_id = ${args.workspaceId}::uuid
      GROUP BY submittal_document_id
    ) asgn ON asgn.submittal_document_id = d.id
    WHERE d.project_id   = ${args.projectId}::uuid
      AND d.workspace_id = ${args.workspaceId}::uuid
      AND d.doc_type     = 'submittal'
    ORDER BY d.uploaded_at DESC
  `)) as unknown as Array<{
    id: string;
    filename: string;
    assignmentCount: number;
  }>;

  if (rows.length === 0) return [];

  // Per-submittal pass/fail counts. Verdict computation matches what
  // buildCompareDataForSubmittal does — simple cases inline (numeric
  // ≥/≤/=, enum =/in, boolean =) so the selector can sort by
  // flagged-count without re-running the full builder per row.
  const counts = (await db.execute(sql`
    SELECT
      r.submittal_document_id AS "submittalDocumentId",
      COUNT(*) FILTER (WHERE r.found = false)::int AS "missing",
      COUNT(*)::int AS "total"
    FROM submittal_checklist_responses r
    WHERE r.workspace_id = ${args.workspaceId}::uuid
    GROUP BY r.submittal_document_id
  `)) as unknown as Array<{
    submittalDocumentId: string;
    missing: number;
    total: number;
  }>;
  const countsByDoc = new Map<string, { missing: number; total: number }>();
  for (const c of counts) {
    countsByDoc.set(c.submittalDocumentId, {
      missing: Number(c.missing),
      total: Number(c.total),
    });
  }

  // For non-found rows we know there's no comparison; for found rows we
  // need the actual comparator check. Pull the joined data once per
  // submittal to count failures.
  const flaggedRows = (await db.execute(sql`
    SELECT
      r.submittal_document_id AS "submittalDocumentId",
      r.value,
      i.required_kind          AS "requiredKind",
      i.comparator,
      i.required_value         AS "requiredValue"
    FROM submittal_checklist_responses r
    JOIN spec_checklist_items i ON i.id = r.spec_checklist_item_id
    WHERE r.workspace_id = ${args.workspaceId}::uuid
      AND r.found = true
  `)) as unknown as Array<{
    submittalDocumentId: string;
    value: unknown;
    requiredKind: string;
    comparator: string;
    requiredValue: unknown;
  }>;
  const flaggedByDoc = new Map<string, number>();
  for (const r of flaggedRows) {
    const verdict = computeVerdict({
      submittedValue: r.value,
      requiredKind: r.requiredKind as RequiredKind,
      comparator: r.comparator as Comparator,
      requiredValue: r.requiredValue,
    });
    if (verdict === "non_compliant") {
      flaggedByDoc.set(
        r.submittalDocumentId,
        (flaggedByDoc.get(r.submittalDocumentId) ?? 0) + 1,
      );
    }
  }

  return rows
    .map((r) => {
      const c = countsByDoc.get(r.id) ?? { missing: 0, total: 0 };
      const fcompare = flaggedByDoc.get(r.id) ?? 0;
      return {
        id: r.id,
        filename: r.filename,
        flaggedCount: c.missing + fcompare,
        totalCount: c.total,
        assignmentCount: Number(r.assignmentCount),
      };
    })
    .sort((a, b) => b.flaggedCount - a.flaggedCount);
}

// ---------- compare data builder ----------

export type RequiredKind =
  | "numeric"
  | "enum"
  | "boolean"
  | "manufacturer_list"
  | "qualitative";
export type Comparator = "≥" | "≤" | "=" | "⊇" | "in";

export type CompareVerdict =
  | "compliant"
  | "non_compliant"
  | "uncertain"
  | "missing_value"
  | "not_assigned";

export type CompareRow = {
  /** spec_checklist_items.id */
  id: string;
  attribute: string;
  group: string;
  requiredKind: RequiredKind;
  comparator: Comparator;
  /** spec required value, formatted for display */
  requiredDisplay: string;
  /** submittal value, formatted for display, or null when found=false */
  submittedDisplay: string | null;
  /** spec citation: "§2.05/B · p.4" */
  specRef: string | null;
  /** submittal citation: "p.2" */
  submittalRef: string | null;
  verdict: CompareVerdict;
  reason: string | null;
  /** Raw quote from the submittal's response (when found=true). */
  submittalQuote: string | null;
  /** Raw quote from the spec's checklist item. */
  specQuote: string | null;
};

export type CompareGroup = {
  name: string;
  rows: CompareRow[];
  passCount: number;
  evaluatedCount: number;
};

export type CompareSpecAssignment = {
  specDocumentId: string;
  specFilename: string;
  csiSection: string | null;
};

export type CompareData = {
  submittal: { id: string; filename: string };
  /** All assignments for this submittal — UI shows chips when >1. */
  assignments: CompareSpecAssignment[];
  /** Which assignment drove this view (matches one of `assignments`). */
  activeAssignment: CompareSpecAssignment;
  groups: CompareGroup[];
  summary: {
    totalCount: number;
    evaluatedCount: number;
    passCount: number;
    flaggedCount: number;
    missingCount: number;
  };
};

export type CompareEmptyReason =
  | "submittal_not_found"
  | "submittal_not_assigned"
  | "checklist_not_ready"
  | "responses_not_ready";

/**
 * Empty-state result from buildCompareDataForSubmittal.
 *
 * For reasons where the submittal IS assigned (checklist_not_ready,
 * responses_not_ready), surface the active assignment so the page can
 * render a "Run Compliance" CTA targeting the right pair without a
 * second round-trip.
 */
export type CompareEmpty = {
  empty: CompareEmptyReason;
  activeAssignment?: CompareSpecAssignment;
  submittal?: { id: string; filename: string };
};

export async function buildCompareDataForSubmittal(args: {
  workspaceId: string;
  projectId: string;
  submittalId: string;
  /** Optional spec narrowing — defaults to first assigned. */
  specId?: string | null;
}): Promise<CompareData | CompareEmpty> {
  const { workspaceId, projectId, submittalId, specId } = args;

  const subRows = await db
    .select({ id: documents.id, filename: documents.filename })
    .from(documents)
    .where(
      and(
        eq(documents.id, submittalId),
        eq(documents.projectId, projectId),
        eq(documents.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  const submittal = subRows[0];
  if (!submittal) return { empty: "submittal_not_found" };

  const assignments = (await db.execute(sql`
    SELECT
      a.spec_document_id AS "specDocumentId",
      a.csi_section      AS "csiSection",
      d.filename         AS "specFilename"
    FROM submittal_spec_assignments a
    JOIN documents d ON d.id = a.spec_document_id
    WHERE a.submittal_document_id = ${submittalId}::uuid
      AND a.workspace_id          = ${workspaceId}::uuid
    ORDER BY a.created_at ASC
  `)) as unknown as Array<{
    specDocumentId: string;
    csiSection: string | null;
    specFilename: string;
  }>;
  if (assignments.length === 0) return { empty: "submittal_not_assigned" };

  const active =
    (specId
      ? assignments.find((a) => a.specDocumentId === specId)
      : null) ?? assignments[0];

  // Load checklist items for the active spec (+ csi section if narrowed).
  const checklistConds = [eq(specChecklistItems.documentId, active.specDocumentId)];
  if (active.csiSection)
    checklistConds.push(eq(specChecklistItems.csiSection, active.csiSection));
  const items = await db
    .select({
      id: specChecklistItems.id,
      attribute: specChecklistItems.attribute,
      requiredKind: specChecklistItems.requiredKind,
      comparator: specChecklistItems.comparator,
      requiredValue: specChecklistItems.requiredValue,
      unit: specChecklistItems.unit,
      rawQuote: specChecklistItems.rawQuote,
      csiSection: specChecklistItems.csiSection,
      csiPath: specChecklistItems.csiPath,
    })
    .from(specChecklistItems)
    .where(and(...checklistConds));
  if (items.length === 0) {
    return {
      empty: "checklist_not_ready",
      activeAssignment: active,
      submittal,
    };
  }

  // Load responses for this submittal across the items above.
  const itemIds = items.map((i) => i.id);
  const responses = await db
    .select({
      specChecklistItemId: submittalChecklistResponses.specChecklistItemId,
      found: submittalChecklistResponses.found,
      value: submittalChecklistResponses.value,
      evidenceQuote: submittalChecklistResponses.evidenceQuote,
      pageNum: submittalChecklistResponses.pageNum,
    })
    .from(submittalChecklistResponses)
    .where(
      and(
        eq(submittalChecklistResponses.submittalDocumentId, submittalId),
        eq(submittalChecklistResponses.workspaceId, workspaceId),
      ),
    );
  if (responses.length === 0) {
    return {
      empty: "responses_not_ready",
      activeAssignment: active,
      submittal,
    };
  }
  const responseByItemId = new Map<string, (typeof responses)[number]>();
  for (const r of responses) responseByItemId.set(r.specChecklistItemId, r);
  void itemIds;

  // Build rows.
  const allRows: CompareRow[] = items.map((item) => {
    const resp = responseByItemId.get(item.id);
    return buildCompareRow({
      item: {
        id: item.id,
        attribute: item.attribute,
        requiredKind: item.requiredKind as RequiredKind,
        comparator: item.comparator as Comparator,
        requiredValue: item.requiredValue,
        unit: item.unit,
        rawQuote: item.rawQuote,
        csiPath: item.csiPath,
      },
      response: resp
        ? {
            found: resp.found,
            value: resp.value,
            evidenceQuote: resp.evidenceQuote,
            pageNum: resp.pageNum,
          }
        : null,
    });
  });

  // Group by category — coarse heuristic on attribute name. Phase C
  // refines with spec-section + part info; for v1 the buckets are
  // good enough to render the mock.
  const groups: CompareGroup[] = collectIntoGroups(allRows);

  // Summary.
  const evaluatedCount = allRows.filter(
    (r) => r.verdict === "compliant" || r.verdict === "non_compliant" || r.verdict === "uncertain",
  ).length;
  const passCount = allRows.filter((r) => r.verdict === "compliant").length;
  const flaggedCount = allRows.filter((r) => r.verdict === "non_compliant").length;
  const missingCount = allRows.filter((r) => r.verdict === "missing_value").length;

  return {
    submittal: { id: submittal.id, filename: submittal.filename },
    assignments,
    activeAssignment: active,
    groups,
    summary: {
      totalCount: allRows.length,
      evaluatedCount,
      passCount,
      flaggedCount,
      missingCount,
    },
  };
}

// ---------- pure helpers (exported for tests) ----------

type Item = {
  id: string;
  attribute: string;
  requiredKind: RequiredKind;
  comparator: Comparator;
  requiredValue: unknown;
  unit: string | null;
  rawQuote: string;
  csiPath: string;
};
type Response = {
  found: boolean;
  value: unknown;
  evidenceQuote: string | null;
  pageNum: number | null;
};

export function buildCompareRow(args: {
  item: Item;
  response: Response | null;
}): CompareRow {
  const { item, response } = args;

  const requiredDisplay = formatValueForDisplay(
    item.requiredValue,
    item.requiredKind,
    item.unit,
    item.comparator,
  );
  const specRef = formatCsiRef(item.csiPath);

  if (!response || response.found === false) {
    return {
      id: item.id,
      attribute: item.attribute,
      group: groupFor(item.attribute),
      requiredKind: item.requiredKind,
      comparator: item.comparator,
      requiredDisplay,
      submittedDisplay: null,
      specRef,
      submittalRef: null,
      verdict: "missing_value",
      reason: response
        ? "Submittal silent on this requirement"
        : "Submittal extraction not yet run for this item",
      submittalQuote: null,
      specQuote: item.rawQuote,
    };
  }

  const submittedDisplay = formatValueForDisplay(
    response.value,
    item.requiredKind,
    item.unit,
    null,
  );
  const verdict = computeVerdict({
    submittedValue: response.value,
    requiredKind: item.requiredKind,
    comparator: item.comparator,
    requiredValue: item.requiredValue,
  });

  return {
    id: item.id,
    attribute: item.attribute,
    group: groupFor(item.attribute),
    requiredKind: item.requiredKind,
    comparator: item.comparator,
    requiredDisplay,
    submittedDisplay,
    specRef,
    submittalRef: response.pageNum ? `p.${response.pageNum}` : null,
    verdict,
    reason: verdictReason(verdict, item, response),
    submittalQuote: response.evidenceQuote,
    specQuote: item.rawQuote,
  };
}

export function computeVerdict(args: {
  submittedValue: unknown;
  requiredKind: RequiredKind;
  comparator: Comparator;
  requiredValue: unknown;
}): CompareVerdict {
  const { submittedValue, requiredKind, comparator, requiredValue } = args;
  if (submittedValue === null || submittedValue === undefined)
    return "missing_value";

  switch (requiredKind) {
    case "numeric": {
      if (typeof submittedValue !== "number" || typeof requiredValue !== "number")
        return "uncertain";
      if (comparator === "≥") return submittedValue >= requiredValue ? "compliant" : "non_compliant";
      if (comparator === "≤") return submittedValue <= requiredValue ? "compliant" : "non_compliant";
      if (comparator === "=") return submittedValue === requiredValue ? "compliant" : "non_compliant";
      return "uncertain";
    }
    case "boolean": {
      if (typeof submittedValue !== "boolean" || typeof requiredValue !== "boolean")
        return "uncertain";
      return submittedValue === requiredValue ? "compliant" : "non_compliant";
    }
    case "enum": {
      if (typeof submittedValue !== "string") return "uncertain";
      if (comparator === "=") {
        return typeof requiredValue === "string" && submittedValue === requiredValue
          ? "compliant"
          : "non_compliant";
      }
      if (comparator === "in") {
        return Array.isArray(requiredValue) &&
          requiredValue.some((v) => v === submittedValue)
          ? "compliant"
          : "non_compliant";
      }
      return "uncertain";
    }
    case "manufacturer_list": {
      if (typeof submittedValue !== "string") return "uncertain";
      return Array.isArray(requiredValue) &&
        requiredValue.some(
          (v) => typeof v === "string" && v.toLowerCase() === submittedValue.toLowerCase(),
        )
        ? "compliant"
        : "non_compliant";
    }
    case "qualitative":
      // True equivalence judgment requires LLM call (deferred).
      // For v1: surface as "uncertain" so PM verifies. Defaulting to
      // compliant would silently approve free-text drift; defaulting
      // to non_compliant would clutter with false positives.
      return "uncertain";
    default:
      return "uncertain";
  }
}

function verdictReason(
  verdict: CompareVerdict,
  item: Item,
  response: Response,
): string | null {
  if (verdict === "compliant") return null;
  if (verdict === "non_compliant") {
    return `Submittal value does not satisfy "${item.comparator} ${formatValueForDisplay(
      item.requiredValue,
      item.requiredKind,
      item.unit,
      null,
    )}"`;
  }
  if (verdict === "uncertain") {
    if (item.requiredKind === "qualitative")
      return "Free-text requirement — engineer should verify equivalence";
    return "Could not auto-evaluate";
  }
  if (verdict === "missing_value")
    return response.found === false ? "Submittal silent on this requirement" : null;
  return null;
}

function formatValueForDisplay(
  value: unknown,
  kind: RequiredKind,
  unit: string | null,
  comparator: Comparator | null,
): string {
  const u = unit ? ` ${unit}` : "";
  const cmp = comparator && comparator !== "=" ? `${comparator} ` : "";
  if (value === null || value === undefined) return "—";
  if (kind === "numeric" && typeof value === "number") return `${cmp}${value}${u}`;
  if (kind === "boolean" && typeof value === "boolean")
    return value ? "Yes" : "No";
  if (kind === "enum" && Array.isArray(value)) return value.join(" or ");
  if (kind === "manufacturer_list" && Array.isArray(value))
    return value.join(", ");
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatCsiRef(csiPath: string): string | null {
  // csiPath shape "26 24 16/2/2.05/B" → "§2.05/B"
  const parts = csiPath.split("/").filter(Boolean);
  if (parts.length < 3) return null;
  return `§${parts.slice(2).join("/")}`;
}

/**
 * Coarse attribute → category bucket. Phase C will use spec-section
 * + part info; for v1 the buckets are good enough to render image 2.
 */
function groupFor(attribute: string): string {
  const a = attribute.toLowerCase();
  if (
    a.includes("aic") ||
    a.includes("sccr") ||
    a.includes("voltage") ||
    a.includes("phase") ||
    a.includes("wires") ||
    a.includes("ampacity") ||
    a.includes("main_type") ||
    a.includes("poles") ||
    a.includes("series_rated") ||
    a.includes("listing") ||
    a.includes("manufacturer")
  )
    return "Ratings & listings";
  if (
    a.includes("enclosure") ||
    a.includes("bus") ||
    a.includes("ground") ||
    a.includes("mounting") ||
    a.includes("clearance") ||
    a.includes("plating")
  )
    return "Construction & install";
  return "Other";
}

function collectIntoGroups(rows: CompareRow[]): CompareGroup[] {
  const order = ["Ratings & listings", "Construction & install", "Other"];
  const map = new Map<string, CompareRow[]>();
  for (const r of rows) {
    if (!map.has(r.group)) map.set(r.group, []);
    map.get(r.group)!.push(r);
  }
  return order
    .filter((name) => map.has(name))
    .map((name) => {
      const groupRows = map.get(name)!;
      const evaluated = groupRows.filter(
        (r) =>
          r.verdict === "compliant" ||
          r.verdict === "non_compliant" ||
          r.verdict === "uncertain",
      );
      return {
        name,
        rows: groupRows,
        passCount: evaluated.filter((r) => r.verdict === "compliant").length,
        evaluatedCount: evaluated.length,
      };
    });
}

