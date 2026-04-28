"use client";

import Link from "next/link";
import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  SerializedCitation,
  SerializedMessage,
} from "@/lib/db/agents";
import { CITATION_URL_PREFIX, remarkCitations } from "@/lib/agents/remarkCitations";

/**
 * Renders one chat message. Assistant messages flow through
 * react-markdown with remark-gfm (tables, strikethrough, autolinks)
 * + a custom remark plugin that turns `[#N]` markers into synthetic
 * link nodes carrying `voltaic-citation://N` URLs. The `components.a`
 * mapping intercepts those URLs and renders inline citation chips.
 *
 * User messages render as plain text (no markdown) — the user's input
 * is what they typed, not authored markdown, so rendering `**bold**`
 * literally is the right move.
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

  const components: Components = useMemo(
    () => buildComponents(citationByIndex, props.onCitationClick),
    [citationByIndex, props.onCitationClick],
  );

  return (
    <article
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <Avatar role={props.message.role} />
      <div className="min-w-0 flex-1">
        {isUser ? (
          <div className="inline-block max-w-none whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[var(--color-paper)] px-4 py-2.5 text-[14px] leading-[1.65] text-[var(--color-ink)]">
            {props.message.content}
          </div>
        ) : (
          <div className="agent-md max-w-none text-[14px] leading-[1.65] text-[var(--color-ink)]">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkCitations]}
              components={components}
            >
              {props.message.content}
            </ReactMarkdown>
            {props.streaming && (
              <span className="ml-1 inline-block h-3 w-1.5 animate-pulse bg-[var(--color-coral)] align-middle" />
            )}
          </div>
        )}
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

function buildComponents(
  citationByIndex: Map<number, SerializedCitation>,
  onCitationClick: (c: SerializedCitation) => void,
): Components {
  return {
    a: ({ href, children, ...rest }) => {
      if (typeof href === "string" && href.startsWith(CITATION_URL_PREFIX)) {
        const n = Number(href.slice(CITATION_URL_PREFIX.length));
        const citation = citationByIndex.get(n);
        if (citation) {
          return (
            <InlineCitationChip
              citation={citation}
              onClick={() => onCitationClick(citation)}
            />
          );
        }
        // Marker we haven't bound yet (mid-stream, or hallucinated).
        return (
          <span className="mx-0.5 inline-flex items-center rounded border border-[var(--color-line)] px-1.5 py-0 align-baseline font-mono text-[10px] text-[var(--color-muted-soft)]">
            [#{n}]
          </span>
        );
      }
      const isInternal = typeof href === "string" && href.startsWith("/");
      if (isInternal) {
        // Internal app routes (e.g. the "show all in /compare" CTA the
        // agent emits for exhaustive questions) use Next's Link so
        // they navigate in-app instead of opening a new tab.
        return (
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded border border-[var(--color-coral-tint-2)] bg-[var(--color-coral-tint)] px-2 py-0.5 text-[12px] font-medium text-[var(--color-coral-dark)] no-underline hover:border-[var(--color-coral)] hover:bg-[var(--color-coral-tint-2)]"
          >
            {children}
          </Link>
        );
      }
      return (
        <a
          href={href}
          {...rest}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--color-coral-dark)] underline decoration-[var(--color-coral-tint-2)] underline-offset-2 hover:text-[var(--color-coral)]"
        >
          {children}
        </a>
      );
    },
  };
}

function InlineCitationChip(props: {
  citation: SerializedCitation;
  onClick: () => void;
}) {
  const label = formatCitationLabel(props.citation);
  const palette = paletteFor(props.citation.atom.sourceKind);
  return (
    <button
      onClick={props.onClick}
      className="mx-0.5 inline-flex items-baseline rounded border px-1.5 py-0 align-baseline font-mono text-[10.5px]"
      style={{
        borderColor: palette.border,
        background: palette.bg,
        color: palette.fg,
      }}
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
      {props.citations.map((c) => {
        const palette = paletteFor(c.atom.sourceKind);
        return (
          <button
            key={`footer-${c.index}`}
            onClick={() => props.onClick(c)}
            className="inline-flex items-center gap-1 rounded border bg-[var(--color-paper)] px-2 py-0.5 text-[10.5px] hover:border-[color:var(--color-coral)]"
            style={{ borderColor: "var(--color-line)" }}
          >
            <span
              className="font-mono font-semibold"
              style={{ color: palette.fg }}
            >
              {c.index}
            </span>
            <span className="text-[var(--color-muted-soft)]">
              {sourceLabel(c.atom.sourceKind)}
            </span>
            <span className="text-[var(--color-ink-soft)]">
              {formatCitationLabel(c)}
            </span>
          </button>
        );
      })}
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

function sourceLabel(kind: string): string {
  if (
    kind === "submittal_field" ||
    kind === "submittal_response" ||
    kind === "submittal_page"
  ) {
    return "submittal";
  }
  if (kind === "spec_paragraph") return "spec";
  return kind;
}

function paletteFor(kind: string): {
  border: string;
  bg: string;
  fg: string;
} {
  if (
    kind === "submittal_field" ||
    kind === "submittal_response" ||
    kind === "submittal_page"
  ) {
    return {
      border: "var(--color-slate-blue-tint)",
      bg: "var(--color-slate-blue-tint)",
      fg: "var(--color-slate-blue)",
    };
  }
  return {
    border: "var(--color-coral-tint-2)",
    bg: "var(--color-coral-tint)",
    fg: "var(--color-coral-dark)",
  };
}
