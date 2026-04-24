# Voltaic — Architecture

Honest current-vs-target map. `CLAUDE.md` is the north-star spec; this doc is what we have and what's next.

Last revised: 2026-04-24.

---

## What Voltaic is (one paragraph)

An install-readiness decision layer for electrical PMs. A project's PDFs (drawings, specs, submittals) are ingested, structurally parsed per document type, joined into an equipment graph, and run through a deterministic rule engine plus an interpretive LLM pass. Every finding is cited to a paragraph, table row, or drawing symbol. This is a structured-extraction + reconciliation product with retrieval glue, not a chat product.

---

## Layered architecture

### Layer 1 — Ingest & storage
Files land in R2, are parsed to per-page text + raster, classified by type, and recorded in `documents` + `document_pages`. Content is hashed at file and page level so downstream work is cached and revision-diffable.

### Layer 2 — Document-type specialist extractors
No generic pipeline. Each doc type has a specialized extractor:
- **Specs** → CSI hierarchy regex + paragraph splitter + per-paragraph `requirement_type` LLM classifier + regex-extracted referenced standards.
- **Submittals** → AWS Textract (FORMS + TABLES) + Claude Haiku field normalization + dedicated vision crop for the approval stamp.
- **Drawings** → (a) title-block vision crop; (b) panel-schedule Textract table extraction; (c) annotation vision with bbox normalization. **Riser/one-line topology: user-confirmed, not auto-extracted in v1.**

### Layer 3 — Normalization & the graph
- Tag normalizer (strip + canonical case + fuzzy match via `pg_trgm` + rules).
- Value normalizers (AIC, SCCR, NEMA, voltage, ampacity → canonical units).
- `equipment` rows keyed by `(project_id, tag_normalized)`. `tag_aliases[]` preserves raw forms.
- `fed_from` edges from panel-schedule rows and user-confirmed one-lines. Traversal via Postgres recursive CTE.
- `xref` joins equipment ↔ spec paragraphs ↔ submittal records on `tag_normalized`.

### Layer 4 — Retrieval
- **Structural filter first**, always (`{workspace_id, project_id, doc_type?, csi_section?, equipment_tag?}`). Never retrieve from "all chunks."
- **Metadata-prefixed embeddings** — chunk text embedded as `"[CSI 26 24 16 §2.2.B] [req=aic] [standards=UL 489] <paragraph>"`. +20–30% recall on code-reference queries.
- **BM25** via Postgres `tsvector` + **vector** via pgvector, fused with **Reciprocal Rank Fusion**.
- **Rerank** top-20 → top-5 with `voyage-rerank-2`.
- **Graph-augmented** — for equipment-scoped questions, include `fed_from` neighbors' evidence.
- **Evidence packing** — primary first, supporting second, bounded ~8k tokens.

### Layer 5 — Rule engine & findings
- `rules/index.ts` registry; each rule takes structured inputs and emits a `finding` with `{verdict, evidence[], reasoning_trace, confidence}`.
- v1 rules: `aic` (AIC ≥ fault current), `spec_drift` (submittal field vs. spec).
- v1.1: `sccr`, `ampacity`, `enclosure`, `coordination`.
- Contradictions run as a separate detector that treats cross-source field conflicts as first-class findings.
- Hot-severity consensus path (Gemini) gated to `confidence<0.85`.

### Layer 6 — UX for construction users
- Three-click rule: finding → source PDF with bbox highlight in ≤3 clicks.
- Review-as-first-class: every extraction defaults to "pending review." Batch confirm.
- RFI-first output: one-click "Draft RFI" per finding.
- iPad-responsive `Today` view by end of Phase 10.
- Import surface before aesthetics: Procore / Bluebeam / inbound email matter more than polish.

