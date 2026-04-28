"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import type {
  SerializedAgent,
  SerializedCitation,
  SerializedMessage,
  SerializedSession,
} from "@/lib/db/agents";
import { MessageBubble } from "./MessageBubble";

const SUGGESTED_PROMPTS = [
  "Does the latest submittal meet the spec's AIC requirement?",
  "Compare AIC and SCCR across all panels.",
  "Which spec items are flagged as non-compliant?",
];

export function ChatThread(props: {
  agent: SerializedAgent;
  session: SerializedSession | null;
  messages: SerializedMessage[];
  streaming: { content: string; citations: SerializedCitation[] } | null;
  streamError: string | null;
  loading: boolean;
  onSend: (text: string) => Promise<void>;
  onCancel: () => void;
  onCitationClick: (citation: SerializedCitation) => void;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { user } = useUser();
  const firstName = user?.firstName?.trim() || null;
  const isStreaming = props.streaming !== null;
  const isEmpty = props.messages.length === 0 && !props.streaming;

  // Auto-scroll on new content. Anchor at bottom; only re-anchor if
  // the user is already near the bottom (don't yank them mid-read).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [props.messages, props.streaming]);

  const submit = async (text?: string) => {
    const value = (text ?? draft).trim();
    if (!value || isStreaming) return;
    setDraft("");
    await props.onSend(value);
    composerRef.current?.focus();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const composerDisabled = isStreaming || props.loading;

  // Empty state: composer centered, greeting + suggestion chips above.
  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-6 py-8">
        <div className="w-full max-w-2xl">
          <div className="mb-6 text-center">
            <h1 className="serif-display text-[32px] tracking-tight text-[var(--color-ink)]">
              {firstName ? `Hi ${firstName},` : "Welcome,"}
            </h1>
            <p className="mt-2 text-[14px] text-[var(--color-muted)]">
              What do you need from{" "}
              <span className="font-medium text-[var(--color-ink-soft)]">
                {props.agent.name}
              </span>{" "}
              today?
            </p>
          </div>

          <div className="paper flex items-end gap-2 px-3 py-3">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={3}
              autoFocus
              placeholder={`Ask ${props.agent.name}…  e.g. "Does the MDP-A submittal meet §2.2.B?"`}
              className="scrollbar-thin flex-1 resize-none bg-transparent py-1.5 text-[15px] outline-none placeholder:text-[var(--color-muted-soft)]"
              disabled={composerDisabled}
            />
            {isStreaming ? (
              <button
                onClick={props.onCancel}
                className="self-end rounded border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-muted)] hover:border-[var(--color-clay)] hover:text-[var(--color-clay)]"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => void submit()}
                disabled={!draft.trim() || props.loading}
                className="self-end rounded bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-cream)] disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGGESTED_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => void submit(p)}
                disabled={composerDisabled}
                className="rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-1.5 text-[12px] text-[var(--color-ink-soft)] transition hover:border-[var(--color-coral-tint-2)] hover:bg-[var(--color-coral-tint)] hover:text-[var(--color-coral-dark)] disabled:opacity-40"
              >
                {p}
              </button>
            ))}
          </div>

          <ComposerHelper agent={props.agent} />
        </div>
      </div>
    );
  }

  // Active state: thread above, composer pinned to bottom.
  return (
    <>
      <div ref={scrollRef} className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          {props.messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              onCitationClick={props.onCitationClick}
            />
          ))}
          {props.streaming && (
            <MessageBubble
              message={{
                id: "streaming",
                sessionId: props.session?.id ?? "",
                role: "assistant",
                content: props.streaming.content,
                citations: props.streaming.citations,
                createdAt: new Date().toISOString(),
              }}
              streaming
              onCitationClick={props.onCitationClick}
            />
          )}
          {props.streamError && (
            <div
              className="paper border-l-4 px-4 py-3 text-[12px]"
              style={{ borderColor: "var(--color-clay)" }}
            >
              <div className="font-mono text-[var(--color-clay)]">
                Stream error
              </div>
              <div className="mt-1 break-words text-[var(--color-ink-soft)]">
                {props.streamError}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--color-line)] bg-[var(--color-cream)] px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="paper flex items-end gap-2 px-3 py-2">
            <textarea
              ref={composerRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              rows={2}
              placeholder={`Ask ${props.agent.name}…  e.g. "Does the MDP-A submittal meet §2.2.B?"`}
              className="scrollbar-thin flex-1 resize-none bg-transparent py-1 text-[14px] outline-none placeholder:text-[var(--color-muted-soft)]"
              disabled={composerDisabled}
            />
            {isStreaming ? (
              <button
                onClick={props.onCancel}
                className="self-end rounded border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-muted)] hover:border-[var(--color-clay)] hover:text-[var(--color-clay)]"
              >
                Stop
              </button>
            ) : (
              <button
                onClick={() => void submit()}
                disabled={!draft.trim() || props.loading}
                className="self-end rounded bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-cream)] disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
          <ComposerHelper agent={props.agent} />
        </div>
      </div>
    </>
  );
}

function ComposerHelper({ agent }: { agent: SerializedAgent }) {
  return (
    <div className="mt-2 px-1 text-center text-[10.5px] text-[var(--color-muted-soft)]">
      <span className="font-mono">↵</span> Send ·{" "}
      <span className="font-mono">⇧↵</span> newline · Citations on ·{" "}
      {agent.model} · temp {agent.temperature.toFixed(2)} ·{" "}
      <span className="italic">
        AI-flagged — engineer verifies before action
      </span>
    </div>
  );
}
