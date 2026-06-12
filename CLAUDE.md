# Voltaic — v1 Build Spec (CLAUDE.md)

*Single source of build truth. Supersedes `voltaic-build-spec.md` in the design workspace.*

---

## READ FIRST — `docs/DECISIONS.md` is canonical

**Before editing any file in `lib/rag/`, `inngest/functions/`, `app/(authed)/`, or anything that touches the rule engine, retrieval, or UI surfaces — read `docs/DECISIONS.md` end-to-end.** It is append-only and supersedes parts of this file as decisions evolve. This file is the build *spec*; `DECISIONS.md` is the build *log*. When they conflict, `DECISIONS.md` wins.

### Active constraints (summary; full text in `docs/DECISIONS.md`)

- **U15 is CLOSED** (per U17, 2026-06-11). The blanket freeze is replaced by **U19's trigger rule**: no strategic-bet work (drawing/topology parsing, meeting-capture automation, new equipment types, new rules) starts without its named trigger firing — see U19 for the trigger list. The current committed work queue is U19's demoable-first plan.
- **U16 — Soft ~500 LOC PR cap (still active).** When a PR crosses the cap, that's the prompt to ask "do I still need the next part?" — not to keep building. If the cap genuinely needs to be raised for a coherent piece of work, raise it explicitly in the PR description with the reason.
- **Positioning (U18):** compliance-first — deterministic AIC/SCCR/NEMA verdicts with evidence trails is the headline; meeting/transcript features are supporting beats, never the lead.

**This file's UI and scope sections are partially historical.** The product evolved past them in May–June 2026 (Feed / Sources / Outputs IA, Agents chat, artifacts, transcript ingestion — see U17 for the record). Schema, pipeline architecture, and core principles below remain accurate; for current surfaces and priorities, DECISIONS.md U17–U19 win.

---

## What Voltaic is

Voltaic is an install-readiness decision layer for electrical specialty contractors. A PM drops a project's drawings, specs, and submittals into the app. Voltaic extracts an equipment graph, runs a standing compliance pass, and surfaces install blockers on a **Today** view, the equipment topology on a **System Map** view, and answers free-text questions with evidence-bound responses on a **Compare** view.

The moat is the **normalization + reasoning layer**, not the UI: equipment entities, feeder topology, CSI-structured spec indexing, deterministic cross-referencing, and revision-aware reconciliation extracted from messy construction PDFs.

**Trust framing, everywhere.** Every AI claim is rendered as *"AI-flagged · Engineer verifies before action"*. Every finding cites the source document, page, bbox, **and the rule or reasoning chain that produced it**. No claim without evidence binding.

---

## Core architectural principles

These shape every decision downstream. Violate only with a written reason.

1. **The Finding is the atom.** Not the document, not the chunk — the finding. One claim, N evidences (3–7 typical), a verdict, a rule or reasoning chain, a confidence score.
2. **Deterministic where possible, LLM where necessary.** Numeric compliance comparisons (AIC ≥ fault current, SCCR, conductor ampacity, enclosure match) run through the rule engine. LLM handles interpretive clauses only.
3. **Structural parsing before semantic embedding.** Specs parse to CSI hierarchy; drawings to equipment graph + annotations; submittals to structured datasheet fields. Chunking happens *after* structure is extracted, not instead of it.
4. **Hybrid retrieval is first-class.** BM25 + vector + metadata filters fused via RRF. Construction language is code-heavy ("NEC 110.26", "26 24 16 §2.4.A", "65 kAIC", "NEMA 3R") — embedding-only retrieval misses exact matches.
5. **Evidence binding is sub-chunk.** Spec evidence points to paragraph. Drawing evidence points to symbol bbox. Submittal evidence points to extracted field. Page-level citation is the floor, not the default.
6. **Dual-provider consensus on hot-severity findings.** Hot findings run through Claude Sonnet 4.6 *and* Gemini 2.5 Pro. Both must agree, or the finding is downgraded to warm with a `models_disagree` flag.
7. **Eval harness from day one.** Ground-truth YAML per demo project → precision/recall script runs on every prompt or model change. No silent regressions.
8. **Evidence fingerprinting for revision-readiness.** Every evidence reference carries a SHA-256 content hash. v2's revision reconciliation becomes a diff over hashes, not a re-analysis.
9. **Contradiction is a first-class finding type.** When two sources disagree (spec says 65 kAIC, submittal says 42 kAIC), that's a high-trust finding. Surface it explicitly.
10. **Cost observability is not optional.** Every LLM call logs `{model, tokens_in, tokens_out, latency_ms, purpose, workspace_id, project_id}`. A per-project cost meter is visible in the UI.
11. **Metadata before models.** Retrieval and cross-reference accuracy come from *better data*, not better prompts. Every atom carries its structural metadata (CSI path, normalized tag, referenced standards, doc identity) because prompt-tuning can't recover what wasn't extracted.

---

## Scope — what's in v1

- Drag-drop / multi-file upload of PDFs (drawings, specs, submittals).
- Classify each PDF into `drawing | spec | submittal | other` using Claude Haiku.
- **Document identity extraction** — every doc resolves to a structured `identity` record (CSI sections, sheet number, submittal log, status stamp). Filename is last-resort, not primary.
- **Structural parse** per doc type:
  - Specs → CSI hierarchy (Division / Section / Part / Article / Paragraph) + `requirement_type` tag + referenced standards array (`UL 489`, `NEMA PB 1`, `NEC 110.26`).
  - Drawings → equipment entities + annotation bboxes via Claude vision, **plus a dedicated panel-schedule extractor** for tabular rows.
  - Submittals → structured datasheet field records + submittal status (approved / revise / rejected) from stamp.
