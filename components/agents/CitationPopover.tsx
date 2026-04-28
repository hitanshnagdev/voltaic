"use client";

import { useEffect } from "react";
import type { SerializedCitation } from "@/lib/db/agents";

/**
 * Citation context popover. Bottom sheet that opens when a chip is
 * clicked. Shows the cited spec passage on the left; the right pane
 * is reserved for the side-by-side submittal value once submittal
 * retrieval is wired (currently shows the document name + a link
 * to the docs page where the user can find the source PDF).
 *
 * Closes on Escape, click outside, or the X button.
 */
export function CitationPopover(props: {
  citation: SerializedCitation;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const c = props.citation;
  const docName = c.atom.documentName ?? "source document";
  const csiHeader = c.atom.csiPath || c.atom.csiSection || docName;
  const pageBadge = c.atom.pageNum != null ? `p.${c.atom.pageNum}` : null;

  return (
    <>
      <div
        className="fixed inset-0 z-30 bg-[rgba(20,18,15,0.20)]"
        onClick={props.onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-40 max-h-[60vh] border-t border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl">
        <div className="border-b border-[var(--color-line-soft)] px-6 py-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Citation context · cited passage
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/docs?focus=${c.atom.documentId}`}
                className="rounded border border-[var(--color-line)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
              >
                Open document
              </a>
              <button
                onClick={props.onClose}
                className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)]"
                aria-label="Close"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="grid h-full grid-cols-2 divide-x divide-[var(--color-line-soft)] overflow-hidden">
          <SourcePane
            kind="SPEC"
            header={csiHeader}
            badge={pageBadge}
            documentName={docName}
            snippet={c.atom.snippet}
          />
          <RelatedPane atomKind={c.atom.sourceKind} documentName={docName} />
        </div>
      </div>
    </>
  );
}

function SourcePane(props: {
  kind: string;
  header: string;
  badge: string | null;
  documentName: string;
  snippet: string;
}) {
  return (
    <div className="scrollbar-thin overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
          {props.kind}
        </div>
        {props.badge && (
          <div className="font-mono text-[11px] text-[var(--color-muted)]">
            {props.badge}
          </div>
        )}
      </div>
      <div className="mt-2 font-mono text-[12px] text-[var(--color-ink-soft)]">
        {props.header}
      </div>
      <div className="mt-1 truncate text-[11px] text-[var(--color-muted-soft)]">
        {props.documentName}
      </div>
      <div
        className="mt-4 rounded border-l-4 px-4 py-3 text-[13px] leading-[1.65] text-[var(--color-ink)]"
        style={{
          borderColor: "var(--color-coral)",
          background: "var(--color-coral-tint)",
        }}
      >
        {props.snippet || "(snippet unavailable)"}
      </div>
    </div>
  );
}

function RelatedPane(props: { atomKind: string; documentName: string }) {
  return (
    <div className="scrollbar-thin overflow-y-auto bg-[var(--color-cream-deep)] px-6 py-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Related submittal value
      </div>
      <div className="mt-4 rounded border border-dashed border-[var(--color-line-strong)] px-4 py-6 text-center text-[12px] text-[var(--color-muted)]">
        Side-by-side submittal value will appear here once submittal-side
        retrieval lands. Today this pane is reserved for{" "}
        <span className="font-mono">{props.atomKind}</span> evidence.
      </div>
      <div className="mt-3 text-[10.5px] text-[var(--color-muted-soft)]">
        Source document:{" "}
        <span className="font-mono text-[var(--color-ink-soft)]">
          {props.documentName}
        </span>
      </div>
    </div>
  );
}
