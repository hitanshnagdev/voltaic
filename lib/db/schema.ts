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

// Spec checklist items: structured per-attribute requirements extracted
// from a `spec_paragraphs` row. The pivot from the hardcoded panelboard
// attribute schema (lib/rag/compare/attributes.ts) toward Phase B per
// docs/DECISIONS.md U12 — the spec parser produces the checklist; the
// compare page renders that checklist instead of guessing what fields
// to show. Empty for projects whose specs haven't been re-parsed; the
// shim layer remains as a fallback until coverage is non-trivial.
export const specChecklistItems = pgTable(
  "spec_checklist_items",
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
    specParagraphId: uuid("spec_paragraph_id").references(
      () => specParagraphs.id,
      { onDelete: "cascade" },
    ),
    csiSection: text("csi_section").notNull(),
    csiPath: text("csi_path").notNull(),
    // Canonical attribute key shared across spec checklist and submittal
    // extraction: "aic_ka" | "sccr_ka" | "enclosure_nema" | "ul_listing" |
    // "voltage_system_v" | "phase" | "wires" | "ampacity_a" | "main_type" |
    // "poles" | "series_rated" | "bus_material" | "bus_plating" | ...
    attribute: text("attribute").notNull(),
    // 'numeric' | 'enum' | 'qualitative' | 'manufacturer_list' | 'boolean'
    requiredKind: text("required_kind").notNull(),
    // '≥' | '≤' | '=' | '⊇' | 'in'
    comparator: text("comparator").notNull(),
    // Typed value matching `requiredKind`:
    //   numeric           → number
    //   enum              → string (single canonical code)
    //   manufacturer_list → string[] (acceptable manufacturers)
    //   qualitative       → string  (raw spec text — comparison delegates
    //                                  to the LLM equivalence judge later)
    //   boolean           → boolean
    requiredValue: jsonb("required_value").notNull(),
    // Optional unit: "kA", "A", "V", null. Numeric attributes only.
    unit: text("unit"),
    // Verbatim spec text the requirement was extracted from. Non-negotiable
    // — every checklist item must trace back to source bytes.
    rawQuote: text("raw_quote").notNull(),
    confidence: numeric("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.8"),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("spec_checklist_items_workspace_idx").on(t.workspaceId),
    index("spec_checklist_items_document_idx").on(t.documentId),
    index("spec_checklist_items_csi_section_idx").on(t.csiSection),
    index("spec_checklist_items_attribute_idx").on(t.attribute),
    uniqueIndex("spec_checklist_items_unique_idx").on(
      t.documentId,
      t.contentSha256,
    ),
  ],
);

// Submittal-to-spec assignments. Many-to-many: one submittal can satisfy
// multiple spec sections (a panelboard cut sheet covers 26 24 16 +
// 26 28 16); one spec section can have multiple submittals (revisions,
// multiple panels). The compare page joins on this table to know which
// spec checklist drives the comparison for any given submittal — replaces
// the prior implicit `tag_normalized` matching, which silently failed
// when vendor cut sheets didn't carry the project tag on their cover.
export const submittalSpecAssignments = pgTable(
  "submittal_spec_assignments",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    submittalDocumentId: uuid("submittal_document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    specDocumentId: uuid("spec_document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    // Optional: which CSI section within the spec doc (a multi-section
    // spec PDF could have multiple targets). Null = "the whole spec doc."
    csiSection: text("csi_section"),
    // 'manual'         — user picked explicitly
    // 'auto-suggested' — model picked, user confirmed
    // 'auto-applied'   — model picked, awaiting user review (lower trust)
    source: text("source").notNull().default("manual"),
    // 0..1 when source !== 'manual'
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    notes: text("notes"),
    // Lifecycle of the user-initiated guided-extraction run.
    // 'not_run' | 'queued' | 'running' | 'ready' | 'failed'
    complianceRunStatus: text("compliance_run_status")
      .notNull()
      .default("not_run"),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("submittal_spec_assignments_workspace_idx").on(t.workspaceId),
    index("submittal_spec_assignments_submittal_idx").on(t.submittalDocumentId),
    index("submittal_spec_assignments_spec_idx").on(t.specDocumentId),
    index("submittal_spec_assignments_run_status_idx").on(
      t.complianceRunStatus,
    ),
    // Same (submittal, spec, csi_section) triple shouldn't appear twice.
    uniqueIndex("submittal_spec_assignments_unique_idx").on(
      t.submittalDocumentId,
      t.specDocumentId,
      t.csiSection,
    ),
  ],
);