- **Fuzzy tag normalization** — every extracted tag carries a `tag_normalized` key; equipment dedup joins across doc types on the normalized key, preserves raw forms as `tag_aliases`.
- **Embedding augmentation** — embedded text prefixes metadata (`"[26 24 16] [2/4/A] ..."`) so hybrid retrieval recalls keyword queries (CSI sections, tags) as well as semantic ones.
- **Hybrid retrieval:** BM25 (Postgres `tsvector`) + Voyage-3 vector + metadata filters, fused with Reciprocal Rank Fusion.
- **Graph-native equipment model** with `fed_from` edges; traverse for explanations.
- **Rule engine** with 6 initial deterministic checks (AIC, SCCR, enclosure NEMA, conductor ampacity, OCPD coordination, spec-vs-submittal drift).
- **LLM interpretive pass** for ambiguous spec language (working clearance, grounding narrative, section-specific requirements).
- **Dual-provider consensus** on hot-severity findings (Claude Sonnet + Gemini 2.5 Pro).
- **Contradiction detection** across source documents.
- **Findings with reasoning chains:** each finding persists `{evidence[], rule_id?, llm_trace?, confidence, verdict}`.
- **Today view** — blocker cards ordered by severity × time-to-impact.
- **System Map view** — tier-based SVG topology (port v6 mock).
- **Compare view** — free-text chat, agent auto-pins 1–2 doc panes with highlighted regions, right rail shows Voltaic's reasoning transcript + issue cards + cost meter.
- **Clerk org = workspace = one active project.** RLS keyed on `workspace_id`.
- **Eval harness** — ground-truth YAML + precision/recall script.
- **Cost meter** visible in top bar of every authed view.
- **Demo project:** "Load demo project" seeds ~30 PDFs from `/public/demo/` into the current workspace.

## Scope — what's explicitly NOT in v1

- RFI / ASI ingestion and reconciliation (v2).
- Drawing revision diffing — but evidence hashes are stored so v2 is a pure add.
- NEC corpus ingestion + citation (deferred until a customer asks).
- Saved prompts in the Compare left rail.
- Multi-project workspaces.
- Mobile. Tablet-responsive fine; phone no.
- Mechanical / plumbing / BIM / Revit / Procore / offline mode.
- Fine-tuned YOLO for drawing symbol detection.
- Full Neo4j / external graph DB (we use Postgres relations + recursive CTEs).
- SOC 2 (design toward it, don't block on it).

---

## Stack

- **Runtime:** Next.js 15 (App Router) + TypeScript + Tailwind v4.
- **Database:** Postgres (Neon) with `pgvector` + `pg_trgm` + `tsvector` full-text.
- **ORM:** Drizzle ORM. Use raw SQL for hybrid retrieval and graph traversal.
- **Auth:** Clerk (organizations — one org = one workspace).
- **Object storage:** Cloudflare R2 via `@aws-sdk/client-s3`.
- **Background jobs:** Inngest. Every long-running step is a durable function.
- **LLM (primary):** Claude Sonnet 4.6 via `@anthropic-ai/sdk`. Haiku 4.5 for classification. Opus 4.7 reserved for hardest drawing pages only.
- **LLM (secondary, for consensus):** Gemini 2.5 Pro via `@google/genai`. Same `lib/llm.ts` abstraction.
- **Embeddings:** Voyage-3 (1024-dim) via `voyageai`. Store in pgvector.
- **PDF text:** `unpdf`.
- **PDF raster:** `pdfjs-dist` (Node canvas).
- **UI components:** shadcn/ui on Tailwind.
- **Deployment:** local dev only for v1. Vercel comes after end-to-end works on a laptop.

---

## Environment variables

```env
# Anthropic
ANTHROPIC_API_KEY=

# Google (Gemini — consensus provider)
GOOGLE_API_KEY=

# Voyage
VOYAGE_API_KEY=

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Neon Postgres
DATABASE_URL=

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=voltaic-dev

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

Generate `.env.example` with these keys and empty values.

---

## Database schema

All tables include `workspace_id uuid not null` with an RLS policy:
`workspace_id = current_setting('app.current_workspace_id')::uuid`. Set that GUC on every request from the Clerk `orgId`.

```sql
-- workspaces (1:1 with Clerk orgs)
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  clerk_org_id text unique not null,
  name text not null,
  created_at timestamptz not null default now()
);

-- projects (one active per workspace for v1)
create table projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  day_of_total text,
  available_fault_current_ka numeric,  -- project-wide assumption; used by rule engine
  created_at timestamptz not null default now()
);

-- documents
create table documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  r2_key text not null,
  filename text not null,
  doc_type text not null,                  -- 'drawing'|'spec'|'submittal'|'other'
  page_count int,
  content_sha256 text not null,            -- file-level hash for revision diffing
  -- document identity: how this file is addressed by the project
  identity jsonb not null default '{}'::jsonb,
  -- shape: {csi_sections?:string[], sheet_number?:string, drawing_discipline?:string,
  --         drawing_rev?:string, submittal_log?:string, submittal_rev?:string,
  --         identified_via:'header'|'stamp'|'seed_map'|'llm'|'filename'|'multiple',
  --         identity_confidence:number}
  submittal_status text,                   -- 'approved'|'approved_as_noted'|'revise_resubmit'|'rejected'|null
  status text not null default 'pending',  -- 'pending'|'parsing'|'ready'|'failed'
  uploaded_at timestamptz not null default now()
);
create index on documents (project_id, doc_type);

