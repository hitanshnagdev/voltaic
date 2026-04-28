"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SerializedAgent,
  SerializedCitation,
  SerializedMessage,
  SerializedSession,
} from "@/lib/db/agents";
import { MessageBubble } from "./MessageBubble";

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
  const isStreaming = props.streaming !== null;

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

  const submit = async () => {
    const text = draft.trim();
    if (!text || isStreaming) return;
    setDraft("");
    await props.onSend(text);
    // Refocus the composer for the next turn.
    composerRef.current?.focus();
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="scrollbar-thin flex-1 overflow-y-auto"
      >
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          {props.messages.length === 0 && !props.streaming && (
            <EmptyChatState agent={props.agent} />
          )}
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
              disabled={isStreaming || props.loading}
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
                onClick={submit}
                disabled={!draft.trim() || props.loading}
                className="self-end rounded bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-cream)] disabled:opacity-40"
              >
                Send
              </button>
            )}
          </div>
          <div className="mt-2 px-1 text-[10.5px] text-[var(--color-muted-soft)]">
            <span className="font-mono">↵</span> Send ·{" "}
            <span className="font-mono">⇧↵</span> newline · Citations on ·{" "}
            {props.agent.model} · temp {props.agent.temperature.toFixed(2)} ·{" "}
            <span className="italic">
              AI-flagged — engineer verifies before action
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyChatState({ agent }: { agent: SerializedAgent }) {
  return (
    <div className="paper mx-auto max-w-xl p-8 text-center">
      <h2 className="text-[15px] font-medium text-[var(--color-ink)]">
        Start a conversation with {agent.name}
      </h2>
      {agent.description && (
        <p className="mt-1 text-[12px] text-[var(--color-muted)]">
          {agent.description}
        </p>
      )}
      <p className="mt-4 text-[12px] text-[var(--color-muted)]">
        The agent has access to your project&apos;s spec library. Every claim is
        cited back to the source paragraph and page.
      </p>
    </div>
  );
}
