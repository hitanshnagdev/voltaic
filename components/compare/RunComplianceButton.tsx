"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type RunCompliancePayload = {
  submittalDocumentId: string;
  specDocumentId: string;
  csiSection: string | null;
};

type Phase = "idle" | "queuing" | "running" | "error";

/**
 * "Run Compliance" CTA — drops into /compare's empty state when a
 * submittal is paired but extraction hasn't run yet (or hasn't run
 * for this spec selection).
 *
 * Click flow:
 *   1. POST /api/compliance/run with the active assignment's keys.
 *   2. On 200, switch to a polling state. Every 2.5s, ping
 *      router.refresh() — /compare is a server component, so
 *      buildCompareDataForSubmittal re-runs and the empty branch
 *      flips to the table once responses persist.
 *   3. On 409 (checklist still parsing), surface the message and
 *      let the user retry in a moment.
 *   4. On any other failure, show the error inline.
 *
 * Polling ends naturally because the next render no longer shows
 * this component — the table appears in its place.
 */
export function RunComplianceButton({
  submittalDocumentId,
  specDocumentId,
  csiSection,
  variant = "primary",
}: RunCompliancePayload & { variant?: "primary" | "header" }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop polling on unmount or when phase moves away from "running".
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function run() {
    setPhase("queuing");
    setError(null);
    try {
      const res = await fetch("/api/compliance/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submittalDocumentId,
          specDocumentId,
          csiSection,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409) {
          setError(
            "Spec checklist is still being parsed. Try again in ~30 seconds.",
          );
        } else {
          setError(j.error ?? `Failed to queue (status ${res.status})`);
        }
        setPhase("error");
        return;
      }
      setPhase("running");
      // First refresh after ~3s gives the runner a chance to finish
      // on tiny checklists before we incur an extra DB read.
      const tick = () => router.refresh();
      const id = setInterval(tick, 2500);
      intervalRef.current = id;
      setTimeout(tick, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("error");
    }
  }

  if (variant === "header") {
    return (
      <button
        onClick={run}
        disabled={phase === "queuing" || phase === "running"}
        className="rounded-md border px-3 py-1.5 text-[12px] font-medium transition disabled:opacity-60"
        style={{
          borderColor: "var(--color-coral-tint-2)",
          background: "var(--color-coral-tint)",
          color: "var(--color-coral-dark)",
        }}
        title="Run AI compliance check on this submittal × spec pair"
      >
        {phase === "queuing"
          ? "Starting…"
          : phase === "running"
            ? "Running…"
            : "Run compliance"}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={run}
        disabled={phase === "queuing" || phase === "running"}
        className="btn-primary px-6 py-2 text-[13px] disabled:opacity-60"
      >
        {phase === "queuing"
          ? "Starting…"
          : phase === "running"
            ? "Running compliance…"
            : "Run compliance"}
      </button>
      {phase === "running" && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
          <span
            className="pulse-dot h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--color-coral)" }}
          />
          Voltaic is reading the submittal against the spec checklist.
          This usually takes 30–60 seconds.
        </div>
      )}
      {phase === "error" && error && (
        <div className="rounded border border-[var(--color-clay-tint)] bg-[var(--color-clay-tint)] px-3 py-1.5 text-[11px] text-[var(--color-clay)]">
          {error}
        </div>
      )}
    </div>
  );
}