-- pages (text + raster metadata + per-page hash)
create table document_pages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  document_id uuid not null references documents(id) on delete cascade,
  page_num int not null,
  text_content text,
  text_tsv tsvector generated always as (to_tsvector('english', coalesce(text_content, ''))) stored,
  raster_r2_key text,
  page_sha256 text not null,               -- page-level evidence fingerprint
  created_at timestamptz not null default now(),
  unique (document_id, page_num)
);
create index on document_pages using gin (text_tsv);

-- spec paragraphs (CSI-structured; atom of spec retrieval)
create table spec_paragraphs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  document_id uuid not null references documents(id) on delete cascade,
  page_num int not null,
  csi_section text not null,               -- "26 24 16"
  part text,                               -- "1" | "2" | "3"
  article text,                            -- "4"
  paragraph text,                          -- "A" | "A.2" | "A.2.b"
  path text not null,                      -- "26 24 16/2/4/A" canonical ID
  requirement_type text,                   -- 'product'|'execution'|'quality'|'reference'|'general'
  content text not null,
  -- embedded text = metadata prefix + content; improves hybrid retrieval recall on code-heavy queries
  embed_text text generated always as
    ('[' || csi_section || '] [' || coalesce(part,'') || '/' || coalesce(article,'') || '/' || coalesce(paragraph,'') || '] ' || content) stored,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  embedding vector(1024),                  -- embed the embed_text column, not content
  referenced_standards text[] default '{}', -- ['UL 489','NEMA PB 1','NEC 110.26']
  bbox jsonb,
  content_sha256 text not null,            -- evidence fingerprint
  created_at timestamptz not null default now(),
  unique (document_id, path)
);
create index on spec_paragraphs using hnsw (embedding vector_cosine_ops);
create index on spec_paragraphs using gin (content_tsv);
create index on spec_paragraphs (csi_section);
create index on spec_paragraphs using gin (referenced_standards);

-- submittal field records (atom of submittal retrieval)
create table submittal_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  document_id uuid not null references documents(id) on delete cascade,
  page_num int not null,
  equipment_tag text,                      -- normalized tag (see tag_normalized below)
  tag_normalized text,                     -- fuzzy-dedup key: uppercased, punctuation stripped ("MDP-A" | "MDP A" | "MDPA" → "MDPA")
  manufacturer text,
  model text,
  field_name text not null,                -- "AIC" | "SCCR" | "enclosure_nema" | "voltage" | ...
  field_value jsonb not null,              -- typed: {type:"kAIC", value:65} or {type:"nema", value:"3R"}
  raw_snippet text,
  bbox jsonb,
  content_sha256 text not null,
  created_at timestamptz not null default now()
);
create index on submittal_fields (equipment_tag);
create index on submittal_fields (tag_normalized);
create index on submittal_fields (field_name);

-- panel schedules (tabular rows extracted from drawing schedules; primary equipment source)
create table panel_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  document_id uuid not null references documents(id) on delete cascade,
  page_num int not null,
  panel_tag text not null,
  panel_tag_normalized text not null,
  circuit_num int,
  breaker_rating_a int,
  poles int,
  phase text,                              -- 'A'|'B'|'C'|'AB'|'ABC'|null
  va_load numeric,
  description text,
  bbox jsonb,
  content_sha256 text not null,
  created_at timestamptz not null default now()
);
create index on panel_schedules (panel_tag_normalized);

-- drawing annotations (symbol-level bboxes for sub-page evidence)
create table drawing_annotations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  document_id uuid not null references documents(id) on delete cascade,
  page_num int not null,
  equipment_tag text,
  tag_normalized text,
  annotation_type text,                    -- "panel"|"feeder"|"disconnect"|"note"|...
  label text,
  bbox jsonb not null,
  content_sha256 text not null,
  created_at timestamptz not null default now()
);
create index on drawing_annotations (equipment_tag);
create index on drawing_annotations (tag_normalized);

-- fallback text chunks (for any content that doesn't fit structured parse)
create table document_chunks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  document_id uuid not null references documents(id) on delete cascade,
  page_num int not null,
  chunk_index int not null,
  content text not null,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  embedding vector(1024),
  bbox jsonb,
  content_sha256 text not null,
  created_at timestamptz not null default now()
);
create index on document_chunks using hnsw (embedding vector_cosine_ops);
create index on document_chunks using gin (content_tsv);

-- equipment entities (graph nodes)
create table equipment (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  tag text,                                -- canonical tag as displayed
  tag_normalized text,                     -- fuzzy-dedup key; unique per project
  name text,
  category text not null,                  -- 'service'|'switchgear'|'distribution'|'panel'|'feeder'|'load'|'protection'|'grounding'|'other'
  csi_sections text[] default '{}',        -- resolved via equipment_csi_map + document identity
  attributes jsonb not null default '{}'::jsonb,
  fed_from uuid references equipment(id),
  evidence jsonb not null default '[]'::jsonb,
  tag_aliases text[] default '{}',         -- all raw forms seen across docs ("MDP-A","MDP A","MDPA")
  status text not null default 'ok',       -- 'ok'|'watch'|'issue'|'clean'
  created_at timestamptz not null default now(),
  unique (project_id, tag_normalized)
);
create index on equipment (project_id, category);
create index on equipment (fed_from);

