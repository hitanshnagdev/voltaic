"use client";

import { useEffect } from "react";

/**
 * Error boundary for /compare. Surfaces the actual error message + digest
 * to the page (instead of Next.js's generic "this page couldn't load")
 * so production failures are debuggable without server log access.
 *
 * The digest matches the one Vercel surfaces in function logs, so a
 * screenshot of this page is enough to find the corresponding stack
 * trace upstream.
 */
export default function CompareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[compare/error]", error);
  }, [error]);

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-3xl space-y-6 px-8 py-12">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-clay)]">
            Compare page failed to render
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            The server hit an error building this page. Details below — share
            with the engineer to reproduce. Reload after a fix to retry.
          </p>
        </div>

        <div
          className="paper space-y-3 border-l-4 px-5 py-4 text-[13px]"
          style={{ borderColor: "var(--color-clay)" }}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Error message
            </div>
            <div className="mt-1 break-words font-mono text-[var(--color-ink)]">
              {error.message || "(no message)"}
            </div>
          </div>
          {error.digest && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Vercel digest
              </div>
              <div className="mt-1 font-mono text-[var(--color-ink-soft)]">
                {error.digest}
              </div>
            </div>
          )}
          {error.stack && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Stack
              </div>
              <pre className="scrollbar-thin mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-ink-soft)]">
                {error.stack}
              </pre>
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
