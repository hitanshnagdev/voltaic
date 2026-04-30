"use client";

import { useEffect, useRef, useState } from "react";

export type PairOption = {
  submittalDocumentId: string;
  submittalFilename: string;
  specDocumentId: string;
  specFilename: string;
  csiSection: string | null;
};

/**
 * Pair-scope picker for the agents chat header.
 *
 * Two states:
 *   - Whole-project scope (default) — chip reads "All documents".
 *   - Pair scope — chip reads "<submittal> × <spec> §<csi>". Retrieval
 *     restricts to the two paired documents only.
 *
 * Picking a pair creates a NEW chat session with that scope. We don't
 * mutate scope on an existing session — mid-session scope flips would
 * make the chat history confusing (older turns retrieved from a
 * different doc set than newer ones).
 */
export function PairScopePicker(props: {
  active: PairOption | null;
  onPick: (pair: PairOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pairs, setPairs] = useState<PairOption[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open || pairs.length > 0) return;
    // Lazy-load on first open. setState-in-effect is intentional —
    // open is the trigger, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void fetch("/api/pairs")
      .then((r) => (r.ok ? r.json() : { pairs: [] }))
      .then((j: { pairs: PairOption[] }) => setPairs(j.pairs ?? []))
      .finally(() => setLoading(false));
  }, [open, pairs.length]);

  const label = props.active
    ? scopeLabel(props.active)
    : "All documents";
  const isScoped = props.active !== null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-medium transition"
        style={
          isScoped
            ? {
                borderColor: "var(--color-coral-tint-2)",
                background: "var(--color-coral-tint)",
                color: "var(--color-coral-dark)",
              }
            : {
                borderColor: "var(--color-line)",
                background: "var(--color-paper)",
                color: "var(--color-ink-soft)",
              }
        }
        title="Scope retrieval to a specific submittal × spec pair"
      >
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] opacity-70">
          Asking about
        </span>
        <span className="max-w-[280px] truncate">{label}</span>
        <span className="opacity-60">▾</span>
      </button>
      {open && (
        <div
          className="paper absolute right-0 top-full z-30 mt-1 w-[420px] py-1 text-[12px] shadow-md"
          style={{ borderColor: "var(--color-line)" }}
        >
          <button
            onClick={() => {
              setOpen(false);
              props.onPick(null);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[var(--color-cream-deep)]"
          >
            <span className="text-[var(--color-ink-soft)]">All documents</span>
            <span className="text-[10px] text-[var(--color-muted-soft)]">
              {props.active === null ? "current" : "default"}
            </span>
          </button>
          <div className="border-t border-[var(--color-line-soft)]" />
          <div className="px-3 pb-1 pt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Pairs in this project
          </div>
          {loading && (
            <div className="px-3 py-2 text-[11px] text-[var(--color-muted)]">
              Loading…
            </div>
          )}
          {!loading && pairs.length === 0 && (
            <div className="px-3 py-2 text-[11px] text-[var(--color-muted)]">
              No pairs yet. Assign submittals to specs in Documents.
            </div>
          )}
          {pairs.map((p) => {
            const isCurrent =
              props.active &&
              props.active.submittalDocumentId === p.submittalDocumentId &&
              props.active.specDocumentId === p.specDocumentId &&
              props.active.csiSection === p.csiSection;
            return (
              <button
                key={`${p.submittalDocumentId}-${p.specDocumentId}-${p.csiSection ?? "any"}`}
                onClick={() => {
                  setOpen(false);
                  props.onPick(p);
                }}
                disabled={!!isCurrent}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-[var(--color-cream-deep)] disabled:cursor-default disabled:opacity-60"
              >
                <span className="truncate font-medium text-[var(--color-ink)]">
                  {p.submittalFilename}
                </span>
                <span className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">
                  → {p.specFilename}
                  {p.csiSection && (
                    <span className="ml-1 font-mono">§{p.csiSection}</span>
                  )}
                </span>
                {isCurrent && (
                  <span className="mt-0.5 text-[9px] font-mono uppercase tracking-wider text-[var(--color-coral-dark)]">
                    current
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function scopeLabel(p: PairOption): string {
  const subShort = trimExt(p.submittalFilename);
  const specShort = p.csiSection ? `§${p.csiSection}` : trimExt(p.specFilename);
  return `${subShort} × ${specShort}`;
}

function trimExt(filename: string): string {
  return filename.replace(/\.pdf$/i, "");
}