-- equipment category -> CSI section (seed data, deterministic)
create table equipment_csi_map (
  category text primary key,
  csi_sections text[] not null             -- e.g. ['26 24 16','26 28 16']
);

-- findings (the atom — one claim + N evidences + verdict + reasoning)
create table findings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  summary text not null,
  kind text not null,                      -- 'rule'|'interpretive'|'contradiction'
  rule_id text,                            -- nullable; set when kind='rule'
  severity text not null,                  -- 'hot'|'warm'|'cool'
  verdict text not null,                   -- 'non_compliant'|'compliant'|'uncertain'|'no_conflict'
  confidence numeric not null,             -- 0..1
  time_to_impact_days int,
  category text not null,                  -- 'material'|'vendor'|'code'|'submittal'|'revision'|'install_readiness'
  equipment_ids uuid[] default '{}',
  evidence jsonb not null default '[]'::jsonb,
  -- evidence item shape:
  -- {source_id, source_kind:"spec_paragraph"|"submittal_field"|"drawing_annotation"|"chunk",
  --  document_id, page, bbox, snippet, content_sha256, role:"primary"|"supporting"}
  reasoning_trace jsonb,
  -- for kind='rule':     {rule_id, inputs:{...}, comparator:"≥"|"=", result:boolean}
  -- for kind='interpretive': {retrieved:[...], primary_llm:{model,response,tokens}, consensus_llm?:{...}, agreed:boolean}
  -- for kind='contradiction': {sources:[{...}, {...}], conflict_field, values:[...]}
  models_disagree boolean not null default false,
  status text not null default 'open',     -- 'open'|'acknowledged'|'dismissed'
  created_at timestamptz not null default now()
);
create index on findings (project_id, severity, status);
create index on findings (kind);

-- LLM call log (cost observability)
create table llm_calls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid references projects(id) on delete set null,
  provider text not null,                  -- 'anthropic'|'google'|'voyage'
  model text not null,
  purpose text not null,                   -- 'classify'|'extract_equipment'|'parse_spec'|'parse_submittal'|'finding_interpretive'|'finding_consensus'|'chat'
  tokens_in int,
  tokens_out int,
  image_count int default 0,
  cost_usd numeric,
  latency_ms int,
  error text,
  created_at timestamptz not null default now()
);
create index on llm_calls (project_id, created_at desc);

