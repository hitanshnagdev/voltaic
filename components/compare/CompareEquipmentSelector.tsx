"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { SubmittalSummary } from "@/lib/db/compare";

/**
 * Submittal selector. URL-driven (`?submittal=<id>`), server-rendered
 * list, client-controlled selection. Submittals appear sorted by
 * flagged-count desc so the most-broken thing surfaces first.
 *
 * Renamed from the equipment-based selector after the spec-driven
 * pivot — file kept under the old name to minimize churn; class /
 * export name updated to match.
 */
export function CompareSubmittalSelector({
  submittals,
  selectedId,
}: {
  submittals: SubmittalSummary[];
  selectedId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <select
      value={selectedId}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("submittal", e.target.value);
        // Clear ?spec when switching submittals — the new submittal
        // may have entirely different assignments.
        params.delete("spec");
        router.push(`/compare?${params.toString()}`);
      }}
      className="max-w-[360px] truncate rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1.5 font-mono text-[12px] text-[var(--color-ink-soft)] focus:border-[var(--color-coral-dark)] focus:outline-none"
    >
      {submittals.map((s) => (
        <option key={s.id} value={s.id}>
          {s.filename}
          {s.flaggedCount > 0 ? ` · ${s.flaggedCount} flagged` : ""}
          {s.assignmentCount === 0 ? " · unassigned" : ""}
        </option>
      ))}
    </select>
  );
}