// Submittal responses to spec checklist items. The pivot from generic
// field-fishing toward guided extraction per docs/DECISIONS.md U12 Phase B:
// once a submittal is assigned to a spec, the vision call gets the spec's
// checklist as context and returns one response per item — what the
// submittal claims for that specific requirement, with verbatim quote
// + page. Replaces the regex-against-retrieved-text shim.
//
// (submittal_document_id, spec_checklist_item_id) is unique so the
// runner's INSERT-on-conflict-DO-NOTHING + DELETE-by-NOT-IN idempotency
// shape works the same way as spec_paragraphs / spec_checklist_items.
export const submittalChecklistResponses = pgTable(
  "submittal_checklist_responses",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    submittalDocumentId: uuid("submittal_document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    specChecklistItemId: uuid("spec_checklist_item_id")
      .notNull()
      .references(() => specChecklistItems.id, { onDelete: "cascade" }),
    // True when the submittal addresses this requirement; false when
    // the submittal is silent on it. False rows render as MISSING in
    // the compare table — first-class failure visibility, not a
    // suppressed nothing.
    found: boolean("found").notNull().default(true),
    // The value the submittal claims for this requirement. Type
    // matches the linked checklist item's required_kind:
    //   numeric           → number
    //   enum              → string
    //   boolean           → boolean
    //   manufacturer_list → string (the actual manufacturer named)
    //   qualitative       → string (raw text from the submittal)
    // Null when found=false.
    value: jsonb("value"),
    evidenceQuote: text("evidence_quote"),
    pageNum: integer("page_num"),
    confidence: numeric("confidence", { precision: 4, scale: 3 })
      .notNull()
      .default("0.8"),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("submittal_checklist_responses_workspace_idx").on(t.workspaceId),
    index("submittal_checklist_responses_submittal_idx").on(
      t.submittalDocumentId,
    ),
    index("submittal_checklist_responses_item_idx").on(t.specChecklistItemId),
    uniqueIndex("submittal_checklist_responses_unique_idx").on(
      t.submittalDocumentId,
      t.specChecklistItemId,
    ),
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

// ---------- agents (chat presets) ----------

// Agents are user-configurable chat presets scoped to a workspace.
// Each workspace gets a seeded "Compliance Reviewer" agent on bootstrap
// (see lib/db/workspace.ts seedDefaultAgent). The seeded one is
// `is_default = true` and refuses delete; users can create more.
//
// `source_filters` controls what corpus the retrieve() call surfaces
// for this agent. Shape: { specs: bool, submittals: bool }. Drawings /
// RFIs intentionally omitted — those source kinds aren't in v1 (per
// CLAUDE.md). Add fields here when those parsers ship.
export const agents = pgTable(
  "agents",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    // Required: defines the persona. Hidden from end-users in the UI
    // (Configure panel labels it "System prompt").
    systemPrompt: text("system_prompt").notNull(),
    // Optional: project-specific overrides (e.g. "PM is M. Diaz, prefer
    // verdict-first answers"). Surfaced in the Configure panel as
    // "Custom prompt." Concatenated to systemPrompt at request time.
    customPrompt: text("custom_prompt"),
    model: text("model").notNull().default("claude-sonnet-4-6"),
    // Stored as numeric to round-trip cleanly. UI clamps to [0, 1].
    temperature: numeric("temperature", { precision: 3, scale: 2 })
      .notNull()
      .default("0.20"),
    // { specs: bool, submittals: bool }. Defaults: both true.
    sourceFilters: jsonb("source_filters")
      .notNull()
      .default(sql`'{"specs":true,"submittals":true}'::jsonb`),
    // How many retrieved atoms to send into the LLM context per turn.
    // Higher = more recall, more cost. Configurable per agent via the
    // "Sources per answer" slider in ConfigurePanel. Default 12 (the
    // historical hard-coded value); valid range 4..50.
    retrievalLimit: integer("retrieval_limit").notNull().default(12),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("agents_workspace_idx").on(t.workspaceId),
    // One default per workspace at most.
    uniqueIndex("agents_workspace_default_idx")
      .on(t.workspaceId)
      .where(sql`is_default = true`),
  ],
);

// ---------- chat (Agents surface) ----------
//
// Sessions belong to an agent (and a project, for retrieval scoping).
// Per docs/HANDOFF-2026-04-27 + 2026-04-27 design conversation: the
// chat surface is `/agents`, not the v0 Compare flow that U14 demoted.
// Each session is a free-flowing conversation; the assigned agent's
// preset (system prompt, model, temperature, source_filters) is read
// at request time so editing an agent affects new turns immediately.

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
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    title: text("title"),
    // Optional pair-scope on this session — when set, retrieval
    // restricts to (scoped_submittal_id, scoped_spec_id) only,
    // ignoring the rest of the project corpus. Null = whole-project
    // scope (the default). Set once at session creation; switching
    // mid-session creates a new session for cleaner semantics.
    scopedSubmittalId: uuid("scoped_submittal_id").references(
      () => documents.id,
      { onDelete: "set null" },
    ),
    scopedSpecId: uuid("scoped_spec_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Touched on every new message — drives the session list ordering
    // ("Today · 9:14a") without a per-row MAX(chat_messages.created_at)
    // subquery in the listing endpoint.
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("chat_sessions_project_idx").on(t.projectId),
    index("chat_sessions_agent_idx").on(t.agentId),
    index("chat_sessions_last_message_idx").on(t.lastMessageAt),
  ],
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

// ---------- meeting transcript layer ----------

// Per-user OAuth connections (Google Calendar/Meet now; Teams/Zoom later).
// Tokens let us sync the calendar and fetch transcripts on the user's
// behalf. Refresh tokens persist; access tokens are refreshed lazily.
export const oauthIntegrations = pgTable(
  "oauth_integrations",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    // 'google' (calendar + meet). Future: 'microsoft', 'zoom'.
    provider: text("provider").notNull(),
    // Stable provider account id (Google `sub`).
    externalUserId: text("external_user_id").notNull(),
    email: text("email"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: textArray("scopes")
      .notNull()
      .default(sql`'{}'::text[]`),
    rawProfile: jsonb("raw_profile").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("oauth_integrations_ws_provider_user_idx").on(
      t.workspaceId,
      t.provider,
      t.externalUserId,
    ),
    index("oauth_integrations_workspace_idx").on(t.workspaceId),
  ],
);

// A meeting transcript (manual upload now; Google Meet / Zoom later).
export const transcripts = pgTable(
  "transcripts",
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
    // 'manual_upload' | 'google_meet' | 'zoom' | 'teams'
    sourceType: text("source_type").notNull().default("manual_upload"),
    // Provider conference / event id when synced; null for manual uploads.
    sourceId: text("source_id"),
    title: text("title"),
    // Raw transcript text stored in R2.
    r2Key: text("r2_key").notNull(),
    contentSha256: text("content_sha256").notNull(),
    durationSeconds: integer("duration_seconds"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    // 'pending' | 'processing' | 'ready' | 'failed'
    status: text("status").notNull().default("pending"),
    // { calendarEventId?, attendees?: [{email,name}], organizer?, ... }
    meetingMetadata: jsonb("meeting_metadata")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("transcripts_project_idx").on(t.projectId),
    index("transcripts_workspace_idx").on(t.workspaceId),
    index("transcripts_content_sha_idx").on(t.contentSha256),
  ],
);

// Atom of transcript retrieval: one utterance (speaker turn / cue), with a
// generated tsvector + a 1024-dim embedding so it joins the SAME hybrid
// retrieval + contradiction engine as spec_paragraphs / submittal_fields
// (a new source_kind = 'transcript_utterance').
export const transcriptUtterances = pgTable(
  "transcript_utterances",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    transcriptId: uuid("transcript_id")
      .notNull()
      .references(() => transcripts.id, { onDelete: "cascade" }),
    // Ordinal within the transcript (0-based) for stable ordering +
    // idempotent re-ingest.
    idx: integer("idx").notNull(),
    speaker: text("speaker"),
    startMs: integer("start_ms"),
    endMs: integer("end_ms"),
    content: text("content").notNull(),
    contentTsv: tsvector("content_tsv").generatedAlwaysAs(
      sql`to_tsvector('english', content)`,
    ),
    embedding: vector("embedding", { dimensions: 1024 }),
    // Normalized equipment tags mentioned (filled by claim extraction).
    equipmentTags: textArray("equipment_tags")
      .notNull()
      .default(sql`'{}'::text[]`),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("transcript_utterances_transcript_idx_idx").on(
      t.transcriptId,
      t.idx,
    ),
    index("transcript_utterances_workspace_idx").on(t.workspaceId),
    index("transcript_utterances_content_tsv_idx").using("gin", t.contentTsv),
    index("transcript_utterances_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// ---------- artifacts (drafted deliverables) ----------

// An Artifact is a user-facing deliverable assembled from findings + source
// atoms — the peer of a Finding. Mirrors the findings shape (structured
// content with inline citations, status lifecycle) so it's a natural
// extension. content is structured JSON (never freeform) so future agentic
// fill + the template editor have a target.
export const artifacts = pgTable(
  "artifacts",
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
    // 'rfi' | 'compliance_report' | 'change_order' | 'recap_email' | 'filled_template'
    type: text("type").notNull(),
    title: text("title").notNull(),
    // 'draft' | 'reviewed' | 'sent' | 'exported'
    status: text("status").notNull().default("draft"),
    // structured content: typed fields/sections + inline citations
    content: jsonb("content").notNull().default(sql`'{}'::jsonb`),
    findingIds: uuidArray("finding_ids")
      .notNull()
      .default(sql`'{}'::uuid[]`),
    sourceDocumentIds: uuidArray("source_document_ids")
      .notNull()
      .default(sql`'{}'::uuid[]`),
    templateDocumentId: uuid("template_document_id"),
    // { kind: 'manual' | 'workflow', fromFindingId?, ... }
    trigger: jsonb("trigger").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("artifacts_project_idx").on(t.projectId),
    index("artifacts_workspace_idx").on(t.workspaceId),
    index("artifacts_type_idx").on(t.type),
  ],
);

// ---------- inferred types ----------

export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentPage = typeof documentPages.$inferSelect;
export type SpecParagraph = typeof specParagraphs.$inferSelect;
export type SpecChecklistItem = typeof specChecklistItems.$inferSelect;
export type SubmittalSpecAssignment = typeof submittalSpecAssignments.$inferSelect;
export type SubmittalChecklistResponse =
  typeof submittalChecklistResponses.$inferSelect;
export type SubmittalField = typeof submittalFields.$inferSelect;
export type DrawingAnnotation = typeof drawingAnnotations.$inferSelect;
export type DocumentChunk = typeof documentChunks.$inferSelect;
export type Equipment = typeof equipment.$inferSelect;
export type EquipmentCsiMap = typeof equipmentCsiMap.$inferSelect;
export type Finding = typeof findings.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type LlmCall = typeof llmCalls.$inferSelect;
export type HashCacheEntry = typeof hashCache.$inferSelect;
export type OauthIntegration = typeof oauthIntegrations.$inferSelect;
export type Transcript = typeof transcripts.$inferSelect;
export type TranscriptUtterance = typeof transcriptUtterances.$inferSelect;
export type Artifact = typeof artifacts.$inferSelect;