-- chat (unchanged shape, citations now point at source atoms)
create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null,                      -- 'user'|'assistant'
  content text not null,
  cited_document_ids uuid[] default '{}',
  citations jsonb default '[]'::jsonb,     -- [{source_id, source_kind, document_id, page, bbox}]
  reasoning_trace jsonb,
  created_at timestamptz not null default now()
);
```

---

## File tree

```
voltaic/
├── CLAUDE.md
├── README.md
├── package.json
├── next.config.ts
├── drizzle.config.ts
├── .env.example
├── public/
│   └── demo/
│       ├── drawings/
│       ├── specs/
│       ├── submittals/
│       └── ground_truth.yaml        # eval ground truth for demo project
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── (authed)/
│   │   ├── layout.tsx
│   │   ├── today/page.tsx
│   │   ├── map/page.tsx
│   │   └── compare/page.tsx
│   ├── api/
│   │   ├── upload/route.ts
│   │   ├── ingest/route.ts
│   │   ├── chat/route.ts
│   │   └── inngest/route.ts
│   └── globals.css
├── components/
│   ├── nav/{Sidebar,TopBar,CostMeter}.tsx
│   ├── today/{BlockerCard,ReadinessHero,ContradictionCard}.tsx
│   ├── map/{SystemMap,EntityBox,EntityDrawer}.tsx
│   ├── compare/{DocPane,ChatComposer,IssueCard,ReasoningTranscript}.tsx
│   ├── common/{EvidenceSlice,ConfidenceChip,TrustFooter}.tsx
│   └── ui/                          # shadcn primitives
├── lib/
│   ├── db/
│   │   ├── schema.ts
│   │   ├── client.ts
│   │   └── rls.ts
│   ├── r2/client.ts
│   ├── llm.ts                       # multi-provider (anthropic + google)
│   ├── embed.ts
│   ├── pdf/
│   │   ├── parse.ts                 # unpdf text
│   │   └── raster.ts                # pdfjs-dist page raster
│   ├── rag/
│   │   ├── identity.ts              # document identity resolver (CSI, sheet, submittal log, status stamp)
│   │   ├── normalize.ts             # tag_normalized + NEMA/voltage/AIC value normalizers
│   │   ├── parse/
│   │   │   ├── spec.ts              # CSI structural parser + requirement_type classifier
│   │   │   ├── standards.ts         # regex extractor for UL/NEMA/IEEE/NEC refs
│   │   │   ├── drawing.ts           # vision entity + annotation extractor
│   │   │   ├── schedule.ts          # dedicated panel-schedule table extractor
│   │   │   └── submittal.ts         # datasheet field extractor + status stamp
│   │   ├── retrieve/
│   │   │   ├── hybrid.ts            # BM25 + vector + RRF + metadata filters
│   │   │   ├── graph.ts             # equipment graph traversal
│   │   │   └── filters.ts           # csi_section, category, doc_type, requirement_type
│   │   ├── xref.ts                  # equipment ↔ spec ↔ submittal linker (uses tag_normalized)
│   │   ├── dedup.ts                 # fuzzy tag matcher; builds tag_aliases arrays
│   │   ├── rules/
│   │   │   ├── index.ts             # rule registry + runner; skips rejected submittals
│   │   │   ├── aic.ts
│   │   │   ├── sccr.ts
│   │   │   ├── enclosure.ts
│   │   │   ├── ampacity.ts
│   │   │   ├── coordination.ts
│   │   │   └── spec_drift.ts
│   │   ├── synthesis.ts             # finding builder; dual-LLM consensus for hot
│   │   └── contradictions.ts        # cross-source conflict detector
│   └── eval/
│       ├── harness.ts               # runs ground truth comparison
│       └── metrics.ts               # precision/recall/F1
├── inngest/
│   ├── client.ts
│   └── functions/
│       ├── ingest-document.ts       # classify + identity + per-page text/raster
│       ├── parse-spec.ts            # CSI parse + standards + requirement_type
│       ├── parse-submittal.ts       # fields + submittal_status
│       ├── parse-drawing.ts         # equipment + annotations
│       ├── parse-schedule.ts        # panel_schedules rows (dedicated)
│       ├── dedup-tags.ts            # project-scoped fuzzy tag dedup + alias merge
│       └── analyze-project.ts       # xref + rules + interpretive + consensus
├── scripts/
│   ├── seed_equipment_csi_map.ts
│   └── run_eval.ts
└── drizzle/
```

---

## RAG pipeline — the product is here

Orchestrated by Inngest. Six stages, each a durable step with retries.

### Stage 1 — Ingest
- `document.uploaded` fires on R2 upload completion.
- Compute `content_sha256` on the full file.
- `classify(pdf)` via Haiku 4.5 → `drawing | spec | submittal | other`.
- For each page: extract text (unpdf), rasterize to PNG (pdfjs-dist) at 1568px wide by default, compute `page_sha256`, upload raster to R2, insert `document_pages`.

### Stage 2a — Document identity (`lib/rag/identity.ts`)
Before parsing, resolve each document's `identity` — the structured handle used to join it to the rest of the project. Layered, deterministic-first:

1. **Header / stamp extraction** — for specs, regex on the first page for `SECTION\s+\d{2}\s\d{2}\s\d{2}`. For drawings, vision crop of the title block → `{sheet_number, discipline, rev}`. For submittals, vision crop of the stamp → `{submittal_log, submittal_rev, status}`.
2. **Seed-map inference** — if no header/stamp, infer CSI from dominant equipment tags + `equipment_csi_map`.
3. **LLM inference** — last-resort Claude call on first 3 pages, confidence marked lower.
4. **Filename hint** — only if layers 1–3 all fail. Always flagged in `identified_via`.

Writes `documents.identity` and `documents.submittal_status`. Never trust filenames as primary.

### Stage 2b — Structural parse (dispatch by doc_type)
- **Specs (`parseSpec`).** Pure-function parser first — detect CSI headers by regex: `^(SECTION\s+)?(\d{2}\s\d{2}\s\d{2})`, `PART\s+\d`, numeric/letter article + paragraph markers. Tag each paragraph with `requirement_type` (product = Part 2 contents, execution = Part 3, quality = Part 1.3, reference = Part 1 standards list, general = other). Run `parse/standards.ts` regex to extract `referenced_standards[]` (UL/NEMA/IEEE/NEC/ANSI). Produce `spec_paragraphs`. Fallback to LLM structural parse on sections that don't match regex (budget: one Sonnet call per section max).
- **Submittals (`parseSubmittal`).** Claude vision on each page. Prompt extracts `{equipment_tag, manufacturer, model, fields:[...]}`. Normalize field values with typed schema (kAIC, NEMA codes, voltages). Stamp page is cropped and re-parsed to capture `submittal_status`. Insert `submittal_fields`.
- **Drawings (`parseDrawing`).** Claude vision per page. Extract `equipment` entities *and* `drawing_annotations` (symbol bboxes).
- **Panel schedules (`parseSchedule`).** Dedicated extractor — when a drawing page is detected as a schedule table (visual classifier prompt or heading detection), run a tabular extraction prompt that returns rows `[{panel_tag, circuit_num, breaker_rating_a, poles, phase, va_load, description, bbox}]`. Panel schedules are often more reliable than free-form drawing extraction and become the *primary* source for downstream-load calculations.

All parsed atoms carry `content_sha256`. Every tag extracted also gets `tag_normalized` via `lib/rag/normalize.ts` (uppercase, strip `[-_.\s]`).

### Stage 2c — Tag dedup (`lib/rag/dedup.ts`)
Project-scoped pass, runs after all docs in the project are parsed. Groups by `tag_normalized` across `submittal_fields`, `drawing_annotations`, `panel_schedules`. Collapses near-matches (Levenshtein ≤ 1 on normalized form with category guard). Writes canonical `equipment` rows with `tag_aliases` preserving every raw form seen.

### Stage 3 — Index
- Embed `spec_paragraphs.embed_text` (metadata-prefixed generated column) via Voyage-3 → `embedding`.
- Metadata-prefixed embedding is the single biggest lever for retrieval recall on CSI/tag queries — measured against the eval harness.
- Fallback `document_chunks` only for long-form narrative sections that didn't parse to paragraphs.
- `tsvector` indexes are generated columns — no explicit embed step.

### Stage 4 — Retrieve (`lib/rag/retrieve/hybrid.ts`)

Single entry point:
```ts
retrieve({
  query: string,
  projectId: UUID,
  filters?: { csi_section?, doc_type?, equipment_category?, requirement_type?, referenced_standard?, doc_ids? },
  k?: number,                 // default 12
  sources?: ("spec"|"submittal"|"drawing"|"chunk")[],
}) => RetrievedAtom[]
```

Implementation:
1. BM25 over `tsvector` on spec_paragraphs + document_chunks + document_pages.
2. Vector search over spec_paragraphs + document_chunks with HNSW (against `embed_text`-derived embeddings).
3. Metadata filter pre-pass (`csi_section`, `doc_type`, `category`, `requirement_type`, `referenced_standards`).
4. Fuse with Reciprocal Rank Fusion (k=60): `score = Σ 1/(k + rank_i)`.
5. Return top-k with source-kind tags so downstream can route evidence correctly.

Graph retrieval (`lib/rag/retrieve/graph.ts`) is a separate entry for equipment-relational questions: recursive CTE on `equipment.fed_from`, returns nodes + edges.

### Stage 5 — Cross-reference (`lib/rag/xref.ts`)

The deterministic linking step. For every canonical equipment entity in the project:

1. Resolve candidate `csi_sections` via (a) the document's declared `identity.csi_sections`, (b) `equipment_csi_map` as fallback.
2. Pull all `spec_paragraphs` where `csi_section ∈ candidates` AND `requirement_type IN ('product','reference')`. Execution/quality paragraphs are retained for the interpretive pass only.
3. Pull all `submittal_fields` where `tag_normalized = equipment.tag_normalized` AND the parent `documents.submittal_status NOT IN ('rejected','revise_resubmit')`. Rejected/resubmit submittals are excluded from rule evaluation but remain visible as evidence in the UI.
4. Pull all `panel_schedules` rows for this `panel_tag_normalized` — these feed the ampacity + coordination rules directly.
5. Build a triple: `(equipment, spec_requirements[], submitted_values[], schedule_rows[])`.
6. Persist as a materialized view for the rule engine to consume.

### Stage 6 — Synthesize findings (`lib/rag/synthesis.ts`)

For each equipment entity:

1. **Rule engine pass.** Run all registered rules against the triple. Each rule returns `{passed, inputs, comparator, evidence}` or `null` if inapplicable. Failed rules produce `kind='rule'` findings with full inputs in `reasoning_trace`.
2. **Contradiction pass.** Compare field values across sources for the same equipment/attribute. Mismatches produce `kind='contradiction'` findings — these are *always* at least warm severity.
3. **LLM interpretive pass.** For each equipment + its spec paragraphs, ask Claude Sonnet to identify install-readiness issues *not already caught by rules*. System prompt explicitly tells it to skip AIC/SCCR/enclosure/ampacity/coordination since rules handle those. Output strictly JSON.
4. **Consensus gate on hot findings.** Any finding with `severity='hot'` (rule-fired or interpretive) runs through Gemini 2.5 Pro with the same inputs. If verdicts agree, confidence stays high. If disagree, downgrade to warm and set `models_disagree=true`.
5. **Write findings** with full `reasoning_trace` + `evidence` arrays. Update `equipment.status` based on worst finding per entity.

---

## Rule engine — initial 6 rules

Each rule is a TypeScript function `(ctx: XrefTriple, project: Project) => RuleResult | null`. Registered in `lib/rag/rules/index.ts`.

| Rule | Check | Primary evidence sources |
|---|---|---|
| `aic` | `equipment.attributes.aic_kA ≥ project.available_fault_current_ka` | submittal_field `AIC`, project setting |
| `sccr` | `panel.attributes.sccr_kA ≥ project.available_fault_current_ka` | submittal_field `SCCR` |
| `enclosure` | `submittal.enclosure_nema ⊇ spec.required_nema` (NEMA hierarchy: 4X ⊇ 4 ⊇ 3R ⊇ 3 ⊇ 1) | spec_paragraph, submittal_field |
| `ampacity` | `feeder.ampacity ≥ 1.25 × continuous_load + non_continuous_load` | drawing_annotation + submittal_field |
| `coordination` | For parent/child OCPD pair: `downstream.aic ≥ upstream.trip_rating` | equipment graph + submittal_fields |
| `spec_drift` | For each `(spec_requirement, submitted_value)` pair where both exist: `submitted ≥ required` (typed comparator per field) | spec_paragraph + submittal_field |

Missing inputs → rule returns `null` (not a finding). An unresolved requirement produces a separate `kind='interpretive'` finding with `verdict='uncertain'` at cool severity.

---

## LLM abstraction (`lib/llm.ts`)

Single entry point, provider-agnostic:

```ts
type Provider = 'anthropic' | 'google';
type Purpose = 'classify' | 'extract_equipment' | 'parse_spec' | 'parse_submittal'
             | 'finding_interpretive' | 'finding_consensus' | 'chat';

