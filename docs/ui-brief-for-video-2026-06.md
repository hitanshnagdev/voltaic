# Voltaic UI brief — for Scene 4 rebuild

Source of truth: `voltaic-ten.vercel.app` (live deployed app) and the `elated-matsumoto-eaa971` worktree (most recent code). The product evolved beyond `CLAUDE.md`. Three authed views now: **Today**, **Compare**, **Agents** (Documents exists but isn't on-camera for the video).

Palette: cream `#faf9f5`, coral `#c15f3c` (hot/non-compliant), sage `#7a8471` (compliant/cool), clay `#b8755a` (contradiction), gold `#d4a574` (warm/verify). Type: Inter UI, JetBrains Mono for codes/tags. Sidebar is left rail with PROJECT label, project name, `Electrical scope · MEP later` chip, and four nav items: Today / Documents / Compare / Agents. Top bar shows Voltaic logo, org breadcrumb (e.g. "MJ Harris Construction"), project name with `ACTIVE` chip, user avatar far right.

---

## Today view — UNCHANGED from spec

Scene 5 is still accurate. One vertical scroll, max-w-6xl. Header "Today" + subtitle *"AI-flagged issues from the latest analysis · Engineer verification required before action"*, then a chip line `N open · X HOT · Y WARM · Z COOL`. Section heading "What's blocking install" with "Ranked by severity, then time-to-impact, then confidence."

**BlockerCard** (one per rule finding): left border-tinted row. Severity chip (`HOT`/`WARM`/`COOL`) → kind badge (`rule:aic`, `rule:sccr`, etc.) → bold title. Subline = one-sentence summary. Bottom meta line: `MDP-A` (mono) · `conf 87%` · `Cited in submittal-mdp-2-schneider.pdf, page 3`.

**ContradictionCard** variant: clay border, leading `CONTRADICTION` chip in place of severity, list of 2–4 sources side-by-side with truncated quoted snippets (`— "65 kAIC RMS symmetrical at 480 V"`).

Footer everywhere: *"AI-flagged · Engineer verifies before action. Citations link to source documents."* — non-negotiable, italic, muted.

---

## Compare view — REBUILT, this is what Scene 4 should show

The 4-column doc-pane chat from `CLAUDE.md` is gone. Compare is now a structured spec-vs-submittal **compliance table**, Airtable-style.

### Header bar
`Compare / 26 24 16 Panelboards`  (monospace section + title, derived from spec filename + CSI section) · submittal dropdown selector (`submittal-mdp-2-schneider.pdf · 87 flagged`) · right side shows large match-rate `54% match` (coral when <80%, sage when ≥80%).

### Empty / pre-run state
When a submittal × spec is paired but no run yet: centered card with **"Run compliance"** primary button (coral). After click: button switches to `Running…`, a pulsing coral dot appears with "Voltaic is reading the submittal against the spec checklist. This usually takes 30–60 seconds."

### Progress panel (during run)
Paper card, centered, max-w-xl. Pulsing coral dot + headline (`"Voltaic is reading the submittal"`) + subline explaining the spec-checklist grading. Shows pair `spec-filename.pdf · §26 24 16`. Animated horizontal progress bar (coral, shimmer left→right, 1.6s loop). Footer: *"Auto-refreshing every few seconds. You can leave this page — compliance keeps running and the table will be ready when you return."*

### Table (the hero shot)

**Status pill toolbar** (filter chips, top of table):
- `All 176`
- `● Compliant 52` (sage dot)
- `● Not compliant 8` (clay/coral dot)  ← the dramatic one
- `● Verify 37` (gold dot)
- `● Missing 79` (muted dot)

Right side: Filter button, search icon.

**Columns** (tight rows, ~12.5px text):
| # | Status | Attribute | Required | Submitted | Category | Verify |
|---|--------|-----------|----------|-----------|----------|--------|

- `#` row number
- `Status` icon-only column: `✗` for non-compliant (coral), `?` for verify (gold), blank for compliant. Default sort is status-desc so the broken rows surface to the top.
- `Attribute` bold attribute name (e.g. **Enclosure NEMA**, **AIC Ka**, **Plugin Breaker Allowed**), with an *italic muted reasoning subtext* beneath on flagged rows: *"Submittal value does not satisfy '≥ 65 kA'"*.
- `Required` the spec requirement (plain prose: `NEMA 3R`, `≥ 65 kA`, `225 A`, or free-text like `"molded-case thermal-magnetic"`).
- `Submitted` the submittal value with a tiny `p.3` page suffix. **Rendered in coral text when non-compliant** — that's the visual punch.
- `Category` pill (`Other`, `Construction & install`, `Ratings & listings`).
- `Verify` action column: `FLAG` pill (coral fill) on non-compliant, `VERIFY` pill (gold fill) on uncertain, `MISSING` pill (muted) on missing, blank on compliant.

The **hero row** for the demo is one of:
- **AIC Ka** — Required `≥ 65 kA` / Submitted `42 kA p.3` (in coral) / `FLAG` — this is the canonical $400K mistake.
- **Enclosure NEMA** — Required `NEMA 3R` / Submitted `3R p.4` (compliant green) vs. another row Required `NEMA 1` / Submitted `3R p.2` (still flagged because exceeds-not-equals language).
- **Aluminum Bus** — Required `No` / Submitted `Yes p.3` / `FLAG`.

### Citation popover
Click a row → side popover opens showing the underlying spec passage + submittal field side-by-side, with bbox highlights on the source PDF page. Closeable. (The popover is `CitationPopover.tsx`; same component is reused on Agents.)

---

## Agents view — the chat surface (separate tab from Compare)

This is where free-text Q&A lives — Scene 4 shouldn't conflate it with Compare. Three-column layout:

**Left rail (AgentRail):**
- Section `AGENTS · 1` with `+ New` button
- Default agent card: **Compliance Reviewer** with `CR` avatar circle (coral tint), description *"Verifies submittals against project specifications"*, `DEFAULT` chip
- Section `CONVERSATIONS · + New chat`
- Vertical list of past conversation titles with date + msg count (`May 4 · 0 msgs`, etc.)

**Main column (ChatThread):**
- Header (ChatHeader): agent name + Project chip · `ASKING ABOUT All documents ▼` selector (or a paired `submittal × spec` chip when scoped) · `Configure` button top-right
- Empty state: centered greeting `Hi Hitansh,` + `What do you need from Compliance Reviewer today?` + input box (`Ask Compliance Reviewer…  e.g. "Does the MDP-A submittal meet §2.2.B?"`) + `Send` button. Below: three suggestion chips:
  - *Does the latest submittal meet the spec's AIC requirement?*
  - *Compare AIC and SCCR across all panels.*
  - *Which spec items are flagged as non-compliant?*
- Status footer under composer: `↵ Send · ⇧↵ newline · Citations on · claude-sonnet-4-6 · temp 0.20 · AI-flagged — engineer verifies before action`
- On send: streaming markdown response. Inline citation chips `[#1]`, `[#2]` etc. — clickable, opens the same CitationPopover.

**Configure panel (right slide-over)** — only when user clicks `Configure`: edit system prompt, model (claude-sonnet-4-6 default), temperature, source filters (specs ✓ submittals ✓), retrieval limit.

### Compliance Reviewer behavior (the agent's voice — match this in any v.o. or captioning)
Verdict-first prose. Opens with a single sentence: *"The submittal does not meet the spec's AIC requirement."* Then explains in flowing prose, quoting verbatim from spec and submittal where it sharpens the answer. Uses a markdown table only for multi-attribute comparisons. Every factual claim has an inline `[#N]` citation marker. If the corpus is silent it says so plainly — never guesses. When the user asks for breadth ("all", "every", "complete table") it gives the partial answer and appends `[See the full compliance table in Compare →](/compare)` — this is the explicit handoff from Agents to Compare.

---

## Scene 4 — recommended rebuild beat sheet

1. **0:00** PM drags 3 PDFs (drawing, spec, submittal) onto Documents — they appear in a list with `parsing…` chips, then flip to `ready`.
2. **0:04** Cut to /compare. Empty state with "Run compliance" centered card.
3. **0:06** Click. Button → `Running…`, page transitions to ComplianceProgressPanel with pulsing dot and shimmer bar. *"Voltaic is reading the submittal…"*
4. **0:10** Cut. Table populates. Camera lands on the status pills — `Not compliant 8` glows.
5. **0:13** Click `Not compliant` pill → table filters down to 8 rows. AIC Ka row centered: **Required `≥ 65 kA` / Submitted `42 kA` (coral) / FLAG**.
6. **0:17** Hover/click the AIC row → CitationPopover slides in showing the spec passage quote and the submittal cut-sheet bbox highlighted on `p.3`.
7. **0:20** Subtle UI overlay: stopwatch chip "Caught in 4s" / "8 install blockers · before submittal stamp."
8. **0:22** Cut.

Optional supplemental 3–4s: cut to /agents, type *"Why is AIC flagged on MDP-A?"*, response streams in verdict-first with `[#1]` and `[#2]` citation chips — establishes that "you can also just ask." But the table is the hero; the chat is the second beat.

---

## What NOT to show (no longer in product)
- The old 4-column doc-pane Compare layout from `CLAUDE.md` (`DocPane`, `ChatComposer`, `IssueCard`, `ReasoningTranscript` 340px right rail). All removed.
- The "Voltaic's reasoning" structured-steps transcript on Compare. Gone. The reasoning trace exists in the data model but isn't UI-surfaced in the demo path.
- System Map / `/map` route — still in the codebase but cooler product surface; skip for the hero demo unless you want a 1.5s eye-candy cut.

---

## File pointers (for deeper verification if needed)
All paths relative to `/Users/hitanshnagdev/voltaic/.claude/worktrees/elated-matsumoto-eaa971/`:

- Compare entry: `app/(authed)/compare/page.tsx`
- Compare table: `components/compare/CompareTableV2.tsx` (852 lines — the full rendering logic, status pills, sort, search, filter, citation popover wiring)
- Compare header: `components/compare/CompareHeaderBar.tsx`
- Run-compliance CTA: `components/compare/RunComplianceButton.tsx`
- Progress panel: `components/compare/ComplianceProgressPanel.tsx`
- Agents entry: `app/(authed)/agents/page.tsx`
- Agents main: `components/agents/AgentsClient.tsx` (522 lines)
- Agent rail, chat thread, message bubble, citation popover, configure panel, new agent dialog, pair scope picker: `components/agents/*.tsx`
- Compliance Reviewer system prompt: `lib/agents/defaults.ts`
- Today entry: `app/(authed)/today/page.tsx`
- Today cards: `components/today/{BlockerCard,ContradictionCard,TrustFooter}.tsx`
