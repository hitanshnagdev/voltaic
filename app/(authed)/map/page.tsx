export default function MapPage() {
  return (
    <div className="mx-auto flex h-full max-w-[1200px] flex-col gap-8 px-8 py-10">
      <header>
        <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          System Map
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-[32px] leading-tight">
          Where it is
        </h1>
      </header>

      <section className="flex min-h-[420px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[var(--color-rule)] bg-[var(--color-surface-sunken)] p-10 text-center">
        <div className="flex items-center gap-1 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-faint)]">
          <span>Service</span>
          <Arrow />
          <span>Switchgear</span>
          <Arrow />
          <span>Distribution</span>
          <Arrow />
          <span>Panels</span>
          <Arrow />
          <span>Branches</span>
          <Arrow />
          <span>Loads</span>
        </div>
        <p className="mt-6 max-w-[520px] text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
          Equipment topology will render here once a project is ingested —
          tier-based SVG graph with status colors per entity.
        </p>
      </section>
    </div>
  );
}

function Arrow() {
  return (
    <span aria-hidden className="px-1 text-[var(--color-ink-faint)]">
      →
    </span>
  );
}