chat({ messages, system, model?, stream?, purpose, projectId })
vision({ images, prompt, model?, purpose, projectId })
structured<T>({ messages, schema, system, model?, purpose, projectId })
consensus({ messages, system, schema, primary, secondary, purpose, projectId })
   // runs both providers, returns {agreed, primary, secondary}
```

Defaults:
- `classify` → `claude-haiku-4-5`
- `parse_spec` → `claude-sonnet-4-6`
- `parse_submittal`, `extract_equipment` → `claude-sonnet-4-6` vision
- `finding_interpretive` → `claude-sonnet-4-6`
- `finding_consensus` → `gemini-2.5-pro`
- `chat` → `claude-sonnet-4-6` streaming

Every call writes one `llm_calls` row with token counts, latency, and cost estimate. Cost estimates live in `lib/llm/pricing.ts` (a static table) — update quarterly.

---

## Key prompts (draft — refine during build)

**Classification (Haiku):**
> You classify construction PDFs. Given the first 3 pages of text + layout, return one of: `drawing`, `spec`, `submittal`, `other`. Drawings are plan-view or schematic graphics, often large-format. Specs are CSI-formatted written documents (Division 26 for electrical). Submittals are vendor product data packages with cut sheets. Reply JSON only: `{"type":"...","confidence":0-1,"reasoning":"..."}`.

**Spec structural parse (Sonnet, fallback from regex):**
> You are parsing a CSI MasterFormat electrical spec section. Produce a JSON array of paragraphs with canonical paths `"26 24 16/2/4/A"` and exact text content. Preserve original language verbatim — do not paraphrase. Never invent paragraph markers. Return JSON only.

**Equipment + annotation extraction (Sonnet vision):**
> You are an expert electrical PM reviewing a drawing page. Extract every discrete electrical equipment entity (panelboards, switchgear, MDPs, feeders, transformers, VFDs, motors, disconnects, grounding). For each, return `{tag, name, category, attributes, fed_from_tag, bbox}`. Also return visible annotations as `{type, label, bbox}`. Never invent tags. If a field cannot be determined, return null. Return JSON only.

**Submittal field extraction (Sonnet vision):**
> You are extracting structured values from a vendor cut sheet. Return JSON `{equipment_tag?, manufacturer, model, fields:[{name, value, unit?, raw_snippet, bbox}]}`. Normalize names to the canonical set: `AIC`, `SCCR`, `enclosure_nema`, `voltage`, `ampacity`, `poles`, `frame`. Values must be typed. Never invent values that aren't visually present. Return JSON only.

**Finding interpretive pass (Sonnet):**
> You are an electrical code reviewer. The project's submittals, drawings, and specs are provided via retrieval. Equipment-level numeric comparisons (AIC, SCCR, enclosure NEMA match, conductor ampacity, OCPD coordination, spec-to-submittal drift) are handled by a deterministic rule engine — do not duplicate those findings. Focus on: working clearance interpretations (NEC 110.26), grounding/bonding narrative requirements, spec-specific installation requirements, labeling and identification, mounting and support. For each finding, return `{title, summary, severity, time_to_impact_days, category, equipment_ids, verdict, confidence, evidence:[{source_id, source_kind, document_id, page, bbox, snippet, reasoning}]}`. Do not invent evidence. If evidence is ambiguous, set verdict='uncertain' and severity='cool'. Reply JSON only.

**Consensus check (Gemini 2.5 Pro):**
> You are a second reviewer. The primary reviewer produced this finding: {finding}. Given the same evidence, do you agree with the verdict and severity? Reply JSON only: `{agreed: boolean, dissent_reason?: string, suggested_verdict?, suggested_severity?}`.

**Compare chat (Sonnet, streaming):**
> You are Voltaic, an electrical install-readiness assistant. You have access to project documents via retrieval and the equipment graph. When the user asks a question, retrieve relevant atoms, identify 1–2 most relevant documents to pin as side panes, and return reasoning with inline citations `[source_kind:source_id:page:bbox]`. Never claim something you cannot cite. If evidence contradicts, surface it explicitly. Structured output: `{response_markdown, cited:[{source_id, source_kind, document_id, page, bbox}], proposed_panes:[document_id, document_id?], reasoning_steps:[{step, atoms_used, conclusion}]}`.

---

## Eval harness (`lib/eval/`)

Ground-truth file shape (`public/demo/ground_truth.yaml`):

```yaml
project: riverside-medical-demo
findings:
  - id: gt_001
    kind: rule
    rule: aic
    equipment_tag: MDP-A
    verdict: non_compliant
    expected_severity: hot
    required_evidence:
      - source_kind: submittal_field
        field: AIC
        value: 42
      - source_kind: spec_paragraph
        path: "26 24 16/2/4/A"
  - id: gt_002
    kind: contradiction
    equipment_tag: PP-1A
    conflict_field: SCCR
    ...
