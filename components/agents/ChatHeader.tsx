"use client";

import type { SerializedAgent, SerializedSession } from "@/lib/db/agents";
import type { SessionCost } from "./AgentsClient";

export function ChatHeader(props: {
  agent: SerializedAgent;
  session: SerializedSession | null;
  cost: SessionCost | null;
  configureOpen: boolean;
  onToggleConfigure: () => void;
  projectName: string;
}) {
  const title = props.session?.title ?? "New conversation";
  return (
    <header className="flex items-start justify-between gap-4 border-b border-[var(--color-line)] px-6 py-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[18px] font-medium tracking-tight text-[var(--color-ink)]">
          {title}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-muted)]">
          <span
            className="rounded px-1.5 py-0.5 font-mono"
            style={{
              background: "var(--color-coral-tint)",
              color: "var(--color-coral-dark)",
            }}
          >
            {props.agent.name}
          </span>
          <span>·</span>
          <span className="truncate">Project: {props.projectName}</span>
          {props.cost && props.cost.callCount > 0 && (
            <>
              <span>·</span>
              <CostChip cost={props.cost} />
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={props.onToggleConfigure}
          className={`rounded border px-3 py-1.5 text-[12px] font-medium transition ${
            props.configureOpen
              ? "border-[var(--color-coral-tint-2)] bg-[var(--color-coral-tint)] text-[var(--color-coral-dark)]"
              : "border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
          }`}
        >
          Configure
        </button>
      </div>
    </header>
  );
}

function CostChip({ cost }: { cost: SessionCost }) {
  const display =
    cost.costUsd < 0.01
      ? `$${cost.costUsd.toFixed(4)}`
      : `$${cost.costUsd.toFixed(3)}`;
  return (
    <span className="font-mono">
      <span className="font-medium text-[var(--color-ink-soft)]">{display}</span>{" "}
      <span className="text-[var(--color-muted-soft)]">
        / {cost.callCount} {cost.callCount === 1 ? "call" : "calls"}
      </span>
    </span>
  );
}
