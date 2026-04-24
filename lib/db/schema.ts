import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ---------- custom types ----------

// Postgres tsvector for BM25 full-text search.
// Declared as a generated stored column in the migration; Drizzle never writes
// to it directly.
const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

// Postgres text[] for tag aliases / CSI section lists / etc.
const textArray = customType<{ data: string[]; driverData: string }>({
  dataType() {
    return "text[]";
  },
  toDriver(value) {
    return `{${value.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",")}}`;
  },
  fromDriver(value) {
    if (value == null) return [];
    // node-postgres already parses text[] into string[] in most cases; fall
    // back to a tolerant parser for string driver values.
    if (Array.isArray(value)) return value as string[];
    const s = String(value);
    if (s === "{}") return [];
    return s
      .slice(1, -1)
      .split(",")
      .map((v) => v.replace(/^"|"$/g, "").replace(/\\"/g, '"'));
  },
});

const uuidArray = customType<{ data: string[]; driverData: string }>({
  dataType() {
    return "uuid[]";
  },
  toDriver(value) {
    return `{${value.join(",")}}`;
  },
  fromDriver(value) {
    if (value == null) return [];
    if (Array.isArray(value)) return value as string[];
    const s = String(value);
    if (s === "{}") return [];
    return s.slice(1, -1).split(",");
  },
});

// ---------- core tenancy ----------

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    clerkOrgId: text("clerk_org_id").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("workspaces_clerk_org_id_idx").on(t.clerkOrgId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    // Project-wide available fault current assumption (kA). Used by the AIC
    // rule. Nullable until the user or ingest sets it.
    availableFaultCurrentKa: numeric("available_fault_current_ka"),
    // Target "day of" delivery label, e.g. "2026-Q3" or an ISO date.
    dayOfTotal: text("day_of_total"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("projects_workspace_idx").on(t.workspaceId)],
);

// ---------- documents & pages ----------

export const documents = pgTable(
  "documents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    contentSha256: text("content_sha256").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    mimeType: text("mime_type"),
    pageCount: integer("page_count"),
    // 'drawing' | 'spec' | 'submittal' | 'other'
    docType: text("doc_type"),
    // Structured identity resolved by lib/rag/identity.ts. Shape (subset):
    // { csi_sections?: string[], sheet_number?: string, drawing_discipline?:
    //   string, drawing_rev?: string, submittal_log?: string, submittal_rev?:
    //   string, identified_via: 'header'|'stamp'|'seed_map'|'llm'|'filename'|
    //   'multiple', identity_confidence: number }
    identity: jsonb("identity").notNull().default(sql`'{}'::jsonb`),
    // For submittals: 'approved' | 'approved_as_noted' | 'revise_resubmit' |
    // 'rejected'. Null otherwise.
    submittalStatus: text("submittal_status"),
    // 'pending' | 'parsing' | 'ready' | 'failed'
    status: text("status").notNull().default("pending"),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("documents_project_idx").on(t.projectId),
    index("documents_workspace_idx").on(t.workspaceId),
    index("documents_content_sha_idx").on(t.contentSha256),
  ],
);

export const documentPages = pgTable(
  "document_pages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNum: integer("page_num").notNull(),
    textContent: text("text_content"),
    rasterR2Key: text("raster_r2_key"),
    pageSha256: text("page_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("document_pages_doc_page_idx").on(t.documentId, t.pageNum),
    index("document_pages_page_sha_idx").on(t.pageSha256),
  ],
);

// ---------- structured extractions ----------

// Spec paragraphs: CSI-indexed structural parse of Division-XX specs.
export const specParagraphs = pgTable(
  "spec_paragraphs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // "26 24 16" style
    csiSection: text("csi_section"),
    // PART 1/2/3
    csiPart: text("csi_part"),
    // e.g. "2.2"
    csiArticle: text("csi_article"),
    // e.g. "B" or "2.2.B"
    csiParagraph: text("csi_paragraph"),
    // 'aic' | 'sccr' | 'enclosure' | 'conductor' | 'clearance' | 'grounding' |
    // 'approved_manufacturer' | 'other'
    requirementType: text("requirement_type"),
    referencedStandards: textArray("referenced_standards")
      .notNull()
      .default(sql`'{}'::text[]`),
    content: text("content").notNull(),
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', content)`,
    ),
    embedding: vector("embedding", { dimensions: 1024 }),
    pageNum: integer("page_num"),
    bbox: jsonb("bbox"),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("spec_paragraphs_workspace_idx").on(t.workspaceId),
    index("spec_paragraphs_document_idx").on(t.documentId),
    index("spec_paragraphs_csi_section_idx").on(t.csiSection),
    index("spec_paragraphs_requirement_type_idx").on(t.requirementType),
    index("spec_paragraphs_content_sha_idx").on(t.contentSha256),
    index("spec_paragraphs_content_tsv_idx")
      .using("gin", t.contentTsv),
    index("spec_paragraphs_embedding_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// Submittal datasheet fields: one row per extracted equipment-field record.
export const submittalFields = pgTable(
  "submittal_fields",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    equipmentTag: text("equipment_tag"),
    tagNormalized: text("tag_normalized"),
    vendor: text("vendor"),
    modelNum: text("model_num"),
    // Free-shape bag of normalized fields. Example:
    //   { aic_ka: 42, sccr_ka: 65, enclosure_nema: "1",
    //     voltage: "208Y/120V", ampacity_a: 200 }
    fields: jsonb("fields").notNull().default(sql`'{}'::jsonb`),
    pageNum: integer("page_num"),
    bbox: jsonb("bbox"),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("submittal_fields_workspace_idx").on(t.workspaceId),
    index("submittal_fields_document_idx").on(t.documentId),
    index("submittal_fields_tag_normalized_idx").on(t.tagNormalized),
  ],
);

// Drawing annotations: one row per extracted symbol/note with bbox.
export const drawingAnnotations = pgTable(
  "drawing_annotations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNum: integer("page_num").notNull(),
    // 'panel' | 'feeder' | 'disconnect' | 'note' | ...
    annotationType: text("annotation_type"),
    equipmentTag: text("equipment_tag"),
    tagNormalized: text("tag_normalized"),
    label: text("label"),
    bbox: jsonb("bbox").notNull(),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("drawing_annotations_workspace_idx").on(t.workspaceId),
    index("drawing_annotations_document_idx").on(t.documentId),
    index("drawing_annotations_tag_normalized_idx").on(t.tagNormalized),
  ],
);