```

`scripts/run_eval.ts`:
1. Runs full ingest + analyze on the demo project.
2. For each ground-truth finding, check that a produced finding matches (kind + equipment + verdict).
3. For each produced finding not in ground truth, log as false positive.
4. Emit precision, recall, F1, plus a diff.
5. CI target: precision ≥ 0.75, recall ≥ 0.80 on demo project. Drops fail the build.

Run on every prompt/model change. Every commit to `lib/rag/` runs the harness.

---

## UI

`product-mock-v6.html` (in `RAG Startup Expert/`) is the visual source of truth. Port component-by-component.

- **Top bar:** project breadcrumb + revision ribbon (*"Day 85 of 240"*) + **cost meter chip** (*"Analysis: $7.43"*).
- **Left sidebar:** Today / System Map / Compare + "Electrical scope · MEP later" chip.
- **Today view:** Readiness hero + blocker cards ordered by severity × time-to-impact. Each card shows: title, summary, time-to-impact chip, equipment tag(s), **confidence chip**, **reasoning badge** (`rule: aic` or `llm+consensus`), inline evidence slice, and a `models_disagree` warning if set. Contradiction findings use a distinct card variant (dual-source layout).
- **System Map view:** Tier-based SVG (Service → Switchgear → Distribution → Panels → Branches → Loads). Entity colored by status. Click opens drawer with evidence + linked findings.
- **Compare view:** 4-column `[280px | 1fr | 1fr | 340px]`.
  - Left: recent chat + composer.
  - Middle two: doc panes.
  - Right: issue cards + **"Voltaic's reasoning"** transcript (structured steps: retrieved → rules → interpretation → verdict) + trust footer.

**Palette:** `--cream #faf9f5`, `--coral #c15f3c`, `--sage #7a8471`, `--clay #b8755a`, `--gold #d4a574`. Severity: hot `#c15f3c`, warm `#d4a574`, cool `#7a8471`. Contradiction: `--clay`.

