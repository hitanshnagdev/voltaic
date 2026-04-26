import Link from "next/link";

/**
 * Empty / failure-visibility states for /compare.
 *
 * Per the post-mortem on session 2026-04-26, this is the surface that
 * distinguishes "loop wired" from "loop works." A PM should never load
 * /compare and see a blank screen — they should see WHY there's nothing
 * to compare yet.
 */
export function CompareEmptyState({
  reason,
  detail,
}: {
  reason: "no_equipment" | "no_submittals" | "no_specs" | "equipment_not_found";
  detail?: string;
}) {
  const messages: Record<typeof reason, { title: string; body: string }> = {
    no_equipment: {
      title: "No equipment in this project yet",
      body:
        "Voltaic builds the compare table from extracted equipment. Upload at least one panelboard submittal — equipment is created automatically when a submittal cut sheet is parsed.",
    },
    no_submittals: {
      title: "No submittals to compare",
      body:
        "This equipment has no submittal data. Upload the panelboard cut sheet to start the comparison.",
    },
    no_specs: {
      title: "No spec uploaded yet",
      body:
        "Voltaic compares submittals against the matching CSI spec section. Upload the Division 26 spec PDF — paragraphs are extracted and matched to equipment automatically.",
    },
    equipment_not_found: {
      title: "Equipment not found",
      body:
        "The equipment in the URL doesn't exist in this project. Pick another equipment from the dropdown, or check that the link is current.",
    },
  };
  const m = messages[reason];
  return (
    <div className="paper mx-auto mt-12 max-w-xl p-8 text-center">
      <h2 className="text-base font-semibold text-[var(--color-ink)]">
        {m.title}
      </h2>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{m.body}</p>
      {detail && (
        <p className="mt-2 text-xs text-[var(--color-muted-soft)]">{detail}</p>
      )}
      <div className="mt-6">
        <Link
          href="/today"
          className="inline-block rounded border border-[var(--color-line)] px-4 py-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]"
        >
          ← Back to Today
        </Link>
      </div>
    </div>
  );
}