// Fallback document chunks for content that doesn't fit the structured
// extractors (e.g. the prose of a rejection letter).
export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    pageNum: integer("page_num").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', content)`,
    ),
    embedding: vector("embedding", { dimensions: 1024 }),
    bbox: jsonb("bbox"),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("document_chunks_workspace_idx").on(t.workspaceId),
    index("document_chunks_document_idx").on(t.documentId),
    uniqueIndex("document_chunks_doc_page_chunk_idx").on(
      t.documentId,
      t.pageNum,
      t.chunkIndex,
    ),
    index("document_chunks_content_tsv_idx")
      .using("gin", t.contentTsv),
    index("document_chunks_embedding_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// ---------- equipment graph ----------

export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    // Canonical display tag, as the PM sees it
    tag: text("tag"),
    // Fuzzy-dedup key; unique per project
    tagNormalized: text("tag_normalized"),
    name: text("name"),
    // 'service' | 'switchgear' | 'distribution' | 'panel' | 'feeder' |
    // 'load' | 'protection' | 'grounding' | 'other'
    category: text("category").notNull(),
    csiSections: textArray("csi_sections")
      .notNull()
      .default(sql`'{}'::text[]`),
    attributes: jsonb("attributes").notNull().default(sql`'{}'::jsonb`),
    fedFrom: uuid("fed_from"),
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    tagAliases: textArray("tag_aliases")
      .notNull()
      .default(sql`'{}'::text[]`),
    // 'ok' | 'watch' | 'issue' | 'clean'
    status: text("status").notNull().default("ok"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("equipment_project_tag_normalized_idx").on(
      t.projectId,
      t.tagNormalized,
    ),
    index("equipment_project_category_idx").on(t.projectId, t.category),
    index("equipment_fed_from_idx").on(t.fedFrom),
  ],
);