**Typography:** Inter UI, JetBrains Mono for codes/tags, Tiempos Text for display numerics.

**Trust footer** on Compare and under every finding card: *"AI-flagged · Engineer verifies before action. Citations link to source documents."* Non-negotiable.

**No action CTAs on findings in v1.** `findings.status` toggles `open` ↔ `acknowledged` via a muted icon.

---

## Demo project seeding

Source one public-domain electrical project for `/public/demo/`. Candidates: GSA Design Excellence, state university capital projects, Army Corps samples. Target: 15 drawings + 15 specs (Division 26) + 15 submittals = ~45 PDFs total (user-facing demo may enable only 30 to stay under budget).

Ground-truth YAML authored with a domain advisor — aim for 20–40 seeded findings across rule/interpretive/contradiction kinds.

---

## Ordering of work

1. Next.js + Tailwind + Clerk skeleton, authed layout, three empty route pages.
2. Neon + Drizzle schema + RLS + workspace bootstrap on first login.
3. R2 client + upload route + basic file list UI.
4. Inngest + Stage 1 ingest (classify → text+raster).
5. **Stage 2a document identity** (header/stamp regex + vision title-block crop + LLM fallback).
6. **Stage 2b parsers** — spec (CSI + requirement_type + standards regex), submittal (fields + status stamp), drawing (equipment + annotations), **panel-schedule** (dedicated tabular extractor).
7. **Stage 2c tag dedup** + canonical equipment builder.
8. **Stage 3 indexing** (metadata-prefixed embeddings) + **Stage 4 hybrid retrieval** module + smoke-test script.
9. Port UI from v6 mock with mock data.
10. **Stage 5 cross-reference** (identity + seed map + submittal-status gate) + **Stage 6 rule engine** with 6 rules.
11. LLM interpretive pass + consensus gate + contradiction detection.
12. Wire UI to real DB; ship cost meter and reasoning transcript.
13. Compare chat streaming + doc-pane auto-selection + graph retrieval.
14. Eval harness + ground-truth YAML for demo project.
15. "Load demo project" button + seed pipeline.
16. Polish: evidence slices, empty states, confidence chips.

Critical-path gate: **no step past 10 ships until the eval harness runs clean on a 5-finding ground truth subset**.

---

## Open for Claude Code to decide, with judgment

- Exact chunk size for fallback chunks (start 800/100).
- RRF `k` parameter (start 60, tune against eval).
- Whether spec regex handles 90%+ of sections before falling back to LLM parse — measure and tune.
- PDF viewer: `react-pdf` for v1.
- Inngest retry/debounce values (30s project-debounce is a starting point).
- Shape of `equipment.attributes` JSON per category — define a typed schema in `lib/rag/types.ts`.

---

## Honest risks

- **Claude vision precision on dense drawings is the single biggest risk.** If equipment extraction is below eval thresholds after 3 days of prompt iteration, fall back to submittal-primary extraction with drawings as visual reference only.
- **Token cost per analysis.** Log every call. Budget: ≤ $15/full-demo run in steady state. If >$20, cut raster DPI or cap pages.
- **Consensus gate doubles cost on hot findings.** Acceptable if rule engine catches most hot findings (rule calls are free). Monitor the hot-interpretive ratio.
- **pgvector HNSW recall at 1024-dim.** Fine for v1 corpora. Reconsider at ~1M atoms.
- **Rule engine over-fires on malformed submittals.** Guard every rule with `null` returns on missing inputs; always prefer `uncertain` over `non_compliant` when a value is absent.

---

## TL;DR for Claude Code

Scaffold a Next.js 15 + TypeScript + Tailwind app called `voltaic`. Clerk auth, Neon Postgres with pgvector + tsvector, Drizzle ORM, Inngest durable jobs, R2 storage, Claude Sonnet 4.6 (primary) + Gemini 2.5 Pro (consensus) + Voyage-3 embeddings. Three routes (Today / System Map / Compare) styled after `product-mock-v6.html`.

Pipeline: ingest → **document identity** (CSI/sheet/submittal-log from headers, stamps, title blocks) → **structural parse** (CSI spec parser with requirement_type + referenced standards; vision equipment+annotation; vision submittal field extractor with status stamp; dedicated panel-schedule tabular extractor) → **fuzzy tag dedup** → index with **metadata-prefixed embeddings** + BM25 → **hybrid retrieval with metadata filters** → **deterministic cross-reference** (identity-driven + submittal-status-gated) → **rule engine (6 rules)** + LLM interpretive pass + consensus gate on hot findings + **contradiction detection**. Findings are the atom, carry evidence with content hashes and reasoning traces, and surface through the UI with confidence chips and a reasoning transcript.

Eval harness runs on every change. Cost is observable. Evidence is sub-chunk. Metadata before models. The Finding — not the document — is the product.
