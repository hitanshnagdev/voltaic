"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * One-click "Draft RFI" on a finding. Creates an RFI artifact (deterministic
 * assembly from the finding) and refreshes so the new draft card appears in
 * the Feed. The agent drafts; the engineer reviews + sends.
 */
export function DraftRfiButton({ findingId }: { findingId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "drafting" | "done" | "error">(
    "idle",
  );

  async function draft() {
    if (state === "drafting" || state === "done") return;
    setState("drafting");
    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "rfi", findingId }),
      });
      if (!res.ok) throw new Error("failed");
      setState("done");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={draft}
      disabled={state === "drafting" || state === "done"}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-coral-tint-2)] hover:bg-[var(--color-coral-tint)] hover:text-[var(--color-coral-dark)] disabled:opacity-60"
    >
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v9a2 2 0 01-2 2z" />
      </svg>
      {state === "drafting"
        ? "Drafting…"
        : state === "done"
          ? "RFI drafted ✓"
          : state === "error"
            ? "Try again"
            : "Draft RFI"}
    </button>
  );
}
