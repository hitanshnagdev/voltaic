"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Draft a compliance report — snapshots the project's open findings into a
 * deliverable and opens it. Deterministic assembly; the engineer reviews.
 */
export function DraftComplianceButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "drafting" | "error">("idle");

  async function draft() {
    if (state === "drafting") return;
    setState("drafting");
    try {
      const res = await fetch("/api/artifacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "compliance_report" }),
      });
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as { artifact?: { id?: string } };
      if (data.artifact?.id) {
        router.push(`/outputs/${data.artifact.id}`);
      } else {
        router.refresh();
        setState("idle");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={draft}
      disabled={state === "drafting"}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-coral-tint-2)] hover:bg-[var(--color-coral-tint)] hover:text-[var(--color-coral-dark)] disabled:opacity-60"
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {state === "drafting"
        ? "Drafting…"
        : state === "error"
          ? "Try again"
          : "Draft compliance report"}
    </button>
  );
}
