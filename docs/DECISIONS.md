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

## 2026-04-26 — Decisions update

### U12 — Compare-page extraction: hardcode panelboard expectation set now; spec-checklist parser is the next architectural commitment, not today's

The compare-page demo (per user mock — categorized attribute table with grouped pass/fail counts) requires a per-equipment expectation set. Three plausible sources for that set:

1. **Generic submittal extraction.** Vision call extracts whatever is on the cut sheet; downstream tries to compare against whatever's in the spec. Doesn't scale across equipment types — different submittals expose different field shapes — and can't compute "3/5 pass" because there's no denominator.
2. **Spec-driven checklist.** Parse the spec into structured `{attribute, comparator, required_value, required_kind}` per CSI section. Submittal extraction targets that checklist. Compare-page rows are *the spec's checklist*; pass-rate is computable.
3. **Hardcoded per-equipment-type expectation set.** Panelboard = `{aic_ka, sccr_ka, voltage_system_v, phase, wires, ampacity_a, main_type, poles, enclosure_nema, listings, series_rated}`. Switchboard, transformer, etc. each get their own.

**Decision:** spec-driven checklist (#2) is the right long-term shape and the only one that scales. Commit to that schema now. **But** build it in two phases:

**Phase A (today, shipped):** hardcoded panelboard expectation set baked into the submittal vision prompt (`VISION_SYSTEM` in `inngest/functions/parse-submittal.ts`). The compare page renders against this fixed set. Validation moment depends on three moving parts (submittal vision, AIC rule, /today render), not four — spec-checklist parsing isn't on the critical path for the screenshot.

**Phase B (next, blocked on Phase A passing):** build the spec-checklist parser as its own PR. Output shape committed below. `submittal_fields` grows a nullable `spec_requirement_id text` column — additive migration, no destructive changes. The hardcoded expectation set in `VISION_SYSTEM` becomes a deprecation target once checklist coverage is non-zero on the demo project.

**Spec-checklist schema (the architecture commitment):**

```ts
type SpecChecklistItem = {
  // Stable id derived from spec source: e.g. "26 24 16/2/4/A:aic_ka"
  id: string;
  spec_paragraph_id: uuid;
  csi_section: string;            // "26 24 16"
  csi_path: string;               // "26 24 16/2/4/A"
  attribute: string;              // canonical: "aic_ka" | "sccr_ka" | "enclosure_nema" | ...
  required_kind: "numeric" | "enum" | "qualitative" | "manufacturer_list";
  comparator: "≥" | "≤" | "=" | "⊇" | "in";
  required_value: number | string | string[];
  // For "qualitative", required_value is the raw spec text — comparison
  // delegates to the LLM equivalence judge (per the deferred work).
  raw_quote: string;              // verbatim spec text the requirement was extracted from
  confidence: number;             // 0..1; calibrated against eval harness
};
```

**Why this commitment matters now:** future PRs (Phase B parser, comparator, compare-page rollup query, equivalence judge) all consume this shape. Locking it now lets each PR be built independently against the contract. Without the commitment, every consumer relitigates the schema.

### U13 — Citations API: stored as flat array now; per-field hallucination guard is the next sub-step

Anthropic citations API is wired into `documentExtract` and the submittal parser stores `page_location` citations under `submittal_fields.fields._citations`. Today this is **passive evidence** — citations are recoverable for audit but don't gate the extraction.

**Next sub-step (blocked only on this PR landing):** prompt restructured so each typed field carries an explicit `evidence_quote` slot. Citations API attaches to the quote spans. Verifier drops any field whose evidence quote has no overlapping `cited_text`. That's the actual hallucination guard.

**What we did NOT promise:** the PDF-pane drilldown UI (image 1's mock — coral-highlighted spans inside an embedded PDF viewer) does NOT come for free from citations. Citations give character offsets in *Sonnet's extracted text view*, not bbox coordinates in the rendered PDF. Bridging char offset → pdfjs `getTextContent` range → render-layer overlay is its own ~1-day PR — call it Phase C of the compare-page work, after the per-field hallucination guard and the spec-checklist parser.

### U14 — Compare page replaces chat-based Compare; chat demoted to future "Ask Voltaic" surface

CLAUDE.md's "free-text Q&A with auto-pinned doc panes" Compare design is superseded by the structured per-equipment compliance table per the user mocks (see image 2: grouped attribute rows with pass/fail dots, expand-to-finding-card). Chat capability gets demoted to a future modal/button (`Ask Voltaic`), out of v1 scope.

**Why:** image 2 is the dense, scannable artifact a PM lives in — chat is wow-on-demo but not where work happens. Mocks were validated with the user 2026-04-26.

CLAUDE.md gets updated in the compare-page UI PR.

---

### U15 — Freeze: no new under-the-hood work until /compare renders real data

**The pattern this rule defends against.** The 2026-04-26 session shipped 3400+ LOC across PRs #31, #32, #33 — submittal field expansion, citations API + per-field hallucination guard, SCCR + enclosure rules — and zero UI. The screenshot a design partner sees is unchanged. Each PR was individually defensible; the compounding pattern was the bug. Real-time awareness ("we're stacking infrastructure before UI") didn't stop it. Vigilance loses to flow state. The defense has to be structural.

**The freeze.** No new rule infrastructure ships until `/compare` is in prod and renders real data. Specifically prohibited until then:
- New rules (rule #4: ampacity / coordination / spec_drift)
- Hardening of existing rules (NEMA partial-order fix, AIC requirement-extraction edge cases)
- Hardening of citation guard (per-field attachment, threshold tuning, hallucination retry)
- New parser passes (spec-checklist extractor — Phase B per U12)
- Refactors of existing infrastructure (the three-clones factor noted in #33)

**Bug fixes are exempt.** A real bug — wrong verdict on demo PDF, broken ingest, regression — overrides the freeze. The freeze targets *forward investment*, not *defending what shipped*.

**Unfreeze condition (concrete, not squishy).** All three must be true:
1. `/compare` is deployed to production (`voltaic-ten.vercel.app/compare` accessible).
2. The page reads from `submittal_fields` directly — no mock data, no fixtures.
3. The page renders the demo project's actually-extracted attributes against the hardcoded panelboard requirement set, with verdicts visible per row.

**Once unfrozen, the next decision is data-driven, not aesthetic.** Look at what the rendered page exposes about the demo project. If equality checks across the panelboard rows produce zero interesting output, the rule engine isn't the bottleneck — extraction is. If they produce interesting output, the shell is validated and we pick the next deepening based on what's actually missing, not what would be elegant.

### U16 — PR size cap: ~500 LOC, soft target

**The cap.** PRs target ~500 LOC including tests. Crossing the cap isn't a hard block; it's the prompt to ask "do I still need the next part?" before continuing.

**Why this matters.** PR #33 was 1900 LOC. That's the bug. Large PRs remove the natural checkpoint where reality-check happens. Smaller PRs give the escape hatch when the goal shifts mid-work — which is precisely when over-investment compounds.

**Tests count toward the cap.** Yes — but the intent isn't "less testing per scope," it's "smaller scope per PR." When tests balloon a PR past 500, that's the signal to split the PR by feature, not to skip tests.

**Doesn't apply to.** Mechanical refactors (rename, move file), generated code (drizzle migrations, lockfile bumps), and review-time fixups can exceed the cap freely.

---

## Change log

- **2026-04-24** — Initial decisions locked. Authored during kickoff session.
- **2026-04-25** — Updates U1–U11 added: Textract deferred, rule engine made evidence-source-agnostic, `/today` scope cut, confidence/severity moved to shared modules, spec_drift contradiction split, embedding-preservation encoded, first-finding-on-real-PDF prioritized, precision gate recalibrated, rule #2 discipline gate locked, equipment contract deferred, file made append-only.
- **2026-04-26** — Updates U12–U14 added: spec-checklist schema committed (Phase A hardcoded panelboard expectation set shipped, Phase B parser deferred), citations API wired as passive evidence (per-field hallucination guard is the next sub-step), compare page replaces chat-based Compare per user mocks.
- **2026-04-26 (later)** — Updates U15–U16 added: freeze on new under-the-hood work until /compare renders real data (defense against the build → realize overbuilt → correct → overbuild loop the day exhibited), and a soft ~500 LOC PR-size cap as a forcing function for mid-work reality checks.
