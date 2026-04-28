"use client";

import { useState } from "react";
import type { SerializedAgent, SerializedSession } from "@/lib/db/agents";

/**
 * The two-tier left rail: agents list on top, conversations under the
 * selected agent on the bottom. Sessions are scoped to (agent, project)
 * — switching agents replaces the conversations list. The seeded
 * Compliance Reviewer is locked from delete (server-side); we hint at
 * that by hiding the trash control on `is_default = true`.
 */
export function AgentRail(props: {
  agents: SerializedAgent[];
  sessions: SerializedSession[];
  selectedAgentId: string | null;
  selectedSessionId: string | null;
  onSelectAgent: (id: string) => void;
  onSelectSession: (id: string) => void;
  onNewAgent: () => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-cream-deep)]">
      <SectionHeader
        label={`Agents · ${props.agents.length}`}
        actionLabel="+ New"
        onAction={props.onNewAgent}
      />
      <div className="scrollbar-thin max-h-72 overflow-y-auto px-2 pb-2">
        {props.agents.map((a) => (
          <AgentRow
            key={a.id}
            agent={a}
            active={a.id === props.selectedAgentId}
            onClick={() => props.onSelectAgent(a.id)}
          />
        ))}
        {props.agents.length === 0 && (
          <div className="px-3 py-8 text-center text-[12px] text-[var(--color-muted-soft)]">
            No agents yet
          </div>
        )}
      </div>

      <SectionHeader
        label="Conversations"
        actionLabel="+ New chat"
        onAction={props.onNewSession}
      />
      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
        {props.sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            active={s.id === props.selectedSessionId}
            onClick={() => props.onSelectSession(s.id)}
            onDelete={() => props.onDeleteSession(s.id)}
          />
        ))}
        {props.sessions.length === 0 && props.selectedAgentId && (
          <div className="px-3 py-8 text-center text-[12px] text-[var(--color-muted-soft)]">
            No conversations yet. Start one with the composer below.
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionHeader(props: {
  label: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--color-line-soft)] px-4 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
        {props.label}
      </div>
      <button
        onClick={props.onAction}
        className="text-[11px] font-medium text-[var(--color-coral-dark)] hover:text-[var(--color-coral)]"
      >
        {props.actionLabel}
      </button>
    </div>
  );
}

function AgentRow(props: {
  agent: SerializedAgent;
  active: boolean;
  onClick: () => void;
}) {
  const initials = props.agent.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <button
      onClick={props.onClick}
      className={`group mt-1 flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
        props.active
          ? "border-[var(--color-coral-tint-2)] bg-[var(--color-coral-tint)]"
          : "border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-paper)]"
      }`}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold"
        style={{
          background: props.active
            ? "var(--color-coral-tint-2)"
            : "var(--color-line-soft)",
          color: props.active
            ? "var(--color-coral-dark)"
            : "var(--color-muted)",
        }}
      >
        {initials || "AG"}
      </span>
      <div className="flex-1 overflow-hidden">
        <div className="truncate text-[13px] font-medium text-[var(--color-ink)]">
          {props.agent.name}
        </div>
        {props.agent.description && (
          <div className="truncate text-[11px] text-[var(--color-muted)]">
            {props.agent.description}
          </div>
        )}
      </div>
      {props.agent.isDefault && (
        <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-muted-soft)]">
          default
        </span>
      )}
    </button>
  );
}

function SessionRow(props: {
  session: SerializedSession;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const title = props.session.title ?? "(untitled)";
  const sub = formatRelative(props.session.lastMessageAt, props.session.messageCount);
  return (
    <div
      className="group relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        onClick={props.onClick}
        className={`mt-0.5 flex w-full flex-col items-start rounded-md border px-3 py-2 text-left transition ${
          props.active
            ? "border-[var(--color-line-strong)] bg-[var(--color-paper)]"
            : "border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-paper)]"
        }`}
      >
        <span className="line-clamp-1 text-[12.5px] font-medium text-[var(--color-ink)]">
          {title}
        </span>
        <span className="mt-0.5 text-[10.5px] text-[var(--color-muted)]">
          {sub}
        </span>
      </button>
      {hover && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm("Delete this conversation?")) props.onDelete();
          }}
          className="absolute right-2 top-1.5 rounded p-1 text-[var(--color-muted-soft)] hover:bg-[var(--color-clay-tint)] hover:text-[var(--color-clay)]"
          title="Delete conversation"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

function formatRelative(iso: string, msgCount: number): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);
  const m = msgCount === 1 ? "1 msg" : `${msgCount} msgs`;
  let when: string;
  if (diffMin < 1) when = "now";
  else if (diffMin < 60) when = `${diffMin}m ago`;
  else if (diffHr < 24) when = `${diffHr}h ago`;
  else if (diffDay < 7) when = `${diffDay}d ago`;
  else when = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${when} · ${m}`;
}