### Layer 7 — Cost & accuracy observability
- Tiered model routing in `lib/llm.ts` (already logs `llm_calls`).
- Per-project cost meter in top bar.
- Eval harness with per-PR precision/recall regression gate (ground-truth YAML at `docs/ground-truth.template.yaml`).
- Target: 95% precision / 85% recall on hot findings, <$5 LLM spend per project at steady state.

---

## Current state (as of 2026-04-24)

### Shipped
- Next.js 16 App Router scaffold; Tailwind v4; Clerk org-gated `(authed)` layout; Today, Map, Compare, Docs routes (UI mocks only for Today/Map/Compare).
- Drizzle schema for: `workspaces`, `projects`, `documents`, `document_pages`, `llm_calls`.
- R2 client (`lib/r2/client.ts`).
- PDF parse (`unpdf`) + raster (`pdfjs-dist` + `canvas`) utilities.
- Upload route → R2 → `document/uploaded` Inngest event.
- Inngest `ingest-document` function: download → parse → classify (Haiku) → raster pages → upload rasters → write pages → mark ready. Retries + concurrency-limited.
- `lib/llm.ts` with Anthropic classify + cost logging + pricing table.
- Content-hash: file-level (`content_sha256`) and page-level (`page_sha256`) stored.
- CI (lint + typecheck + migration dry-run) and `.env` template.

### Gap to v1 target

| Layer | Missing |
|---|---|
| DB schema | ~~`equipment`, `findings`, `spec_paragraphs`, `submittal_fields`, `drawing_annotations`, `document_chunks`, `equipment_csi_map`, `chat_sessions`, `chat_messages`; RLS policies; `app.current_workspace_id` GUC~~ — **done in Phase 1**. `panel_schedules` deferred to v1.1. |
| Data constraints | ~~Drop "one active project per workspace"~~ — never enforced; confirmed in Phase 1. |
| Caching | ~~`hash_cache` table + `lib/cache/content_hash.ts`~~ — **done in Phase 1**. |
| Extractors | `lib/rag/parse/{spec,standards,schedule,submittal,drawing}.ts` |
| Identity | `lib/rag/identity.ts` — CSI/sheet/submittal-log resolver |
| Normalize | `lib/rag/normalize.ts`, `lib/rag/dedup.ts` |
| Xref | `lib/rag/xref.ts` |
| Retrieval | `lib/embed.ts`, `lib/rag/retrieve/{hybrid,graph,filters}.ts` |
| Rules | `lib/rag/rules/{index,aic,sccr,enclosure,ampacity,coordination,spec_drift}.ts` |
| Synthesis | `lib/rag/synthesis.ts`, `lib/rag/contradictions.ts` |
| Secondary LLM | Gemini path in `lib/llm.ts` |
| Eval | `lib/eval/harness.ts`, `lib/eval/metrics.ts`, `scripts/run_eval.ts` |
| UI wiring | Today, Map, Compare all currently render mock data; needs real data + bbox highlighting + doc-pane citations |
| Integrations | Procore import, Bluebeam link-drop, inbound email, RFI export |

---

## Phase plan (summary — full detail in `DECISIONS.md` and per-PR descriptions)

10-week cut:

1. **Phase 0** (done by this doc set) — ICP, scope, decisions, ground-truth template.
2. **Phase 1** — DB schema expansion + RLS + drop one-active-project constraint + content-hash cache table.
3. **Phase 2** — Spec parser + hybrid retrieval.
4. **Phase 3** — Submittal extraction + stamp-status OCR.
5. **Phase 4** — Tag normalization + equipment graph + user-assisted equipment confirmation flow.
6. **Phase 5** — Rule engine (AIC + spec_drift) + Today view wired + RFI draft generator.
7. **Phase 11** — Procore / email-to-upload / RFI export.
8. **Phase 10** — Eval harness + iPad review polish.

Deferred to v1.1:
- Phase 6 (panel schedules + SCCR/ampacity/enclosure rules).
- Phase 7 (drawing vision + annotations).
- Phase 8 (Compare view).
- Phase 9 (contradictions + consensus).
