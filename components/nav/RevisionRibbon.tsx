export function RevisionRibbon() {
  return (
    <div className="rev-ribbon flex items-center gap-3 px-6 py-2 text-[12px]">
      <span className="rev-chip">
        <span className="dot" />
        Drawings{" "}
        <b className="ml-0.5 font-semibold text-[var(--color-ink-soft)]">
          Rev 4
        </b>{" "}
        · Apr 18
      </span>
      <span className="rev-chip warn">
        <span className="dot" />
        2 RFIs pending response
      </span>
      <span className="rev-chip">
        <span className="dot" />
        Schedule synced · Day 85 of 240
      </span>
      <span className="flex-1" />
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
        <span
          className="pulse-dot h-1.5 w-1.5 rounded-full"
          style={{ background: "var(--color-sage)" }}
        />
        AI analysis ran 2 minutes ago · 54 docs · 87 equipment items
      </span>
    </div>
  );
}