// Seed table: equipment category → canonical CSI sections.
export const equipmentCsiMap = pgTable("equipment_csi_map", {
  category: text("category").primaryKey(),
  csiSections: textArray("csi_sections").notNull(),
});

// ---------- findings ----------

export const findings = pgTable(
  "findings",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    // 'rule' | 'interpretive' | 'contradiction'
    kind: text("kind").notNull(),
    ruleId: text("rule_id"),
    // 'hot' | 'warm' | 'cool'
    severity: text("severity").notNull(),
    // 'non_compliant' | 'compliant' | 'uncertain' | 'no_conflict'
    verdict: text("verdict").notNull(),
    confidence: numeric("confidence").notNull(),
    timeToImpactDays: integer("time_to_impact_days"),
    // 'material' | 'vendor' | 'code' | 'submittal' | 'revision' |
    // 'install_readiness'
    category: text("category").notNull(),
    equipmentIds: uuidArray("equipment_ids")
      .notNull()
      .default(sql`'{}'::uuid[]`),
    // evidence item: { source_id, source_kind, document_id, page, bbox,
    //                  snippet, content_sha256, role: 'primary'|'supporting' }
    evidence: jsonb("evidence").notNull().default(sql`'[]'::jsonb`),
    // shape depends on kind (rule | interpretive | contradiction)
    reasoningTrace: jsonb("reasoning_trace"),
    modelsDisagree: boolean("models_disagree").notNull().default(false),
    // 'open' | 'acknowledged' | 'dismissed'
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("findings_workspace_idx").on(t.workspaceId),
    index("findings_project_severity_status_idx").on(
      t.projectId,
      t.severity,
      t.status,
    ),
    index("findings_kind_idx").on(t.kind),
  ],
);

// ---------- chat (Compare view) ----------

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_sessions_project_idx").on(t.projectId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => chatSessions.id, { onDelete: "cascade" }),
    // 'user' | 'assistant'
    role: text("role").notNull(),
    content: text("content").notNull(),
    citedDocumentIds: uuidArray("cited_document_ids")
      .notNull()
      .default(sql`'{}'::uuid[]`),
    // [{ source_id, source_kind, document_id, page, bbox }]
    citations: jsonb("citations").notNull().default(sql`'[]'::jsonb`),
    reasoningTrace: jsonb("reasoning_trace"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("chat_messages_session_idx").on(t.sessionId)],
);

// ---------- observability ----------

export const llmCalls = pgTable(
  "llm_calls",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id").notNull(),
    projectId: uuid("project_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    imageCount: integer("image_count").default(0),
    costUsd: numeric("cost_usd"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("llm_calls_project_created_idx").on(t.projectId, t.createdAt),
    index("llm_calls_workspace_idx").on(t.workspaceId),
  ],
);

// ---------- cross-project cache ----------

// Keyed on { purpose, content_sha256 } — no workspace_id because deterministic
// extractions of identical content are safe to share (the bytes are already
// hashed). Saves re-running classify/parse/embed on boilerplate Div-XX content
// that repeats across projects.
export const hashCache = pgTable(
  "hash_cache",
  {
    key: text("key").primaryKey(),
    // 'classify' | 'parse_spec_paragraph' | 'parse_submittal_field' |
    // 'embed' | 'identity' | ...
    purpose: text("purpose").notNull(),
    contentSha256: text("content_sha256").notNull(),
    // Full cached payload, shape depends on purpose
    payload: jsonb("payload").notNull(),
    // Tokens the source call would have consumed, for cost-savings accounting
    tokenCost: integer("token_cost"),
    hitCount: integer("hit_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("hash_cache_content_sha_idx").on(t.contentSha256),
    index("hash_cache_purpose_idx").on(t.purpose),
  ],
);

// ---------- inferred types ----------

export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentPage = typeof documentPages.$inferSelect;
export type SpecParagraph = typeof specParagraphs.$inferSelect;
export type SubmittalField = typeof submittalFields.$inferSelect;
export type DrawingAnnotation = typeof drawingAnnotations.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type EquipmentCsiMap = typeof equipmentCsiMap.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type LlmCall = typeof llmCalls.$inferSelect;
export type HashCacheEntry = typeof hashCache.$inferSelect;
