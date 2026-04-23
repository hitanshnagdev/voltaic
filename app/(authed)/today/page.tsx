export default function TodayPage() {
  return (
    <div className="mx-auto flex h-full max-w-[1200px] flex-col gap-8 px-8 py-10">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-[12px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Today
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-[32px] leading-tight">
            What&apos;s on fire
          </h1>
        </div>
      </header>

      <section className="rounded-[12px] border border-[var(--color-rule)] bg-[var(--color-surface-raised)] p-8">
        <div className="flex items-baseline gap-3">
          <span className="font-[family-name:var(--font-display)] text-[56px] leading-none text-[var(--color-ink)]">
            0
          </span>
          <span className="text-[14px] text-[var(--color-ink-muted)]">
            equipment items · ready to install
          </span>
        </div>
        <p className="mt-4 max-w-[560px] text-[14px] leading-relaxed text-[var(--color-ink-muted)]">
          No project loaded yet. Upload drawings, specs, and submittals — or
          load the demo project — to populate Today with install-readiness
          findings.
        </p>
      </section>

      <div className="flex items-center gap-2 text-[12px] text-[var(--color-ink-faint)]">
        <span
          aria-hidden
          className="h-1 w-1 rounded-full bg-[var(--color-ink-faint)]"
        />
        AI-flagged · Engineer verifies before action. Citations link to source
        documents.
      </div>
    </div>
  );
}
