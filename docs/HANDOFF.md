# Session handoff — 2026-04-25

A new Claude Code session inheriting this repo should read this file first, then `CLAUDE.md` (target spec), then `docs/DECISIONS.md` (what we actually decided). This file captures the **in-flight context** that doesn't live in either of those.

---

## TL;DR

Voltaic's pipeline runs end-to-end through ingest → spec parse → submittal parse → embeddings → retrieval, but **no findings are written yet**. The chain ends at an `equipment/aic-ready` event with no subscriber. The next PR (`#13 — analyze-project runner`) wires the rule engine to that event and produces the first real finding.

After `#13`, `#14` binds `/today` to real findings, and `#15` is the manual "screenshot moment" — upload one real spec PDF + one matching cut sheet and watch a hot AIC finding appear. That screenshot is the validation milestone.

**Discipline gate (DECISIONS.md U9):** no rule #2 (SCCR / enclosure / ampacity / coordination / spec_drift) ships before the runner exists and the screenshot moment lands.

---

## Current state of `main`

**Latest commit:** `30f8f08` — `feat(rag): submittal field parser (Sonnet vision, fan-out from ingest) (#12)`

**Tests:** 147 passing across 12 test files. Typecheck clean. Lint clean on tracked files.

**Recent merge sequence (newest first):**
| # | Title | What it shipped |
|---|---|---|
| #12 | submittal field parser | Sonnet vision per submittal → `submittal_fields` + `equipment` rows; emits `equipment/aic-ready` |
| #11 | confidence/severity ladders + embedding-preserve | `lib/rag/confidence.ts`, `lib/rag/severity.ts`, unique index on `spec_paragraphs (document_id, content_sha256)`, atomic insert-then-delete-by-NOT-IN |
| #10 | AIC rule | `evaluateAic(triple)` pure function + types |
| #9  | embeddings + hybrid retrieval | Voyage-3 client, `embed-spec-paragraphs` Inngest function, BM25 + vector + RRF in `lib/rag/retrieve/hybrid.ts` |
| #8  | spec ingest wiring | `parse-spec` Inngest function writes `spec_paragraphs` + `documents.identity` |
| #6  | identity resolver | `resolveSpecIdentity` for spec docs |
| #4  | CSI spec parser | Pure-function CSI parser + classifier + standards extractor |
| #3  | v1 data spine | Schema expansion, RLS, content-hash cache |

