/**
 * Outputs — the shelf of drafted deliverables (Phase 0 IA). Artifacts
 * (RFIs, change orders, compliance reports, recap emails) don't exist as a
 * stored type yet — they land in a later phase — so this is an honest empty
 * shelf describing what will appear, not mock data.
 */
export default function OutputsPage() {
  const kinds = [
    { name: "RFIs", note: "drafted from a finding or a meeting question" },
    { name: "Change orders", note: "from scope changes raised on a call" },
    { name: "Compliance reports", note: "spec-vs-submittal, exportable for the GC" },
    { name: "Recap emails", note: "decisions + action items, ready to send" },
  ];
  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-6xl space-y-8 px-8 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Outputs
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Everything Voltaic drafts for you — review, edit, and send or export.
          </p>
        </div>

        <div className="paper p-8 text-center">
          <h2 className="text-base font-semibold text-[var(--color-ink)]">
            Nothing drafted yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
            As Voltaic processes your meetings and documents, it will draft these
            here for your review. Drafts only — you always send.
          </p>
          <div className="mx-auto mt-6 grid max-w-lg gap-2 sm:grid-cols-2">
            {kinds.map((k) => (
              <div
                key={k.name}
                className="rounded-lg border border-dashed border-[var(--color-line-strong)] px-4 py-3 text-left"
              >
                <div className="text-sm font-medium text-[var(--color-ink-soft)]">
                  {k.name}
                </div>
                <div className="text-[11px] text-[var(--color-muted-soft)]">
                  {k.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
