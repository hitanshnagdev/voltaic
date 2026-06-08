import Link from "next/link";
import type { Artifact } from "@/lib/db/schema";

const TYPE_LABEL: Record<string, string> = {
  rfi: "RFI",
  compliance_report: "Compliance report",
  change_order: "Change order",
  recap_email: "Recap email",
  filled_template: "Template",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  sent: "Sent",
  exported: "Exported",
};

/**
 * An Artifact rendered as a Feed card. Dashed coral border = "drafted for
 * you" (vs the solid severity border of a Finding). Click → detail view.
 */
export function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const typeLabel = TYPE_LABEL[artifact.type] ?? artifact.type;
  const statusLabel = STATUS_LABEL[artifact.status] ?? artifact.status;
  return (
    <Link
      href={`/outputs/${artifact.id}`}
      className="block rounded-[10px] border border-dashed border-[var(--color-coral-tint-2)] bg-[var(--color-coral-tint)]/40 px-4 py-3 transition-colors hover:bg-[var(--color-coral-tint)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-coral)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
              Draft · {typeLabel}
            </span>
          </div>
          <div className="mt-1 truncate text-sm font-medium text-[var(--color-ink)]">
            {artifact.title}
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--color-muted-soft)]">
            Drafted by Voltaic · review &amp; send
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-muted)]">
          {statusLabel}
        </span>
      </div>
    </Link>
  );
}
