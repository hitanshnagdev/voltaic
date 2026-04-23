export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-rule)] bg-[var(--color-surface-raised)] px-6">
      <div className="flex items-center gap-3">
        <nav className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink-muted)]">
          <span>Riverside Medical Center</span>
          <span aria-hidden className="text-[var(--color-ink-faint)]">
            /
          </span>
          <span className="text-[var(--color-ink)]">Electrical</span>
        </nav>
        <span className="ml-2 rounded-full border border-[var(--color-rule)] px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink-muted)]">
          Day 85 of 240
        </span>
      </div>

      <div className="flex items-center gap-3">
        <CostMeter amountUsd={0} />
        <div className="h-7 w-7 rounded-full bg-[var(--color-surface-sunken)] ring-1 ring-[var(--color-rule)]" />
      </div>
    </header>
  );
}

function CostMeter({ amountUsd }: { amountUsd: number }) {
  return (
    <span
      title="LLM cost for this project"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-rule)] bg-[var(--color-surface-sunken)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink-muted)]"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-sage)]"
      />
      Analysis ${amountUsd.toFixed(2)}
    </span>
  );
}
