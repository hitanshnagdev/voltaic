"use client";

import { useEffect } from "react";
import type { SerializedCitation } from "@/lib/db/agents";

/**
 * Citation context popover. Bottom sheet that opens when a chip is
 * clicked. Two-pane layout:
 *   - Left:  the cited evidence (spec passage OR submittal value)
 *   - Right: source document context + a link to open the file
 *
 * Both panes are kind-aware (spec gets the coral palette, submittal
 * gets the slate-blue palette) so the user can tell at a glance
 * what they're looking at.
 *
 * Rendering the actual PDF bytes with span highlighting is deferred
 * (U13 Phase C).
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
  const kind = sourceKindMeta(c.atom.sourceKind);
  const docName = c.atom.documentName ?? "source document";
  const headerLine = headerFor(c);
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
            <div className="flex items-center gap-3">
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: kind.tint, color: kind.fg }}
              >
                {kind.label}
              </span>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                Cited evidence · #{c.index}
              </div>
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

        <div className="grid h-full grid-cols-[1.4fr_1fr] divide-x divide-[var(--color-line-soft)] overflow-hidden">
          <EvidencePane
            kind={kind}
            header={headerLine}
            badge={pageBadge}
            documentName={docName}
            snippet={c.atom.snippet}
          />
          <DocumentPane
            documentId={c.atom.documentId}
            documentName={docName}
            sourceKindLabel={kind.label}
          />
        </div>
      </div>
    </>
  );
}

function EvidencePane(props: {
  kind: ReturnType<typeof sourceKindMeta>;
  header: string;
  badge: string | null;
  documentName: string;
  snippet: string;
}) {
  return (
    <div className="scrollbar-thin overflow-y-auto px-6 py-5">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[12px] text-[var(--color-ink-soft)]">
          {props.header || "(no header)"}
        </div>
        {props.badge && (
          <div className="font-mono text-[11px] text-[var(--color-muted)]">
            {props.badge}
          </div>
        )}
      </div>
      <div className="mt-1 truncate text-[11px] text-[var(--color-muted-soft)]">
        {props.documentName}
      </div>
      <div
        className="mt-4 rounded border-l-4 px-4 py-3 text-[13px] leading-[1.65] text-[var(--color-ink)]"
        style={{
          borderColor: props.kind.fg,
          background: props.kind.tint,
        }}
      >
        {props.snippet || "(snippet unavailable)"}
      </div>
    </div>
  );
}

function DocumentPane(props: {
  documentId: string;
  documentName: string;
  sourceKindLabel: string;
}) {
  return (
    <div className="scrollbar-thin overflow-y-auto bg-[var(--color-cream-deep)] px-6 py-5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        Source document
      </div>
      <div className="mt-2 text-[13px] font-medium text-[var(--color-ink)]">
        {props.documentName}
      </div>
      <div className="mt-1 text-[11px] text-[var(--color-muted)]">
        {props.sourceKindLabel} evidence
      </div>
      <div className="mt-4 rounded border border-dashed border-[var(--color-line-strong)] px-4 py-5 text-[12px] text-[var(--color-muted)]">
        Inline PDF rendering with span highlighting is on the roadmap. For
        now, open the document to see the cited bytes in context.
      </div>
      <div className="mt-3">
        <a
          href={`/docs?focus=${props.documentId}`}
          className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-coral-dark)] hover:text-[var(--color-coral)]"
        >
          Open in Documents →
        </a>
      </div>
    </div>
  );
}

function sourceKindMeta(kind: string): {
  label: string;
  fg: string;
  tint: string;
} {
  if (kind === "submittal_field" || kind === "submittal_response") {
    return {
      label: "submittal",
      fg: "var(--color-slate-blue)",
      tint: "var(--color-slate-blue-tint)",
    };
  }
  if (kind === "spec_paragraph") {
    return {
      label: "spec",
      fg: "var(--color-coral-dark)",
      tint: "var(--color-coral-tint)",
    };
  }
  return {
    label: kind,
    fg: "var(--color-muted)",
    tint: "var(--color-cream-deep)",
  };
}

function headerFor(c: SerializedCitation): string {
  if (c.atom.csiPath) return c.atom.csiPath;
  if (c.atom.csiSection) return c.atom.csiSection;
  return c.atom.documentName ?? "";
}
