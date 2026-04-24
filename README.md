# Voltaic

**Install-readiness decision layer for electrical specialty contractors.**

Drop a project's drawings, specs, and submittals into Voltaic. It extracts an equipment graph, runs a deterministic compliance pass, and surfaces install blockers — each finding cited to a paragraph, table row, or drawing symbol with evidence-bound reasoning.

Every AI claim is framed **"AI-flagged · Engineer verifies before action."** The product surfaces decisions; it does not make them.

---

## Product surface (v1)

| View | Purpose |
| --- | --- |
| **Today** | Blocker cards ordered by severity × time-to-impact. Source-cited. Drafts RFIs. |
| **System Map** | Tier-based equipment topology (Service → Switchgear → Distribution → Panels → Loads). |
| **Compare** | Free-text chat with evidence-bound answers and doc-pane citations. |

## Core architectural principles

1. **The Finding is the atom** — one claim, N evidences, a verdict, a rule or reasoning chain, a confidence score.
2. **Deterministic where possible, LLM where necessary** — numeric compliance via rule engine; interpretive clauses via LLM only.
3. **Structural parsing before semantic embedding** — specs to CSI hierarchy, drawings to equipment graph, submittals to datasheet fields.
4. **Hybrid retrieval** — BM25 + vector + metadata filters via Reciprocal Rank Fusion.
5. **Evidence binding is sub-chunk** — spec paragraph, drawing symbol bbox, submittal field.
6. **Content-hash everything** — revision diffing and cross-project caching come free.
7. **Cost observability** — every LLM call logged; per-project cost meter visible in the UI.

Full detail: [`CLAUDE.md`](./CLAUDE.md) (north-star spec), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) (what's built vs. planned), [`docs/DECISIONS.md`](./docs/DECISIONS.md) (locked scope).

---

## Stack

- **Runtime:** Next.js 16 (App Router) · TypeScript · Tailwind v4
- **DB:** Postgres 17 (Neon) with `pgvector`, `pg_trgm`, `pgcrypto`
- **ORM:** Drizzle
- **Auth:** Clerk
- **Object storage:** Cloudflare R2
- **Jobs:** Inngest (durable step functions)
- **LLM:** Anthropic (Haiku 4.5 classify, Sonnet 4.6 extract/reason, Opus 4.7 hardest vision); Gemini 2.5 Pro reserved for hot-finding consensus
- **Embeddings:** Voyage-3 (1024-dim, pgvector)
- **OCR (Phase 3+):** AWS Textract for forms and tables
- **PDF:** `unpdf` (text), `pdfjs-dist` + `canvas` (raster)

---

## Local dev

Prereqs: Node 22 (see `.nvmrc`), npm 10+, a Neon Postgres branch, a Clerk dev instance, an R2 bucket, and Anthropic + Voyage API keys.

```bash
git clone https://github.com/hitanshnagdev/voltaic.git
cd voltaic
nvm use                     # honors .nvmrc (Node 22)
npm install
cp .env.example .env.local  # fill in secrets
npm run db:init             # create pg_trgm / pgcrypto extensions
npm run verify              # smoke-test all 4 credential sources
npm run dev
```

Open http://localhost:3000.

### Useful scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | Probes Neon, Anthropic, Voyage, R2 |
| `npm run db:init` | Enables required Postgres extensions |
| `npm run db:generate` | Drizzle migration generate |
| `npm run db:push` | Drizzle push (dev only) |

### Secrets

All runtime secrets live in `.env.local` (gitignored). `.env.example` is the source of truth for what needs to be set. **Never commit real keys.** Production secrets go in Vercel project env vars.

---

## Repo layout

```
app/
  (authed)/            # Clerk-gated Today / Map / Compare / Docs
  api/                 # upload, documents, inngest, chat (later)
  sign-in, sign-up
components/
  nav/                 # Sidebar, TopBar, RevisionRibbon, NoOrgGate
  docs/                # Docs client
inngest/
  client.ts
  functions/           # ingest-document, parse-spec, parse-submittal, …
lib/
  db/                  # schema + client + workspace helpers
  r2/                  # S3-compatible client
  pdf/                 # parse + raster
  llm.ts               # cost-logged provider abstraction
  llm/pricing.ts
  rag/                 # (Phase 2+) parse, normalize, retrieve, rules
  eval/                # (Phase 10) ground-truth harness
scripts/               # one-off tools (verify, db init, checks)
docs/                  # DECISIONS, ARCHITECTURE, RUNBOOK, ground-truth
public/
  demo/                # 30–50 PDF demo package (added in Phase 2)
```

---

## Status

Phases 0–1 in flight. See `docs/DECISIONS.md` for the locked v1 scope and `docs/ARCHITECTURE.md` for what currently exists vs. what's planned.
