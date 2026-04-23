export default function ComparePage() {
  return (
    <div
      className="grid h-full gap-0"
      style={{ gridTemplateColumns: "280px 1fr 1fr 340px" }}
    >
      <aside className="flex flex-col border-r border-[var(--color-rule)] bg-[var(--color-surface-sunken)] px-4 py-5">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Recent
        </p>
        <div className="mt-3 flex-1 text-[13px] text-[var(--color-ink-faint)]">
          No chats yet.
        </div>
        <div className="rounded-[8px] border border-[var(--color-rule)] bg-[var(--color-surface-raised)] p-3 text-[12px] text-[var(--color-ink-faint)]">
          Ask anything about this project…
        </div>
      </aside>

      <DocPanePlaceholder index={1} />
      <DocPanePlaceholder index={2} />

      <aside className="flex flex-col gap-4 border-l border-[var(--color-rule)] bg-[var(--color-surface-sunken)] px-4 py-5">
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
            Voltaic&apos;s reasoning
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ink-faint)]">
            When you ask a question, the reasoning chain — retrieved evidence,
            rules fired, and final verdict — shows here.
          </p>
        </div>
        <div className="mt-auto text-[11px] leading-snug text-[var(--color-ink-faint)]">
          AI-flagged · Engineer verifies before action. Citations link to
          source documents.
        </div>
      </aside>
    </div>
  );
}

function DocPanePlaceholder({ index }: { index: number }) {
  return (
    <div className="flex flex-col border-r border-[var(--color-rule)] last:border-r-0">
      <div className="flex h-10 items-center justify-between border-b border-[var(--color-rule)] bg-[var(--color-surface-raised)] px-4">
        <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Pane {index}
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center bg-[var(--color-surface)] p-8 text-center">
        <p className="max-w-[360px] text-[13px] leading-relaxed text-[var(--color-ink-faint)]">
          Empty. The agent will pin a document here when your question needs
          evidence from it.
        </p>
      </div>
    </div>
  );
}
