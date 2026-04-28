"use client";

import type { CompareData, SubmittalSummary } from "@/lib/db/compare";
import { CompareSubmittalSelector } from "./CompareEquipmentSelector";

/**
 * Top header bar for /compare. Three regions:
 *   - Left: breadcrumb "Compare / 26 24 16 Panelboards" — CSI section
 *           + spec title derived from the active assignment's spec
 *           filename. Falls back to project name when nothing assigned.
 *   - Middle: submittal selector (existing component, slim styling).
 *   - Right: per-submittal stats line.
 *
 * Action buttons (Compile RFI / Approve as noted) lived here briefly
 * but were pulled per the user's 2026-04-28 review — those workflows
 * (RFI generator, approval-stamp state machine) ship later as their
 * own features rather than as stubbed buttons cluttering the header.
 *
 * Renders as a borderless bar; the table toolbar below carries its
 * own border so the header doesn't visually compete with the data.
 */
export function CompareHeaderBar(props: {
  submittals: SubmittalSummary[];
  selectedId: string;
  data: CompareData | null;
  projectName: string;
}) {
  const breadcrumb = props.data
    ? deriveBreadcrumbTitle(
        props.data.activeAssignment.specFilename,
        props.data.activeAssignment.csiSection,
      )
    : props.projectName;

  const stats = props.data?.summary ?? null;
  const matchPct =
    stats && stats.evaluatedCount > 0
      ? Math.round((stats.passCount / stats.evaluatedCount) * 100)
      : null;

  // Stats line shows ONLY match% — flagged/missing/eval counts are
  // already visible (and clickable) in the toolbar status pills, so
  // duplicating them in the header is noise.

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-cream)] px-6 py-3">
      <div className="flex items-baseline gap-1.5 text-[15px] tracking-tight">
        <span className="font-semibold text-[var(--color-ink)]">Compare</span>
        <span className="text-[var(--color-muted-soft)]">/</span>
        <span className="font-mono text-[var(--color-ink-soft)]">
          {breadcrumb}
        </span>
      </div>

      <div className="flex items-center">
        <CompareSubmittalSelector
          submittals={props.submittals}
          selectedId={props.selectedId}
        />
      </div>

      <div className="ml-auto flex items-center gap-4 text-[12px]">
        {matchPct !== null && <MatchBadge matchPct={matchPct} />}
      </div>
    </div>
  );
}

function MatchBadge({ matchPct }: { matchPct: number }) {
  const color =
    matchPct >= 80
      ? "#3a5844"
      : matchPct >= 50
        ? "var(--color-coral-dark)"
        : "var(--color-clay)";
  return (
    <div className="flex items-baseline gap-1.5 font-mono text-[11px] text-[var(--color-muted)]">
      <span
        className="text-[16px] font-semibold tabular-nums"
        style={{ color }}
      >
        {matchPct}%
      </span>
      <span>match</span>
    </div>
  );
}

/**
 * Derive a clean "26 24 16 Panelboards" label from a spec filename
 * + CSI section. Filenames like `spec-26-24-16-panelboards.pdf` are
 * the convention; this fallback parser handles them deterministically
 * without needing a CSI title registry. Pure, exported for tests.
 */
export function deriveBreadcrumbTitle(
  specFilename: string,
  csiSection: string | null,
): string {
  let name = specFilename.replace(/\.[^.]+$/, "");
  name = name.replace(/^spec[-_\s]+/i, "");
  name = name.replace(/[-_]+/g, " ");
  if (csiSection) {
    const variants = [
      csiSection,
      csiSection.replace(/\s/g, "-"),
      csiSection.replace(/\s/g, ""),
    ];
    for (const v of variants) {
      name = name.replace(new RegExp(`\\b${escapeRegex(v)}\\b`, "ig"), "");
    }
  }
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return [csiSection, name].filter(Boolean).join(" ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
