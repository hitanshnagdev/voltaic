"use client";

import { useMemo } from "react";
import type {
  SerializedCitation,
  SerializedMessage,
} from "@/lib/db/agents";

const MARKER_RE = /\[#(\d+)\]/g;

/**
 * Renders one chat message. Assistant messages get inline citation
 * chip parsing — `[#N]` markers in the text are replaced with
 * <CitationChip> elements that open the citation popover. Indices
 * not in the message's `citations` array are left as plain text
 * (the marker still reads naturally if the chip is missing).
 */
export function MessageBubble(props: {
  message: SerializedMessage;
  streaming?: boolean;
  onCitationClick: (c: SerializedCitation) => void;
}) {
  const isUser = props.message.role === "user";

  const citationByIndex = useMemo(() => {
    const map = new Map<number, SerializedCitation>();
    for (const c of props.message.citations) {
      map.set(c.index, c);
    }
    return map;
  }, [props.message.citations]);

  const renderedContent = useMemo(
    () => renderWithCitations(props.message.content, citationByIndex, props.onCitationClick),
    [props.message.content, citationByIndex, props.onCitationClick],
  );

  return (
    <article
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <Avatar role={props.message.role} />
      <div className="min-w-0 flex-1">
        <div
          className={`max-w-none whitespace-pre-wrap text-[14px] leading-[1.65] text-[var(--color-ink)] ${
            isUser
              ? "rounded-2xl rounded-tr-sm bg-[var(--color-paper)] px-4 py-2.5 inline-block"
              : ""
          }`}
        >
          {renderedContent}
          {props.streaming && (
            <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[var(--color-coral)] align-middle" />
          )}
        </div>
        {!isUser && props.message.citations.length > 0 && !props.streaming && (
          <CitationFooter
            citations={props.message.citations}
            onClick={props.onCitationClick}
          />
        )}
      </div>
    </article>
  );
}

function Avatar({ role }: { role: "user" | "assistant" }) {
  if (role === "user") {
    return (
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--color-line)] bg-[var(--color-paper)] text-[10px] font-semibold text-[var(--color-muted)]">
        You
      </div>
    );
  }
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
      style={{
        background: "var(--color-coral-tint)",
        color: "var(--color-coral-dark)",
      }}
    >
      AI
    </div>
  );
}

function renderWithCitations(
  text: string,
  citationByIndex: Map<number, SerializedCitation>,
  onClick: (c: SerializedCitation) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of text.matchAll(MARKER_RE)) {
    const matchStart = match.index ?? 0;
    if (matchStart > lastIndex) {
      parts.push(text.slice(lastIndex, matchStart));
    }
    const n = Number(match[1]);
    const citation = citationByIndex.get(n);
    if (citation) {
      parts.push(
        <InlineCitationChip
          key={`cit-${key++}`}
          citation={citation}
          onClick={() => onClick(citation)}
        />,
      );
    } else {
      // Stream might not have delivered the citations event yet — show
      // a numeric pill that becomes a clickable chip once metadata
      // arrives. Looks the same shape, no flash.
      parts.push(
        <span
          key={`pending-${key++}`}
          className="mx-0.5 inline-flex items-center rounded border border-[var(--color-line)] px-1.5 py-0 align-baseline font-mono text-[10px] text-[var(--color-muted-soft)]"
        >
          [#{n}]
        </span>,
      );
    }
    lastIndex = matchStart + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function InlineCitationChip(props: {
  citation: SerializedCitation;
  onClick: () => void;
}) {
  const label = formatCitationLabel(props.citation);
  return (
    <button
      onClick={props.onClick}
      className="mx-0.5 inline-flex items-baseline rounded border border-[var(--color-coral-tint-2)] bg-[var(--color-coral-tint)] px-1.5 py-0 align-baseline font-mono text-[10.5px] text-[var(--color-coral-dark)] hover:border-[var(--color-coral)] hover:text-[var(--color-coral)]"
      title={`${label} — click to view source`}
    >
      <span className="font-semibold">{props.citation.index}</span>
      <span className="ml-1">{label}</span>
    </button>
  );
}

function CitationFooter(props: {
  citations: SerializedCitation[];
  onClick: (c: SerializedCitation) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="text-[9.5px] font-mono uppercase tracking-wider text-[var(--color-muted-soft)]">
        Sources
      </span>
      {props.citations.map((c) => (
        <button
          key={`footer-${c.index}`}
          onClick={() => props.onClick(c)}
          className="inline-flex items-center gap-1 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-2 py-0.5 text-[10.5px] hover:border-[var(--color-coral-tint-2)] hover:bg-[var(--color-coral-tint)]"
        >
          <span className="font-mono font-semibold text-[var(--color-coral-dark)]">
            {c.index}
          </span>
          <span className="text-[var(--color-ink-soft)]">
            {formatCitationLabel(c)}
          </span>
        </button>
      ))}
    </div>
  );
}

function formatCitationLabel(c: SerializedCitation): string {
  const parts: string[] = [];
  if (c.atom.csiPath) parts.push(c.atom.csiPath);
  else if (c.atom.documentName) parts.push(c.atom.documentName);
  if (c.atom.pageNum != null) parts.push(`p.${c.atom.pageNum}`);
  return parts.join(" ");
}
