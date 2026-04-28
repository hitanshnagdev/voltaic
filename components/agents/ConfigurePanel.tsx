"use client";

import { useState } from "react";
import type { SerializedAgent, SourceFilters } from "@/lib/db/agents";
import {
  RETRIEVAL_LIMIT_MAX,
  RETRIEVAL_LIMIT_MIN,
} from "@/lib/agents/limits";
import { estimateChatTurnCostUsd } from "@/lib/llm/pricing";

const MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 (recommended)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (faster, cheaper)" },
  { id: "claude-opus-4-7", label: "Opus 4.7 (slowest, smartest)" },
];

/**
 * Right-rail config drawer. PATCHes the agent on Save; refuses
 * delete on the seeded default (the API also enforces). Edits to
 * the system prompt take effect on the next turn — past responses
 * already streamed are unchanged.
 */
export function ConfigurePanel(props: {
  agent: SerializedAgent;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: Partial<{
      name: string;
      description: string | null;
      systemPrompt: string;
      customPrompt: string | null;
      model: string;
      temperature: number;
      sourceFilters: SourceFilters;
      retrievalLimit: number;
    }>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(props.agent.name);
  const [description, setDescription] = useState(props.agent.description ?? "");
  const [systemPrompt, setSystemPrompt] = useState(props.agent.systemPrompt);
  const [customPrompt, setCustomPrompt] = useState(props.agent.customPrompt ?? "");
  const [model, setModel] = useState(props.agent.model);
  const [temperature, setTemperature] = useState(props.agent.temperature);
  const [filters, setFilters] = useState<SourceFilters>(props.agent.sourceFilters);
  const [retrievalLimit, setRetrievalLimit] = useState(
    props.agent.retrievalLimit,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state resets when the parent passes `key={agent.id}` — the
  // component remounts and useState re-initializes from props. No
  // effect-driven reset (which React 19 lints against).

  const dirty =
    name !== props.agent.name ||
    description !== (props.agent.description ?? "") ||
    systemPrompt !== props.agent.systemPrompt ||
    customPrompt !== (props.agent.customPrompt ?? "") ||
    model !== props.agent.model ||
    temperature !== props.agent.temperature ||
    filters.specs !== props.agent.sourceFilters.specs ||
    filters.submittals !== props.agent.sourceFilters.submittals ||
    retrievalLimit !== props.agent.retrievalLimit;

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await props.onUpdate(props.agent.id, {
        name,
        description: description.trim() ? description.trim() : null,
        systemPrompt,
        customPrompt: customPrompt.trim() ? customPrompt.trim() : null,
        model,
        temperature,
        sourceFilters: filters,
        retrievalLimit,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "save_failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirm(`Delete "${props.agent.name}"? This cannot be undone.`))
      return;
    try {
      await props.onDelete(props.agent.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "delete_failed");
    }
  };

  return (
    <aside className="flex w-96 shrink-0 flex-col border-l border-[var(--color-line)] bg-[var(--color-paper)]">
      <header className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Agent configuration
          </div>
          <div className="mt-0.5 text-[14px] font-medium text-[var(--color-ink)]">
            {props.agent.name}
          </div>
        </div>
        <button
          onClick={props.onClose}
          className="rounded p-1 text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)]"
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
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <Field label="Name" maxLen={80} length={name.length}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="form-input"
          />
        </Field>

        <Field label="Description" optional maxLen={200} length={description.length}>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            placeholder="One line about what this agent does"
            className="form-input"
          />
        </Field>

        <Field label="System prompt" maxLen={8000} length={systemPrompt.length}>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            maxLength={8000}
            rows={10}
            className="form-input scrollbar-thin font-mono text-[12px] leading-[1.55]"
          />
        </Field>

        <Field
          label="Custom prompt"
          optional
          maxLen={4000}
          length={customPrompt.length}
          help="Project-specific overrides appended to the system prompt."
        >
          <textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            maxLength={4000}
            rows={4}
            className="form-input scrollbar-thin font-mono text-[12px] leading-[1.55]"
            placeholder="e.g. PM is M. Diaz; project = Riverside Medical; favor verdict-first answers."
          />
        </Field>

        <Field
          label="Sources / grounding"
          help="Limits which corpus the agent reads. Disabling both forces the agent to answer from prior chat context only."
        >
          <div className="flex flex-col gap-1.5 text-[13px]">
            <Toggle
              label="Specifications"
              checked={filters.specs}
              onChange={(v) => setFilters((f) => ({ ...f, specs: v }))}
            />
            <Toggle
              label="Submittals"
              checked={filters.submittals}
              onChange={(v) => setFilters((f) => ({ ...f, submittals: v }))}
            />
          </div>
        </Field>

        <Field label="Model">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="form-input"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Temperature · ${temperature.toFixed(2)}`} help="Lower = stricter, more verdict-style. Higher = more exploratory.">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
            className="w-full accent-[var(--color-coral)]"
          />
        </Field>

        <Field
          label={`Sources per answer · ${retrievalLimit}`}
          help="How many retrieved spec/submittal atoms the agent sees per turn. Higher = better recall on broad questions, more cost per answer."
        >
          <input
            type="range"
            min={RETRIEVAL_LIMIT_MIN}
            max={RETRIEVAL_LIMIT_MAX}
            step={1}
            value={retrievalLimit}
            onChange={(e) => setRetrievalLimit(Number(e.target.value))}
            className="w-full accent-[var(--color-coral)]"
          />
          <CostPreview model={model} retrievalLimit={retrievalLimit} />
        </Field>

        {error && (
          <div className="text-[12px] text-[var(--color-clay)]">
            {error}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-[var(--color-line)] px-5 py-3">
        {!props.agent.isDefault && (
          <button
            onClick={onDelete}
            className="text-[12px] text-[var(--color-muted)] hover:text-[var(--color-clay)]"
          >
            Delete agent
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={props.onClose}
            className="rounded border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-1.5 text-[12px] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="rounded bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-cream)] disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </footer>

    </aside>
  );
}

function Field(props: {
  label: string;
  children: React.ReactNode;
  optional?: boolean;
  maxLen?: number;
  length?: number;
  help?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="text-[11px] font-medium text-[var(--color-ink-soft)]">
          {props.label}
          {props.optional && (
            <span className="ml-1 font-mono text-[9.5px] text-[var(--color-muted-soft)]">
              optional
            </span>
          )}
        </label>
        {props.maxLen != null && props.length != null && (
          <span className="font-mono text-[10px] text-[var(--color-muted-soft)]">
            {props.length} / {props.maxLen}
          </span>
        )}
      </div>
      {props.children}
      {props.help && (
        <div className="mt-1 text-[10.5px] text-[var(--color-muted)]">
          {props.help}
        </div>
      )}
    </div>
  );
}

function CostPreview(props: { model: string; retrievalLimit: number }) {
  const cost = estimateChatTurnCostUsd(props.model, props.retrievalLimit);
  if (cost == null) return null;
  // Round to half-cent (cleaner than $0.0247).
  const rounded = Math.round(cost * 200) / 200;
  const display =
    rounded < 0.01 ? `$${cost.toFixed(4)}` : `$${rounded.toFixed(3)}`;
  const per100 = `$${(cost * 100).toFixed(2)}`;
  return (
    <div className="mt-1.5 flex items-baseline gap-3 text-[10.5px] text-[var(--color-muted)]">
      <span>
        <span className="font-medium text-[var(--color-ink-soft)]">
          {display}
        </span>{" "}
        per turn
      </span>
      <span>
        <span className="font-medium text-[var(--color-ink-soft)]">
          {per100}
        </span>{" "}
        per 100 turns
      </span>
      <span className="text-[var(--color-muted-soft)]">estimate</span>
    </div>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-2 ${
        props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => !props.disabled && props.onChange(e.target.checked)}
        disabled={props.disabled}
        className="h-3.5 w-3.5 accent-[var(--color-coral)]"
      />
      <span className="text-[var(--color-ink)]">{props.label}</span>
    </label>
  );
}
