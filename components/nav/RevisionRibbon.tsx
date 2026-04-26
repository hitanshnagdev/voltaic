/**
 * Project status ribbon under the top bar.
 *
 * Pre-cleanup: this component rendered four hardcoded mock chips
 * ("Drawings Rev 4 · Apr 18", "2 RFIs pending response", "Day 85 of
 * 240", "AI analysis ran 2 minutes ago · 54 docs · 87 equipment items").
 * None of those values had backing data. Per session 2026-04-26
 * post-mortem: anything that can't be sourced is removed, not faked.
 *
 * Post-cleanup: renders only real counts. Drawing revision tracking
 * and RFI integration are explicit v2 deferrals (CLAUDE.md "Scope —
 * what's explicitly NOT in v1"). When those land, they get added back
 * here with real data.
 *
 * Empty-project early return: when nothing has been ingested yet, the
 * ribbon disappears entirely rather than rendering a hollow strip.
 */

const RELATIVE_TIME_DIVISIONS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, "second"],
  [60, "minute"],
  [24, "hour"],
  [7, "day"],
  [4.34524, "week"],
  [12, "month"],
  [Number.POSITIVE_INFINITY, "year"],
];

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

function formatRelative(when: Date | null): string | null {
  if (!when) return null;
  let diff = Math.round((when.getTime() - Date.now()) / 1000);
  for (const [step, unit] of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(diff) < step) return RELATIVE_TIME_FORMATTER.format(diff, unit);
    diff = Math.round(diff / step);
  }
  return null;
}

export function RevisionRibbon(props: {
  documentCount: number;
  equipmentCount: number;
  openFindingCount: number;
  lastAnalysisAt: Date | null;
}) {
  const { documentCount, equipmentCount, openFindingCount, lastAnalysisAt } =
    props;
  // Empty project: nothing real to render. Hide the strip entirely
  // rather than show "0 docs · 0 equipment" — the empty state belongs
  // on /today, not in the chrome.
  if (
    documentCount === 0 &&
    equipmentCount === 0 &&
    openFindingCount === 0 &&
    !lastAnalysisAt
  ) {
    return null;
  }

  const lastAnalysisLabel = formatRelative(lastAnalysisAt);

  return (
    <div className="rev-ribbon flex items-center gap-3 px-6 py-2 text-[12px]">
      <span className="rev-chip">
        <span className="dot" />
        {documentCount} {documentCount === 1 ? "doc" : "docs"}
      </span>
      <span className="rev-chip">
        <span className="dot" />
        {equipmentCount}{" "}
        {equipmentCount === 1 ? "equipment item" : "equipment items"}
      </span>
      {openFindingCount > 0 && (
        <span className="rev-chip warn">
          <span className="dot" />
          {openFindingCount} open{" "}
          {openFindingCount === 1 ? "finding" : "findings"}
        </span>
      )}
      <span className="flex-1" />
      {lastAnalysisLabel && (
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
          <span
            className="pulse-dot h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-sage)" }}
          />
          AI analysis {lastAnalysisLabel}
        </span>
      )}
    </div>
  );
}
