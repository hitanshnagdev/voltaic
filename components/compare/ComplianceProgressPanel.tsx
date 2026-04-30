"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * In-progress panel rendered on /compare when an assignment's
 * compliance_run_status is 'queued' or 'running'. Survives browser
 * refresh because the source of truth is the DB column, not client
 * state — the page server-renders this component whenever it sees
 * either status, and tears it down once the runner flips to 'ready'.
 *
 * Polls router.refresh() every 2.5s until the next render returns
 * a different shape (the table appears, or status flips to failed).
 */
export function ComplianceProgressPanel({
  status,
  specFilename,
  csiSection,
}: {
  status: "queued" | "running";
  specFilename: string;
  csiSection: string | null;
}) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => router.refresh();
    const id = setInterval(tick, 2500);
    intervalRef.current = id;
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [router]);

  const headline =
    status === "queued"
      ? "Compliance queued"
      : "Voltaic is reading the submittal";
  const subline =
    status === "queued"
      ? "Inngest just received the run request — extraction starts in a few seconds."
      : "Reading the spec checklist and grading each requirement against the submittal. This usually takes 30–90 seconds on a fresh PDF.";

  return (
    <div className="paper mx-auto mt-12 max-w-xl p-8 text-center">
      <div className="flex items-center justify-center gap-3">
        <span
          className="h-3 w-3 animate-pulse rounded-full"
          style={{ background: "var(--color-coral)" }}
        />
        <h2 className="text-base font-semibold text-[var(--color-ink)]">
          {headline}
        </h2>
      </div>
      <p className="mt-3 text-sm text-[var(--color-muted)]">{subline}</p>
      <p className="mt-3 text-[11px] text-[var(--color-muted-soft)]">
        Pair: <span className="font-mono">{specFilename}</span>
        {csiSection && <span className="font-mono"> · §{csiSection}</span>}
      </p>
      <ProgressBar />
      <p className="mt-4 text-[10px] text-[var(--color-muted-soft)]">
        Auto-refreshing every few seconds. You can leave this page —
        compliance keeps running and the table will be ready when you
        return.
      </p>
    </div>
  );
}

function ProgressBar() {
  return (
    <div className="mx-auto mt-6 h-1.5 w-48 overflow-hidden rounded-full bg-[var(--color-cream-deep)]">
      <div
        className="h-full rounded-full"
        style={{
          background: "var(--color-coral)",
          width: "40%",
          animation: "compliance-progress 1.6s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes compliance-progress {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(120%); }
          100% { transform: translateX(120%); }
        }
      `}</style>
    </div>
  );
}
