# Voltaic — v1 Decisions

The single source of truth for locked scope, stack, and workflow. Every other doc defers to this one. Change only with a dated note below.

Last revised: 2026-04-24.

---

## Product

| # | Area | Decision | Rationale |
|---|---|---|---|
| P1 | ICP | PM at a 10–50 person electrical subcontractor, 3–8 active Div 26-heavy projects | Narrow enough to ship for; broad enough to sell to |
| P2 | Scope | 10-week cut: Phases 0–5 + 11 (data spine → specs → submittals → equipment graph → AIC + spec_drift rules + Procore/email import) | Panel-schedule OCR, drawing vision, Compare, and consensus deferred to v1.1 |
| P3 | Auth | Solo signup → later org-attach. Drop org-first gating | Electrical subs are small; PMs sign up individually first |
| P4 | Multi-project | Yes, from day 1 | PMs run 3–8 projects simultaneously; single-project = shelfware |
| P5 | Liability framing | "AI-flagged · Engineer verifies before action." Only | Anything stronger is legally dangerous |
| P6 | Accuracy target | 95% precision, 85% recall on **hot** findings, measured on a 3-project eval set | Precision over recall; false positives are cheap, false negatives aren't |
| P7 | Target ACV | $5,000 / yr (working assumption — confirm) | Drives cost decisions (model routing, caching, rerank) |
| P8 | Output artifact | RFI draft PDF per finding, evidence-embedded | Meets PMs inside their existing workflow |
| P9 | Field surface | Tablet-responsive `Today` by end of Phase 10 | Superintendents need iPad review; phone-native is v2 |

---

## Architecture

| # | Area | Decision | Rationale |
|---|---|---|---|
| A1 | Stack | Next.js 16 · TS · Tailwind v4 · Postgres 17 (Neon) + pgvector + pg_trgm + pgcrypto · Drizzle · Clerk · R2 · Inngest | Already scaffolded; no reason to rewrite |
| A2 | OCR | AWS Textract (FORMS + TABLES) for submittals and panel schedules | Strictly better than Claude vision on tabular extraction |
| A3 | Drawing vision | Claude Sonnet 4.6 on title blocks, annotations. **No auto-topology from riser/one-line in v1.** User confirms topology in a <5-min pass | Research-risk capped; accuracy moat retained |
| A4 | LLM routing | Haiku 4.5 classify · Sonnet 4.6 extract/reason · Opus 4.7 only for hardest vision crops | Cost-aware by default |
| A5 | Consensus | Gemini 2.5 Pro only when `severity='hot' AND confidence<0.85` | Narrow gate; rest of the time it doubles cost without value |
| A6 | Embeddings | Voyage-3 (1024-dim, pgvector HNSW). Text prefixed with structural metadata before embedding | Metadata prefixing is the single highest-leverage RAG trick for construction |
| A7 | Retrieval | Structural filters first → BM25 (tsvector) + vector fused via RRF → Voyage-rerank-2 on top-20 → pack top-5 into context by evidence role | Standard hybrid done right |
| A8 | Graph | Postgres recursive CTEs on `equipment.fed_from`. No Neo4j | Scales well past 10k nodes; simpler ops |
| A9 | Caching | `content_sha256` keyed cache on parse, classify, embed. Scoped cross-project (free-tier → paid) | Boilerplate Div 26 specs repeat across projects; free accuracy + cost savings |
| A10 | Finding atom | `{kind, title, summary, severity, verdict, confidence, evidence[], rule_id?, reasoning_trace?, models_disagree}` | The atom is the product |
| A11 | Evidence fingerprint | SHA-256 per evidence item | v2 revision diffing becomes a hash diff, not a reanalysis |

---

## Workflow

| # | Area | Decision | Rationale |
|---|---|---|---|
| W1 | Package manager | npm (for now). Revisit pnpm later if install times become a drag | Switching adds risk; not the bottleneck today |
| W2 | Node | 22 LTS via `.nvmrc` | Vercel current LTS |
| W3 | Branching | Trunk-based. Feature branches per sub-phase | `chore/*`, `docs/*`, `feat(rag)/*`, `feat(db)/*`, `fix/*` |
| W4 | PR size | Target <400 LOC diff where possible, one concern per PR | Faster review |
| W5 | Commits | Conventional commits, scoped: `feat(rag): …`, `fix(api): …` | Machine-readable changelog |
| W6 | Merge policy | I open → user reviews & merges anything touching RAG pipeline, findings, or rules. CI-gated squash-merge okay for scaffolding / docs / deps | Speed for infra, care for correctness |
| W7 | CI | On PR: lint + typecheck + drizzle generate dry-run. On main: same + (later) eval harness regression gate | Minimal but real |
| W8 | Deployment | Vercel preview deploy per PR. Production only from `main` | Pilot-demo-able from day 1 |
| W9 | DB migrations | `drizzle-kit generate` committed to `drizzle/`, applied via `drizzle-kit push` in dev and via the migrator in prod. Never edit migration files by hand | Reproducible |
| W10 | Secrets | Local: `.env.local` (gitignored). Prod: Vercel env vars. Never in chat, never in code | Security hygiene |

---

## Open items (need user input)

- [ ] **Target ACV confirmation.** Currently assuming $5k/yr (item P7). Correct if off.
- [ ] **Demo project PDFs.** Needed by day 10 of Phase 2.
- [ ] **Ground truth fill-in.** Template lives at `docs/ground-truth.template.yaml`. Fill with an electrical engineer; needed by end of Phase 5.
- [ ] **Design direction.** Continuing with the existing "paper" aesthetic unless Figma provided.
- [ ] **Figma access.** Not required but nice.

---

## Change log

- **2026-04-24** — Initial decisions locked. Authored during kickoff session.
