"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { CompareEquipmentSummary } from "@/lib/db/compare";

/**
 * Server-rendered list, client-controlled selection. The page reads
 * `?eq=<equipmentId>` from the URL — we just push a new search param
 * on change so the page is shareable and re-rendered server-side.
 *
 * Visually a plain `<select>` for v1: project-scoped equipment counts
 * are usually small (1-30 panelboards), and a styled combobox would
 * burn UI complexity that's better spent on the table itself.
 */
export function CompareEquipmentSelector({
  equipment,
  selectedId,
}: {
  equipment: CompareEquipmentSummary[];
  selectedId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  return (
    <select
      value={selectedId}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("eq", e.target.value);
        router.push(`/compare?${params.toString()}`);
      }}
      className="rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-[13px] font-medium text-[var(--color-ink)] focus:border-[var(--color-coral-dark)] focus:outline-none"
    >
      {equipment.map((e) => (
        <option key={e.id} value={e.id}>
          {e.tag ?? "(no tag)"} · {e.category}
          {e.flaggedCount > 0 ? ` · ${e.flaggedCount} flagged` : ""}
        </option>
      ))}
    </select>
  );
}
