import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { embed } from "@/lib/embed";
import { rrf, type Ranked } from "./rrf";

/**
 * Hybrid retrieval over project-scoped specs AND submittals.
 *
 * Three source kinds participate, gated by `sources`:
 *   - spec_paragraph    — BM25 + vector over spec_paragraphs
 *                          (semantic + exact-token recall)
 *   - submittal_field   — BM25 over submittal_fields' flattened jsonb
 *                          ("MDP-A · Square D QED-2 · aic_ka: 65")
 *   - submittal_response — BM25 over the verbatim evidence_quote text
 *                           captured during guided extraction
 *
 * Submittal data is short, code-heavy, and largely numeric ("65 kAIC",
 * "NEMA 1", "Square D QED-2"). BM25 wins on this content; embeddings
 * add little for v1. Add a vector leg later if recall on natural-
 * language submittal questions ("does the cut sheet mention painted
 * bus?") proves insufficient.
 *
 * All legs feed into the same RRF fusion. Per-source rank lists are
 * preserved in the output for explainability.
 *
 * Filters:
 *   - csiSection         : exact match on canonical "NN NN NN" (spec only)
 *   - requirementType    : 'aic'|'sccr'|'enclosure'|...        (spec only)
 *   - referencedStandard : array contains, e.g. "UL 489"       (spec only)
 *   - documentIds        : restrict ANY leg to a subset of source docs
 *
 * Returns up to `k` atoms (default 12), sorted by fused RRF score
 * descending. Each atom carries enough information to render a
 * citation chip and trace back to the source row by id.
 */

export type RetrieveSources = {
  specs?: boolean;
  submittals?: boolean;
};

export type RetrieveFilters = {
  csiSection?: string;
  requirementType?: string;
  referencedStandard?: string;
  documentIds?: string[];
};

export type RetrievedAtomSourceKind =
  | "spec_paragraph"
  | "submittal_field"
  | "submittal_response"
  | "submittal_page";

export type RetrievedAtom = {
  id: string;
  sourceKind: RetrievedAtomSourceKind;
  documentId: string;
  pageNum: number | null;
  // Spec-only metadata (null for submittal sources).
  csiSection: string | null;
  csiPart: string | null;
  csiArticle: string | null;
  csiParagraph: string | null;
  requirementType: string | null;
  referencedStandards: string[];
  // Submittal-only metadata. Optional to keep spec-atom fixtures
  // (which never set these) backward-compatible — register helpers
  // here set them to null explicitly, but consumers can omit.
  equipmentTag?: string | null;
  vendorModel?: string | null;
  attribute?: string | null;
  // Common: the text the LLM sees in the <context> block + the
  // citation popover renders as snippet.
  content: string;
  score: number;
  ranks: { bm25: number | null; vector: number | null };
};

export type RetrieveInput = {
  query: string;
  projectId: string;
  workspaceId: string;
  sources?: RetrieveSources;
  filters?: RetrieveFilters;
  k?: number;
  /**
   * How many candidates each leg pulls before fusion. Higher → better
   * recall, more DB work. Default 40 per leg, fused down to k.
   */
  candidatesPerLeg?: number;
};

type SpecRow = {
  id: string;
  documentId: string;
  pageNum: number | null;
  csiSection: string | null;
  csiPart: string | null;
  csiArticle: string | null;
  csiParagraph: string | null;
  requirementType: string | null;
  referencedStandards: string[];
  content: string;
};

type SubmittalFieldRow = {
  id: string;
  documentId: string;
  pageNum: number | null;
  equipmentTag: string | null;
  vendor: string | null;
  modelNum: string | null;
  fields: Record<string, unknown>;
};

type SubmittalResponseRow = {
  id: string;
  submittalDocumentId: string;
  pageNum: number | null;
  attribute: string | null;
  evidenceQuote: string | null;
  value: unknown;
};

type SubmittalPageRow = {
  id: string;
  documentId: string;
  pageNum: number;
  textContent: string | null;
};

