"use client";

import { useState } from "react";
import type { CompareData, SubmittalSummary } from "@/lib/db/compare";
import { CompareSubmittalSelector } from "./CompareEquipmentSelector";

/**
 * Top header bar for /compare. Three regions:
 *   - Left: breadcrumb "Compare / 26 24 16 Panelboards" — CSI section
 *           + spec title derived from the active assignment's spec
 *           filename. Falls back to project name when nothing assigned.
 *   - Middle: submittal selector (existing component, slim styling).
 *   - Right: per-submittal stats line + action buttons (Compile RFI
 *           from N, Approve as noted). Actions open stub modals for
 *           v1 — the underlying RFI generator is v2 work.
 *
 * Renders as a borderless bar; the table toolbar below carries its
 * own border so the header doesn't visually compete with the data.
 */
export function CompareHeaderBar(props: {
  submittals: SubmittalSummary[];
  selectedId: string;
  data: CompareData | null;
  projectName: string;
}) {
  const breadcrumb = props.data
    ? deriveBreadcrumbTitle(
        props.data.activeAssignment.specFilename,
        props.data.activeAssignment.csiSection,
      )
    : props.projectName;

  const stats = props.data?.summary ?? null;
  const matchPct =
    stats && stats.evaluatedCount > 0
      ? Math.round((stats.passCount / stats.evaluatedCount) * 100)
      : null;
  const flaggedCount = stats?.flaggedCount ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-cream)] px-6 py-3">
      <div className="flex items-baseline gap-1.5 text-[15px] tracking-tight">
        <span className="font-semibold text-[var(--color-ink)]">Compare</span>
        <span className="text-[var(--color-muted-soft)]">/</span>
        <span className="font-mono text-[var(--color-ink-soft)]">
          {breadcrumb}
        </span>
      </div>

      <div className="flex items-center">
        <CompareSubmittalSelector
          submittals={props.submittals}
          selectedId={props.selectedId}
        />
      </div>

      <div className="ml-auto flex items-center gap-4 text-[12px]">
        {stats && (
          <StatsLine
            matchPct={matchPct}
            flagged={stats.flaggedCount}
            missing={stats.missingCount}
            evaluated={stats.evaluatedCount}
            total={stats.totalCount}
          />
        )}
        <ActionButtons flaggedCount={flaggedCount} />
      </div>
    </div>
  );
}

function StatsLine(props: {
  matchPct: number | null;
  flagged: number;
  missing: number;
  evaluated: number;
  total: number;
}) {
  const matchColor =
    props.matchPct == null
      ? "var(--color-muted)"
      : props.matchPct >= 80
        ? "#3a5844"
        : props.matchPct >= 50
          ? "var(--color-coral-dark)"
          : "var(--color-clay)";
  return (
    <div className="flex items-baseline gap-1.5 font-mono text-[11px] text-[var(--color-muted)]">
      {props.matchPct !== null && (
        <>
          <span
            className="text-[16px] font-semibold tabular-nums"
            style={{ color: matchColor }}
          >
            {props.matchPct}%
          </span>
          <span className="mr-1.5 text-[var(--color-muted)]">match</span>
        </>
      )}
      {props.flagged > 0 && (
        <>
          <span className="text-[var(--color-muted-soft)]">·</span>
          <span style={{ color: "var(--color-clay)" }} className="font-semibold">
            {props.flagged}
          </span>
          <span className="mr-1.5">flagged</span>
        </>
      )}
      {props.missing > 0 && (
        <>
          <span className="text-[var(--color-muted-soft)]">·</span>
          <span className="font-semibold">{props.missing}</span>
          <span className="mr-1.5">missing</span>
        </>
      )}
      <span className="text-[var(--color-muted-soft)]">·</span>
      <span className="font-semibold">
        {props.evaluated}/{props.total}
      </span>
      <span>eval</span>
    </div>
  );
}

function ActionButtons({ flaggedCount }: { flaggedCount: number }) {
  const [openModal, setOpenModal] = useState<"rfi" | "approve" | null>(null);
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setOpenModal("rfi")}
        disabled={flaggedCount === 0}
        className="rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] transition hover:border-[var(--color-line-strong)] disabled:cursor-not-allowed disabled:text-[var(--color-muted-soft)]"
      >
        Compile RFI from {flaggedCount}
      </button>
      <button
        onClick={() => setOpenModal("approve")}
        className="rounded bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-cream)] transition hover:bg-[var(--color-ink-soft)]"
      >
        Approve as noted
      </button>
      {openModal && (
        <ActionModal kind={openModal} onClose={() => setOpenModal(null)} />
      )}
    </div>
  );
}

function ActionModal({
  kind,
  onClose,
}: {
  kind: "rfi" | "approve";
  onClose: () => void;
}) {
  const copy =
    kind === "rfi"
      ? {
          title: "Compile RFI",
          body: "An RFI draft will be generated from each flagged row, including the spec citation and the submittal's deviating value, ready for engineer review.",
          cta: "Notify me when ready",
        }
      : {
          title: "Approve as noted",
          body: "Marks the submittal as approved with the noted exceptions. The deviation list — including any flagged rows — will be attached to the approval stamp for the engineer's record.",
          cta: "Notify me when ready",
        };
  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[rgba(20,18,15,0.30)]"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 z-40 w-[480px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl">
        <div className="border-b border-[var(--color-line-soft)] px-5 py-3">
          <div className="text-[15px] font-medium text-[var(--color-ink)]">
            {copy.title}
          </div>
          <div className="mt-0.5 text-[11px] font-mono uppercase tracking-wider text-[var(--color-coral-dark)]">
            Coming soon
          </div>
        </div>
        <div className="px-5 py-4 text-[13px] leading-[1.55] text-[var(--color-ink-soft)]">
          {copy.body}
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--color-line-soft)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-1.5 text-[12px] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
          >
            Close
          </button>
          <button
            onClick={onClose}
            className="rounded bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-cream)]"
          >
            {copy.cta}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * Derive a clean "26 24 16 Panelboards" label from a spec filename
 * + CSI section. Filenames like `spec-26-24-16-panelboards.pdf` are
 * the convention; this fallback parser handles them deterministically
 * without needing a CSI title registry. Pure, exported for tests.
 */
export function deriveBreadcrumbTitle(
  specFilename: string,
  csiSection: string | null,
): string {
  let name = specFilename.replace(/\.[^.]+$/, "");
  name = name.replace(/^spec[-_\s]+/i, "");
  name = name.replace(/[-_]+/g, " ");
  if (csiSection) {
    const variants = [
      csiSection,
      csiSection.replace(/\s/g, "-"),
      csiSection.replace(/\s/g, ""),
    ];
    for (const v of variants) {
      name = name.replace(new RegExp(`\\b${escapeRegex(v)}\\b`, "ig"), "");
    }
  }
  name = name.replace(/\s+/g, " ").trim();
  name = name.replace(/\b\w/g, (c) => c.toUpperCase());
  return [csiSection, name].filter(Boolean).join(" ");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