Older PRs (#1, #2, #5) are repo hygiene + lazy DB client.

**Open PRs:** none (this handoff PR will be the only one).

**Local-only branches you don't need to touch:**
- `archive/claude-code-prototype` (4095493) — safety net for the abandoned Claude Code v0 work (M5 + M6 + uncommitted Stage 3–6 prototype). Kept as cold backup. Don't push, don't delete unless you're sure the Cursor-track has reproduced everything. Recover any file via `git checkout archive/claude-code-prototype -- path/to/file`.

---

## The pipeline as it stands

```
upload PDF
    │
    ▼
ingest-document  ─►  classifies + rasterizes + writes document_pages rows
    │
    ├─►  document/spec-classified         ─►  parse-spec       ─►  spec_paragraphs (+identity)
    │                                            │
    │                                            ▼
    │                          document/spec-paragraphs-written
    │                                            │
    │                                            ▼
    │                                  embed-spec-paragraphs    ─►  spec_paragraphs.embedding
    │
    └─►  document/submittal-classified    ─►  parse-submittal   ─►  submittal_fields + equipment
                                                  │
                                                  ▼
                                       equipment/aic-ready  ◄── DEAD END (no subscriber yet)
```

`equipment/aic-ready` is the seam where PR #13 plugs in.

---

## Locked next-PR sequence

### **PR #13 — `feat(rag): analyze-project runner`** (~1.5–2 days)

Single Inngest function. Triggered by `equipment/aic-ready`.

**Steps:**
1. Load equipment row + its `submittal_fields` for AIC.
2. Resolve the equipment's CSI sections — start with `equipment.csi_sections`; if empty, look up via `equipment_csi_map` keyed on category (seeded by `scripts/seed_equipment_csi_map.ts`).
3. Call `retrieve()` with `requirementType: "aic"`, `csiSection` filter from step 2 (or unfiltered if no section known).
4. Build the `AicTriple` (defined in `lib/rag/rules/types.ts`).
5. Call `evaluateAic(triple)`. If `null`, exit (silence over false positives — DECISIONS.md U7 / CLAUDE.md core principle 2).
6. **Spec-drift detection:** if multiple retrieved spec atoms supply *different* extracted kA values for AIC, emit a separate `kind='contradiction'` finding citing both atoms. Lives alongside the rule's compliance verdict, not as a side effect (DECISIONS.md U5).
7. Insert into `findings` with full evidence + `reasoning_trace`.

**Pure helper to export and unit-test:** the AicTriple builder. Tests should mock `retrieve()` and DB calls — verify the logic, not the network.

**Reuse existing infrastructure:**
- `withWorkspace(workspaceId, fn)` for RLS-aware writes
- `lib/rag/rules/aic.ts` `evaluateAic` (already shipped, fully tested)
- `lib/rag/retrieve/hybrid.ts` `retrieve()` (already shipped)
- `lib/rag/rules/types.ts` `AicTriple` type (already shipped)
- `lib/rag/severity.ts` `severityFor()` for the contradiction finding's severity

**Out of scope for #13:**
- Other rules. **Discipline gate per DECISIONS.md U9: no rule #2 before runner.**
- Cost-meter UI surfacing the per-project spend.
- Multi-project finding rollup.

### **PR #14 — `feat(today): bind real findings rows`** (~1 day)

Replace the mock data in `app/(authed)/today/page.tsx`. Per DECISIONS.md U3 minimum cut:

- Server-side fetch of `findings` for the active project, filtered by `status='open'`.
- Group by `equipment_ids`, sort by `(severity DESC, time_to_impact_days ASC, confidence DESC)`.
- Each card shows: severity chip (color from existing palette: hot `#c15f3c`, warm `#d4a574`, cool `#7a8471`), title, summary, equipment tag, confidence chip, `kind` badge (`rule:aic` or `contradiction`), and one click-through "Cited in `[docname]`, page N."
- Trust footer: *"AI-flagged · Engineer verifies before action."* — non-negotiable per CLAUDE.md.
- Contradiction findings use a distinct card variant per `product-mock-v6.html`.

**Explicitly out of #14** (defer until a design partner gives feedback):
- Dismiss / acknowledge / escalate workflow.
- Cross-version finding identity (what happens when the spec is re-uploaded).
- Multi-project navigation.
- Filter / search UI.

### **PR #15 — first-PDF screenshot moment** (~1 day, mostly manual)

The validation milestone.

1. Find one Division 26 panelboard spec section + one matching panelboard cut sheet (Square D NQOD, Eaton PRL, Siemens P1 — anything where you can find a matching pair). Sources: GSA Design Excellence library, state university capital projects, USACE samples, municipal bid postings.
2. Drop both in `public/demo/`.
3. Upload through the UI. (You'll need the Clerk auth flow working — flag now if it isn't.)
4. Watch the chain: ingest → classify → parse-spec + parse-submittal → embed → analyze-project → finding row → `/today` render.
5. **Take the screenshot.**

If the screenshot looks wrong (wrong finding, wrong citation, wrong UI), diagnose and pick the next priority from there. If it looks right, the loop is real and the strategic items (more rules, demo bundle, eval harness, design partner outreach) become next-priority — because there's now a working loop to test them against.

---

## Lead-time items the human is responsible for

These are **not code work** but they're on the critical path to anything past PR #15. Each is cheap to start (5–30 min) with multi-week lead time. Start them today — they tick during the week the next session is shipping #13–#15.

### EE outreach (~5 min)

The eval harness needs ground-truth findings on a real project filled by a licensed EE. Booking now lands the slot ~2 weeks out, exactly when PR #15 wants ground truth.

Template:
> **Subject:** Quick paid consulting ask — 4 hrs reviewing AI-flagged electrical findings
>
> Hi [Name],
>
> I'm building Voltaic — an install-readiness layer for electrical specialty contractors. Given a project's drawings, specs, and submittals, it surfaces compliance issues (AIC mismatches, NEMA enclosure drift, working-clearance violations) before they hit the field.
>
> I need a licensed EE for ~4 hours of paid consulting:
> - I send you ~30 PDFs from a public-domain construction project and a YAML template (`docs/ground-truth.template.yaml`).
> - You fill in the "ground truth" — what real install blockers exist, with citations to spec section + page.
> - We use this to test whether the AI flags what it should and doesn't flag what it shouldn't.
>
> Remote, on your schedule. Standard consulting rate. Looking to do this in the next 2-3 weeks.
>
> Calendar: [your Calendly]
>
> — Hitansh

### Design partner DMs (~10 min for 3)

LinkedIn / email PMs at electrical specialty contractors. Filter "Project Manager" + "electrical contractor" by your city.

Template:
> Hi [Name] — I noticed you run projects at [Company]. I'm building a tool for electrical PMs that auto-flags install blockers from drawings/specs/submittals before they hit the field, with citations to spec section + page so the engineer can verify in 30 seconds.
>
> Looking for one design partner to show a 5-minute demo to in ~2 weeks and get your reaction. Not selling anything, not asking for an LOI. Just want to know if what I'm building actually maps to a real pain you have. 15-min call works.
>
> Open to it?

### Demo bundle wishlist (~30 min)

Don't curate yet — just identify 10 candidate PDFs. For PR #15 you only need **two**: one Division 26 panelboards spec section (`26 24 16`), one matching cut sheet (Square D / Eaton / Siemens / ABB).

Sources:
- **GSA Design Excellence** — https://www.gsa.gov/real-estate/design-and-construction/design-excellence
- **State university capital projects** — UC, UT, CSU systems all post full bid sets.
- **USACE samples** — Unified Facilities Guide Specifications (UFGS).
- **Bid posting boards** — DemandStar, BidNet, BidSync.

---

## Architectural conventions worth keeping

Patterns the past sessions established that the next session should preserve:

### Fan-out via Inngest events

Every parser is its own durable function with independent retries. `ingest-document` fires `document/<type>-classified`. Each parser subscribes to its own event. The drawing parser will slot in as `document/drawing-classified` → `parse-drawing` → `drawing_annotations` rows + `equipment/clearance-ready` event, without touching anything that already shipped.

### Per-rule readiness events

**DECISIONS.md U2.** Each rule defines its own readiness predicate. AIC needs spec + submittal → `equipment/aic-ready`. Clearance will need drawing + spec → `equipment/clearance-ready`. **Do not invent a generic `equipment/triple-ready`.** That couples rules to evidence types and forces refactor when drawings arrive.

### Content-hash caching

`lib/cache/content_hash.ts` exposes `memoize(purpose, contentSha256, fn)`. Used in `parse-spec.ts` for both identity resolution and paragraph parsing, in `parse-submittal.ts` for vision extraction, in `embed-spec-paragraphs.ts`... Re-uploading the same bytes across projects costs zero CPU on the second hit. Keep using it for any deterministic operation over content.

### `withWorkspace(workspaceId, fn)` for writes

RLS-ready tenant scope. Today the connection role has `BYPASSRLS`, so it's a no-op guardrail. When the role swap lands in Phase 10, every callsite becomes enforcement automatically. **Never write a tenant-scoped row outside `withWorkspace`.**

### Idempotent re-fires

Every parser supports being re-fired for the same document and converges on the same row state.
- `parse-spec`: insert-on-conflict-do-nothing on `(document_id, content_sha256)`, then delete-by-NOT-IN. Inside one tx. Order non-negotiable (DECISIONS.md U6).
- `parse-submittal`: delete `submittal_fields` for `(documentId, tag_normalized)`, then insert. `equipment` upserts on `(project_id, tag_normalized)` with `array_distinct` accumulation of `tag_aliases`.

### Confidence + severity ladders

**DECISIONS.md U4.** Every rule and identity resolver imports from `lib/rag/confidence.ts` and `lib/rag/severity.ts`. **No inline magic numbers.** When the eval harness gives calibration data, retuning happens in those two files and propagates everywhere.

### Citation invariant

Every finding emits evidence with `documentId` + `pageNum` + `snippet`. Snippets bounded to ~240 chars. **No claim without evidence binding.** Never invent values that aren't visually present.

---

## Known gotchas / things that bit us

- **Git config email.** Was `hitanshnagdev@hitanshs-MacBook-Air.local` (macOS default), Vercel rejected commits with that author. Resolved: global config now `hitansh@berkeley.edu`. **All future direct pushes must use that email** or Vercel rejects again. Old M1–M4 commits on `main` still have the bad email — frozen, doesn't affect Vercel because squash-merged PR commits dominate.
- **`.claude/` dir.** Claude Code session metadata + worktrees. Now in `.gitignore` (PR #7). If you see worktree leftovers, `git worktree remove` and `git branch -D claude/<name>`.
- **Vitest config.** Imports `@/...` paths and stubs `server-only` via aliases in `vitest.config.ts`. If a new test file fails with `Cannot find package '@/...'` or `module cannot be imported from a Client Component module`, the alias config is the answer — don't refactor tests, fix the config.
- **Drizzle migrations are layered.** `drizzle/pre/*.sql` (extensions) → `drizzle/000*.sql` (Drizzle-generated) → `drizzle/post/*.sql` (RLS policies, unique indexes, anything that depends on tables existing). Tracked via `voltaic_migrations` table. Idempotent. Run `npm run db:migrate`. **Don't use `drizzle-kit push`** — it bypasses pre/post lanes and drifts.
- **Spec/code drift discipline.** When code diverges from `CLAUDE.md` (Textract vs Sonnet was the recent one), the divergence ships in the same PR as a `CLAUDE.md` edit. Don't introduce drift even if the divergence is the right call.
- **`docs/DECISIONS.md` is append-only from 2026-04-25.** New decisions become a new dated entry that supersedes prior ones; don't edit historical entries.

---

## What "first finding on real PDF" actually means

After PR #15 lands, the loop is:

1. PM uploads `26 24 16 - PANELBOARDS.pdf` and `MDP-A_cutsheet.pdf` to a Voltaic project.
2. ~30 seconds later, `/today` renders one card:
   > **Hot · 0.95 confidence · rule:aic**
   > MDP-A AIC 42 kA < required 65 kA. Short by 23 kA.
   > Cited in `26 24 16 - PANELBOARDS.pdf`, page 4 · `MDP-A_cutsheet.pdf`, page 1
   > *AI-flagged · Engineer verifies before action.*

That's the validation. Either the loop works on real bytes (architecture validated, expand in confidence) or it doesn't (whatever the failure is, it's now a concrete diagnosis instead of a hypothesis). **Don't optimize the architecture further until the screenshot exists.**

---

## Resume prompt for the next session

Paste this as the first message of the new Claude Code session:

> Resuming Voltaic build. Read `docs/HANDOFF.md`, `CLAUDE.md`, and `docs/DECISIONS.md` first, in that order. `DECISIONS.md` U1–U11 (2026-04-25) supersede some earlier locked items.
>
> Latest on main: PR #12 (submittal parser) merged. Pipeline runs end-to-end through ingest → spec parse → submittal parse → embeddings → retrieval. The chain dead-ends at `equipment/aic-ready` with no subscriber.
>
> Next PR is **`feat(rag): analyze-project runner`** — subscribes to `equipment/aic-ready`, builds AicTriple via `retrieve()`, calls `evaluateAic`, writes to `findings`, emits spec_drift contradiction per U5. Do not start any other rule (SCCR / enclosure / ampacity / etc.) until the runner exists and PR #15 produces the first screenshot — this is locked per U9.
>
> After #13: PR #14 binds `/today` to real findings (minimum cut per U3, no dismiss/ack/cross-version). PR #15 is the manual screenshot moment.
>
> Lead-time items in parallel (Hitansh's responsibility, not code): EE booking link, design partner DMs, demo bundle wishlist. Templates are in `docs/HANDOFF.md`.
