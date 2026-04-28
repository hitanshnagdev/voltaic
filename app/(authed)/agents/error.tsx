"use client";

import { useEffect } from "react";

export default function AgentsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[agents/error]", error);
  }, [error]);

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-3xl space-y-6 px-8 py-12">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-clay)]">
            Agents page failed to render
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            The server hit an error building this page. Details below.
          </p>
        </div>
        <div
          className="paper space-y-3 border-l-4 px-5 py-4 text-[13px]"
          style={{ borderColor: "var(--color-clay)" }}
        >
          <div className="break-words font-mono text-[var(--color-ink)]">
            {error.message || "(no message)"}
          </div>
          {error.digest && (
            <div className="font-mono text-[11px] text-[var(--color-muted)]">
              digest: {error.digest}
            </div>
          )}
        </div>
        <button
          onClick={reset}
          className="rounded border border-[var(--color-line)] px-4 py-1.5 text-[13px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]"
        >
          Retry
        </button>
      </div>
    </section>
  );
}
