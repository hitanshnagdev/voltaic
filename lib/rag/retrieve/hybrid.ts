import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { embed } from "@/lib/embed";
import { rrf, type Ranked } from "./rrf";

/**
 * Hybrid retrieval over project-scoped spec_paragraphs.
 *
 * Blends BM25 (Postgres tsvector) and pgvector cosine similarity, fused
 * with Reciprocal Rank Fusion. Why both and not embeddings alone:
 * construction queries are code-heavy ("65 kAIC", "26 24 16 §2.4.A",
 * "NEMA 3R") and embeddings systematically underweight exact-token matches.
 * BM25 nails those; vector recall handles the semantic fall-throughs.
 *
 * v1 surface:
 *   - source: "spec" (only place with embeddings + tsvector + actual data
 *     post-Stage-3). When document_chunks / submittal_fields populate,
 *     they slot in as additional `unionAll` legs in the same query shape.
 *
 * Filters:
 *   - csiSection         : exact match on canonical "NN NN NN"
 *   - requirementType    : 'aic'|'sccr'|'enclosure'|'conductor'|'clearance'|...
 *   - referencedStandard : array contains, e.g. "UL 489"
 *   - documentIds        : restrict to a specific subset of source docs
 *
 * Returns up to `k` atoms (default 12), sorted by fused RRF score
 * descending. Each atom carries enough information to render a citation
 * (document_id, page_num, content snippet) and trace back to the source
 * row by id.
 */

export type RetrieveFilters = {
  csiSection?: string;
  requirementType?: string;
  referencedStandard?: string;
  documentIds?: string[];
};

export type RetrievedAtom = {
  id: string;
  sourceKind: "spec_paragraph";
  documentId: string;
  pageNum: number | null;
  csiSection: string | null;
  csiPart: string | null;
  csiArticle: string | null;
  csiParagraph: string | null;
  requirementType: string | null;
  referencedStandards: string[];
  content: string;
  score: number;
  ranks: { bm25: number | null; vector: number | null };
};

export type RetrieveInput = {
  query: string;
  projectId: string;
  workspaceId: string;
  filters?: RetrieveFilters;
  k?: number;
  /**
   * How many candidates each leg pulls before fusion. Higher → better
   * recall, more DB work. Default 40 per leg, fused down to k.
   */
  candidatesPerLeg?: number;
};

type Row = Omit<RetrievedAtom, "score" | "ranks" | "sourceKind"> & {
  rank: number;
};

function buildFilterFragments(filters: RetrieveFilters | undefined) {
  // Returns SQL fragments inlined into both BM25 and vector queries via
  // the same WHERE clause so each leg sees an identical candidate pool.
  //
  // Project scoping is handled by each leg's `JOIN documents d ON d.id =
  // p.document_id` plus `WHERE d.project_id = pid.id` — spec_paragraphs
  // has NO project_id column, only document_id (per lib/db/schema.ts).
  // Earlier versions of this function tried to filter on p.project_id
  // directly and threw at runtime ("column p.project_id does not
  // exist"). The clauses list always starts with a tautology (`TRUE`)
  // so `sql.join` never produces a trailing AND when only the leading
  // join+filter applies.
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
    // Drizzle's parameter list helper is awkward for ANY array — keep it
    // simple with an explicit IN list.
    clauses.push(
      sql`p.document_id IN (${sql.join(
        filters.documentIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  }
  return sql.join(clauses, sql` AND `);
}

export async function retrieve(
  input: RetrieveInput,
): Promise<RetrievedAtom[]> {
  const k = input.k ?? 12;
  const candidatesPerLeg = input.candidatesPerLeg ?? 40;
  const filters = input.filters;

  const where = buildFilterFragments(filters);

  // BM25 leg — websearch_to_tsquery handles both quoted phrases and bare
  // tokens, and tolerates user input like 'NEC 110.26' without us needing
  // to pre-escape.
  const bm25Rows = (await db.execute(sql`
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
      AND ${where}
    ORDER BY score DESC
    LIMIT ${candidatesPerLeg}
  `)) as unknown as Row[];

  const queryEmbeddings = await embed({
    inputs: [input.query],
    ctx: { workspaceId: input.workspaceId, projectId: input.projectId },
    inputType: "query",
  });
  const queryVec = queryEmbeddings[0];
  const vecLiteral = `[${queryVec.join(",")}]`;

  const vectorRows = (await db.execute(sql`
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
      AND ${where}
    ORDER BY p.embedding <=> ${vecLiteral}::vector
    LIMIT ${candidatesPerLeg}
  `)) as unknown as Row[];

  // Convert each leg into rank lists (1-indexed) for RRF.
  const toRanked = (rows: Row[]): Ranked<Row>[] =>
    rows.map((r, i) => ({ item: r, rank: i + 1 }));

  const fused = rrf<Row>([toRanked(bm25Rows), toRanked(vectorRows)], {
    keyOf: (r) => r.id,
  });

  // Build the per-leg rank map for explainability.
  const bm25RankById = new Map(bm25Rows.map((r, i) => [r.id, i + 1]));
  const vectorRankById = new Map(vectorRows.map((r, i) => [r.id, i + 1]));

  return fused.slice(0, k).map((scored) => {
    const r = scored.item;
    return {
      id: r.id,
      sourceKind: "spec_paragraph" as const,
      documentId: r.documentId,
      pageNum: r.pageNum,
      csiSection: r.csiSection,
      csiPart: r.csiPart,
      csiArticle: r.csiArticle,
      csiParagraph: r.csiParagraph,
      requirementType: r.requirementType,
      referencedStandards: r.referencedStandards ?? [],
      content: r.content,
      score: scored.score,
      ranks: {
        bm25: bm25RankById.get(r.id) ?? null,
        vector: vectorRankById.get(r.id) ?? null,
      },
    };
  });
}
