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

## 2026-04-25 — Decisions update

These supersede or extend the entries above. The format shifts to dated ADR-style entries because the table model doesn't carry reasoning forward well across multiple sessions.

### U1 — Defer Textract; ship Sonnet vision for v0 submittal parsing
**Supersedes A2 for v0.**
Anthropic is already wired in `lib/llm.ts`. Textract requires AWS SDK plumbing, IAM, regional config, and a fallback path we'd build anyway. Unit economics don't matter at zero customers. The first 1–5 submittals through Sonnet teach us whether the extracted-field shape is what rules actually need — Textract migration can't answer that. **Triggers to revisit:** customer load test, >5 real submittals, Sonnet output drift on the same PDF, or per-doc cost > $0.50. CLAUDE.md gets updated in the Textract migration PR.

### U2 — Rule engine is evidence-source-agnostic from day one
Each rule defines its own input shape (`AicTriple` is rule-specific, not universal). Clearance will need drawings + spec; SCCR needs submittal + (spec OR panel schedule). The `analyze-project` runner fires per-rule readiness events (e.g. `equipment/aic-ready`), not a generic `equipment/triple-ready`. Free now, expensive to retrofit when drawings parser ships.

### U3 — `/today` minimum-useful scope, locked
**In v1:** findings grouped by equipment, severity sort, click-through to one piece of evidence with document name + page number, trust footer. **Out:** dismiss/acknowledge workflow, cross-version finding identity, multi-project nav, filter/search UI. Everything-else lands as `/today` v2 once a design partner has reacted to v1.

### U4 — Confidence + severity ladders live in shared modules
`lib/rag/confidence.ts` (`FindingConfidence`, `IdentityConfidence` named constants). `lib/rag/severity.ts` (`severityFor({evidenceQuality, magnitude})` single decision function). All rules and identity resolvers use these — no inline magic numbers. Tunable in one place when eval harness gives calibration data.

### U5 — Spec_drift is a separate contradiction finding, not a side effect of AIC
When two spec atoms disagree on a required value, the rule still picks `max()` (conservative), but the runner emits a separate `kind='contradiction'` finding citing both atoms. CLAUDE.md is explicit that contradictions are first-class. Lands in step 4 (`analyze-project`).

### U6 — Re-parses preserve embeddings (encoded in code + migration)
`spec_paragraphs` has a unique index on `(document_id, content_sha256)`. `parse-spec.ts` save-paragraphs step does INSERT-on-conflict-do-nothing → DELETE-by-NOT-IN, **inside one `withWorkspace` transaction**, in that order. Splitting across two `step.run` blocks breaks atomicity. Cost savings: re-parsing the same spec doesn't burn Voyage tokens on unchanged paragraphs.

### U7 — First-finding-on-real-PDF is the next milestone
**Supersedes the implicit "build all 6 rules then eval" timeline.**
Strategic items (demo bundle, EE booking, design partner outreach, precision gate) are 30-day problems with 1–3 week lead times. Code work has 0-day lead time. Order:

1. Today (~2 hr): kick off long-lead items.
2. This week (5–7 days): smallest path to first real finding visible on `/today` — submittal parser → analyze-project → /today binding. One spec PDF + one submittal PDF, hand-curated.
3. Then expand: more rules, more PDFs, real eval, design partner conversations.

**Trigger to revisit:** if first-PDF screenshot shows wrong finding / wrong citation / wrong UI, reorder priorities to whatever the diagnosis says fix first.

### U8 — Precision gate calibration
**Supersedes P6.**
- **Precision ≥ 0.90 (hard CI block)** — false positives destroy trust fast; product principle is silence over false positives.
- **Recall ≥ baseline − 5% (soft regression guard)** — gate guards regressions, not absolute target.
- **Both gates go live at N ≥ 30 ground-truth findings.** First eval run is informational; precision-at-small-N is statistically meaningless.

CLAUDE.md gets updated when the eval harness PR lands.

### U9 — No rule #2 before the runner exists
Discipline gate. SCCR / enclosure / ampacity / coordination / spec_drift all wait until step 5 ships a real finding to `/today`. Adding more rules before the runner is accumulating blueprints on top of an unverified foundation.

### U10 — Equipment contract deferred until pain shows
A separate "equipment contract" module (canonical `equipment` shape, `ensureEquipmentByNormalizedTag` helper, `tag_aliases[]`, `getCsiSectionsForCategory`) is **deferred**. v0 has one equipment type (panelboard) with one tag form; the contract for that is `(tag, tag_normalized, project_id)` against the existing schema with a thin upsert helper inline. **Triggers to revisit:** second equipment type with overlapping tag normalization, first dedup pain, or first refactor pain in a parser.

### U11 — Append-only going forward
This file is append-only from here. Don't edit historical entries — add a new dated entry that supersedes them. Reasoning at the time of decision matters as much as the conclusion.

---

## Change log

- **2026-04-24** — Initial decisions locked. Authored during kickoff session.
- **2026-04-25** — Updates U1–U11 added: Textract deferred, rule engine made evidence-source-agnostic, `/today` scope cut, confidence/severity moved to shared modules, spec_drift contradiction split, embedding-preservation encoded, first-finding-on-real-PDF prioritized, precision gate recalibrated, rule #2 discipline gate locked, equipment contract deferred, file made append-only.