function buildSpecFilterFragments(filters: RetrieveFilters | undefined) {
  const clauses = [sql`TRUE`];
  if (filters?.csiSection) {
    clauses.push(sql`p.csi_section = ${filters.csiSection}`);
  }
  if (filters?.requirementType) {
    clauses.push(sql`p.requirement_type = ${filters.requirementType}`);
  }
  if (filters?.referencedStandard) {
    clauses.push(
      sql`${filters.referencedStandard} = ANY(p.referenced_standards)`,
    );
  }
  if (filters?.documentIds && filters.documentIds.length > 0) {
    clauses.push(
      sql`p.document_id IN (${sql.join(
        filters.documentIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  return sql.join(clauses, sql` AND `);
}

function buildSubmittalDocFilter(filters: RetrieveFilters | undefined) {
  const clauses = [sql`TRUE`];
  if (filters?.documentIds && filters.documentIds.length > 0) {
    clauses.push(
      sql`d.id IN (${sql.join(
        filters.documentIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  return sql.join(clauses, sql` AND `);
}

/**
 * Convert a free-text query into an OR-style tsquery string.
 *
 * Why: `websearch_to_tsquery` AND-joins every term. That's correct
 * for paragraph-sized spec content (where the AND keeps precision
 * high), but submittal records are SHORT — a single row carrying
 * "MDP-A · Square D · QED-2 — aic_ka: 65" can't possibly contain
 * every word of a 12-word user question. AND-style queries reliably
 * miss it; OR-style with ts_rank ordering keeps precision via the
 * per-leg ranking and recall via the looser matching.
 *
 * Tokens are stripped of punctuation (Postgres tsquery syntax is
 * strict), filtered to length ≥ 3 to avoid stopword noise, and
 * suffixed with `:*` for prefix matching so 'requir' matches
 * 'requires'/'required'/'requirement' regardless of stemming.
 */
function toOrTsQuery(query: string): string | null {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9_]/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  if (tokens.length === 0) return null;
  return Array.from(new Set(tokens))
    .map((t) => `${t}:*`)
    .join(" | ");
}

const STOPWORDS = new Set([
  "the",
  "and",
  "are",
  "for",
  "from",
  "that",
  "this",
  "with",
  "what",
  "have",
  "has",
  "you",
  "can",
  "does",
  "did",
  "will",
  "would",
  "should",
  "could",
  "any",
  "all",
  "but",
  "not",
  "out",
  "into",
  "onto",
  "over",
  "under",
  "about",
  "given",
  "show",
  "tell",
  "please",
  "check",
  "whether",
]);

function flattenFields(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .filter(([k]) => !k.startsWith("_"))
    .map(([k, v]) => {
      if (v == null) return null;
      if (typeof v === "object") return null;
      return `${k}: ${String(v)}`;
    })
    .filter(Boolean)
    .join(", ");
}

function submittalFieldContent(row: SubmittalFieldRow): string {
  const head = [row.equipmentTag, row.vendor, row.modelNum]
    .filter(Boolean)
    .join(" · ");
  const body = flattenFields(row.fields ?? {});
  if (head && body) return `${head} — ${body}`;
  return head || body || "(empty submittal field record)";
}

function submittalResponseContent(row: SubmittalResponseRow): string {
  const valStr =
    row.value == null
      ? null
      : typeof row.value === "object"
        ? JSON.stringify(row.value)
        : String(row.value);
  const lead = row.attribute
    ? valStr != null
      ? `${row.attribute} = ${valStr}`
      : row.attribute
    : null;
  const quote = row.evidenceQuote ? `"${row.evidenceQuote}"` : null;
  return [lead, quote].filter(Boolean).join(" — ") || "(empty response)";
}

export async function retrieve(
  input: RetrieveInput,
): Promise<RetrievedAtom[]> {
  const k = input.k ?? 12;
  const candidatesPerLeg = input.candidatesPerLeg ?? 40;
  const filters = input.filters;
  const sources = {
    specs: input.sources?.specs !== false,
    submittals: input.sources?.submittals !== false,
  };

  const allAtoms = new Map<string, RetrievedAtom>();
  const rankings: Array<Ranked<{ id: string }>[]> = [];

  // ---------- spec legs ----------

  if (sources.specs) {
    const specWhere = buildSpecFilterFragments(filters);

    const bm25Spec = (await db.execute(sql`
      WITH pid AS (SELECT ${input.projectId}::uuid AS id),
           q   AS (SELECT websearch_to_tsquery('english', ${input.query}) AS tsq)
      SELECT
        p.id,
        p.document_id           AS "documentId",
        p.page_num              AS "pageNum",
        p.csi_section           AS "csiSection",
        p.csi_part              AS "csiPart",
        p.csi_article           AS "csiArticle",
        p.csi_paragraph         AS "csiParagraph",
        p.requirement_type      AS "requirementType",
        p.referenced_standards  AS "referencedStandards",
        p.content,
        ts_rank(p.content_tsv, q.tsq) AS score
      FROM spec_paragraphs p
      JOIN documents d ON d.id = p.document_id
      CROSS JOIN q
      CROSS JOIN pid
      WHERE p.content_tsv @@ q.tsq
        AND d.project_id = pid.id
        AND ${specWhere}
      ORDER BY score DESC
      LIMIT ${candidatesPerLeg}
    `)) as unknown as SpecRow[];

    for (const r of bm25Spec) {
      registerSpec(allAtoms, r);
    }
    rankings.push(bm25Spec.map((r, i) => ({ item: { id: r.id }, rank: i + 1 })));

    const queryEmbeddings = await embed({
      inputs: [input.query],
      ctx: { workspaceId: input.workspaceId, projectId: input.projectId },
      inputType: "query",
    });
    const queryVec = queryEmbeddings[0];
    const vecLiteral = `[${queryVec.join(",")}]`;

    const vecSpec = (await db.execute(sql`
      WITH pid AS (SELECT ${input.projectId}::uuid AS id)
      SELECT
        p.id,
        p.document_id           AS "documentId",
        p.page_num              AS "pageNum",
        p.csi_section           AS "csiSection",
        p.csi_part              AS "csiPart",
        p.csi_article           AS "csiArticle",
        p.csi_paragraph         AS "csiParagraph",
        p.requirement_type      AS "requirementType",
        p.referenced_standards  AS "referencedStandards",
        p.content,
        1 - (p.embedding <=> ${vecLiteral}::vector) AS score
      FROM spec_paragraphs p
      JOIN documents d ON d.id = p.document_id
      CROSS JOIN pid
      WHERE p.embedding IS NOT NULL
        AND d.project_id = pid.id
        AND ${specWhere}
      ORDER BY p.embedding <=> ${vecLiteral}::vector
      LIMIT ${candidatesPerLeg}
    `)) as unknown as SpecRow[];

    for (const r of vecSpec) {
      registerSpec(allAtoms, r);
    }
    rankings.push(vecSpec.map((r, i) => ({ item: { id: r.id }, rank: i + 1 })));

    // Track per-leg BM25/vector ranks for the spec atoms (downstream
    // explainability — the orchestrator doesn't use them but the rank
    // shape is part of the public RetrievedAtom contract).
    const bm25Map = new Map(bm25Spec.map((r, i) => [r.id, i + 1]));
    const vecMap = new Map(vecSpec.map((r, i) => [r.id, i + 1]));
    for (const id of bm25Map.keys()) {
      const a = allAtoms.get(id);
      if (a) a.ranks.bm25 = bm25Map.get(id) ?? null;
    }
    for (const id of vecMap.keys()) {
      const a = allAtoms.get(id);
      if (a) a.ranks.vector = vecMap.get(id) ?? null;
    }
  }

  // ---------- submittal legs ----------

  if (sources.submittals) {
    const docFilter = buildSubmittalDocFilter(filters);
    const orQuery = toOrTsQuery(input.query);

    // No usable tokens in the query — skip both submittal legs rather
    // than running them with an empty tsquery (which errors).
    if (!orQuery) {
      // fall through to spec-only fusion below
    }

    // submittal_fields — BM25 over the jsonb cast to text using an
    // OR-style query (see toOrTsQuery). Submittal rows are short, so
    // the strict AND from websearch_to_tsquery reliably misses them
    // for any multi-word user question.
    const fieldRows = orQuery
      ? ((await db.execute(sql`
      WITH pid AS (SELECT ${input.projectId}::uuid AS id),
           q   AS (SELECT to_tsquery('english', ${orQuery}) AS tsq)
      SELECT
        f.id,
        f.document_id     AS "documentId",
        f.page_num        AS "pageNum",
        f.equipment_tag   AS "equipmentTag",
        f.vendor,
        f.model_num       AS "modelNum",
        f.fields,
        ts_rank(
          to_tsvector('english',
            coalesce(f.equipment_tag,'') || ' ' ||
            coalesce(f.vendor,'')        || ' ' ||
            coalesce(f.model_num,'')     || ' ' ||
            coalesce(f.fields::text,'')
          ),
          q.tsq
        ) AS score
      FROM submittal_fields f
      JOIN documents d ON d.id = f.document_id
      CROSS JOIN q
      CROSS JOIN pid
      WHERE d.project_id = pid.id
        AND ${docFilter}
        AND to_tsvector('english',
              coalesce(f.equipment_tag,'') || ' ' ||
              coalesce(f.vendor,'')        || ' ' ||
              coalesce(f.model_num,'')     || ' ' ||
              coalesce(f.fields::text,'')
            ) @@ q.tsq
      ORDER BY score DESC
      LIMIT ${candidatesPerLeg}
    `)) as unknown as SubmittalFieldRow[])
      : [];

    for (const r of fieldRows) {
      registerSubmittalField(allAtoms, r);
    }
    rankings.push(
      fieldRows.map((r, i) => ({ item: { id: r.id }, rank: i + 1 })),
    );
    const fieldRankMap = new Map(fieldRows.map((r, i) => [r.id, i + 1]));
    for (const id of fieldRankMap.keys()) {
      const a = allAtoms.get(id);
      if (a) a.ranks.bm25 = fieldRankMap.get(id) ?? null;
    }

    // submittal_pages — generic safety leg over the raw page text
    // extracted at ingest. Fills the gap when a question isn't covered
    // by the structured checklist (e.g. "does the cut sheet mention
    // warranty?"). Pages are long, so we keep the websearch_to_tsquery
    // (AND-style) — it works the way it does for spec_paragraphs.
    const pageRows = (await db.execute(sql`
      WITH pid AS (SELECT ${input.projectId}::uuid AS id),
           q   AS (SELECT websearch_to_tsquery('english', ${input.query}) AS tsq)
      SELECT
        p.id,
        p.document_id   AS "documentId",
        p.page_num      AS "pageNum",
        p.text_content  AS "textContent",
        ts_rank(
          to_tsvector('english', coalesce(p.text_content,'')),
          q.tsq
        ) AS score
      FROM document_pages p
      JOIN documents d ON d.id = p.document_id
      CROSS JOIN q
      CROSS JOIN pid
      WHERE d.project_id = pid.id
        AND d.doc_type = 'submittal'
        AND p.text_content IS NOT NULL
        AND ${docFilter}
        AND to_tsvector('english', coalesce(p.text_content,'')) @@ q.tsq
      ORDER BY score DESC
      LIMIT ${candidatesPerLeg}
    `)) as unknown as SubmittalPageRow[];

    for (const r of pageRows) {
      registerSubmittalPage(allAtoms, r);
    }
    rankings.push(
      pageRows.map((r, i) => ({ item: { id: r.id }, rank: i + 1 })),
    );
    const pageRankMap = new Map(pageRows.map((r, i) => [r.id, i + 1]));
    for (const id of pageRankMap.keys()) {
      const a = allAtoms.get(id);
      if (a) a.ranks.bm25 = pageRankMap.get(id) ?? null;
    }

    // submittal_checklist_responses — same OR-query for the same
    // reason as submittal_fields above (short rows, multi-word
    // questions otherwise miss).
    const respRows = orQuery
      ? ((await db.execute(sql`
      WITH pid AS (SELECT ${input.projectId}::uuid AS id),
           q   AS (SELECT to_tsquery('english', ${orQuery}) AS tsq)
      SELECT
        r.id,
        r.submittal_document_id   AS "submittalDocumentId",
        r.page_num                AS "pageNum",
        i.attribute,
        r.evidence_quote          AS "evidenceQuote",
        r.value,
        ts_rank(
          to_tsvector('english',
            coalesce(i.attribute,'') || ' ' ||
            coalesce(r.evidence_quote,'')
          ),
          q.tsq
        ) AS score
      FROM submittal_checklist_responses r
      JOIN spec_checklist_items i ON i.id = r.spec_checklist_item_id
      JOIN documents d ON d.id = r.submittal_document_id
      CROSS JOIN q
      CROSS JOIN pid
      WHERE d.project_id = pid.id
        AND r.found = true
        AND ${docFilter}
        AND to_tsvector('english',
              coalesce(i.attribute,'') || ' ' ||
              coalesce(r.evidence_quote,'')
            ) @@ q.tsq
      ORDER BY score DESC
      LIMIT ${candidatesPerLeg}
    `)) as unknown as SubmittalResponseRow[])
      : [];

    for (const r of respRows) {
      registerSubmittalResponse(allAtoms, r);
    }
    rankings.push(
      respRows.map((r, i) => ({ item: { id: r.id }, rank: i + 1 })),
    );
    const respRankMap = new Map(respRows.map((r, i) => [r.id, i + 1]));
    for (const id of respRankMap.keys()) {
      const a = allAtoms.get(id);
      if (a) a.ranks.bm25 = respRankMap.get(id) ?? null;
    }
  }

  if (allAtoms.size === 0) return [];

  const fused = rrf<{ id: string }>(rankings, {
    keyOf: (r) => r.id,
  });

  return fused
    .slice(0, k)
    .map((scored) => {
      const atom = allAtoms.get(scored.item.id);
      if (!atom) return null;
      atom.score = scored.score;
      return atom;
    })
    .filter((a): a is RetrievedAtom => a !== null);
}

function registerSpec(map: Map<string, RetrievedAtom>, r: SpecRow) {
  if (map.has(r.id)) return;
  map.set(r.id, {
    id: r.id,
    sourceKind: "spec_paragraph",
    documentId: r.documentId,
    pageNum: r.pageNum,
    csiSection: r.csiSection,
    csiPart: r.csiPart,
    csiArticle: r.csiArticle,
    csiParagraph: r.csiParagraph,
    requirementType: r.requirementType,
    referencedStandards: r.referencedStandards ?? [],
    equipmentTag: null,
    vendorModel: null,
    attribute: null,
    content: r.content,
    score: 0,
    ranks: { bm25: null, vector: null },
  });
}

function registerSubmittalField(
  map: Map<string, RetrievedAtom>,
  r: SubmittalFieldRow,
) {
  if (map.has(r.id)) return;
  const vendorModel = [r.vendor, r.modelNum].filter(Boolean).join(" ") || null;
  map.set(r.id, {
    id: r.id,
    sourceKind: "submittal_field",
    documentId: r.documentId,
    pageNum: r.pageNum,
    csiSection: null,
    csiPart: null,
    csiArticle: null,
    csiParagraph: null,
    requirementType: null,
    referencedStandards: [],
    equipmentTag: r.equipmentTag,
    vendorModel,
    attribute: null,
    content: submittalFieldContent(r),
    score: 0,
    ranks: { bm25: null, vector: null },
  });
}

function registerSubmittalPage(
  map: Map<string, RetrievedAtom>,
  r: SubmittalPageRow,
) {
  if (map.has(r.id)) return;
  // Trim to a reasonable snippet — full page text in <context> blows
  // out the prompt budget on multi-page submittals.
  const text = (r.textContent ?? "").trim().replace(/\s+/g, " ");
  const snippet = text.length > 800 ? text.slice(0, 800) + "…" : text;
  map.set(r.id, {
    id: r.id,
    sourceKind: "submittal_page",
    documentId: r.documentId,
    pageNum: r.pageNum,
    csiSection: null,
    csiPart: null,
    csiArticle: null,
    csiParagraph: null,
    requirementType: null,
    referencedStandards: [],
    equipmentTag: null,
    vendorModel: null,
    attribute: null,
    content: snippet,
    score: 0,
    ranks: { bm25: null, vector: null },
  });
}

function registerSubmittalResponse(
  map: Map<string, RetrievedAtom>,
  r: SubmittalResponseRow,
) {
  if (map.has(r.id)) return;
  map.set(r.id, {
    id: r.id,
    sourceKind: "submittal_response",
    documentId: r.submittalDocumentId,
    pageNum: r.pageNum,
    csiSection: null,
    csiPart: null,
    csiArticle: null,
    csiParagraph: null,
    requirementType: null,
    referencedStandards: [],
    equipmentTag: null,
    vendorModel: null,
    attribute: r.attribute,
    content: submittalResponseContent(r),
    score: 0,
    ranks: { bm25: null, vector: null },
  });
}

// Exposed for unit tests.
export const _internal = {
  flattenFields,
  submittalFieldContent,
  submittalResponseContent,
  toOrTsQuery,
};
