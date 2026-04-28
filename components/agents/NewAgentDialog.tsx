"use client";

import { useEffect, useState } from "react";
import type { SourceFilters } from "@/lib/db/agents";

const STARTER_PROMPT = `You are a helpful assistant for an electrical project manager. You have access to the project's specifications and submittals through retrieval. When you reference a fact from the corpus, cite it inline using [#N] markers (where N is the number from the <context> block in the user message). Never invent values that are not in the retrieved passages — if the corpus is silent on a question, say so.`;

export function NewAgentDialog(props: {
  onClose: () => void;
  onCreate: (input: {
    name: string;
    description: string | null;
    systemPrompt: string;
    customPrompt: string | null;
    model: string;
    temperature: number;
    sourceFilters: SourceFilters;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(STARTER_PROMPT);
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [temperature, setTemperature] = useState(0.2);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!systemPrompt.trim()) {
      setError("System prompt is required");
      return;
    }
    setSubmitting(true);
    try {
      await props.onCreate({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        systemPrompt: systemPrompt.trim(),
        customPrompt: null,
        model,
        temperature,
        sourceFilters: { specs: true, submittals: true },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "create_failed");
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-[rgba(20,18,15,0.30)]"
        onClick={props.onClose}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] shadow-2xl">
        <header className="flex items-center justify-between border-b border-[var(--color-line)] px-5 py-3">
          <div>
            <div className="text-[15px] font-medium text-[var(--color-ink)]">
              New agent
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              Configure a chat preset scoped to this workspace.
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

        <div className="scrollbar-thin max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className="text-[11px] font-medium text-[var(--color-ink-soft)]">
              Name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Schedule Risk Reviewer"
              className="form-input mt-1"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-[var(--color-ink-soft)]">
              Description
              <span className="ml-1 font-mono text-[9.5px] text-[var(--color-muted-soft)]">
                optional
              </span>
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              placeholder="One line about what this agent does"
              className="form-input mt-1"
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label className="text-[11px] font-medium text-[var(--color-ink-soft)]">
                System prompt
              </label>
              <span className="font-mono text-[10px] text-[var(--color-muted-soft)]">
                {systemPrompt.length} / 8000
              </span>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              maxLength={8000}
              rows={10}
              className="form-input scrollbar-thin mt-1 font-mono text-[12px] leading-[1.55]"
            />
            <div className="mt-1 text-[10.5px] text-[var(--color-muted)]">
              Defines the agent&apos;s behavior. Tell it how to answer, how to
              cite (use <span className="font-mono">[#N]</span>), and what to
              refuse.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium text-[var(--color-ink-soft)]">
                Model
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="form-input mt-1"
              >
                <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                <option value="claude-haiku-4-5">Haiku 4.5</option>
                <option value="claude-opus-4-7">Opus 4.7</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-medium text-[var(--color-ink-soft)]">
                Temperature · {temperature.toFixed(2)}
              </label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={temperature}
                onChange={(e) => setTemperature(Number(e.target.value))}
                className="mt-3 w-full accent-[var(--color-coral)]"
              />
            </div>
          </div>

          {error && (
            <div className="text-[12px] text-[var(--color-clay)]">{error}</div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--color-line)] px-5 py-3">
          <button
            onClick={props.onClose}
            className="rounded border border-[var(--color-line)] bg-[var(--color-cream)] px-3 py-1.5 text-[12px] text-[var(--color-ink-soft)] hover:border-[var(--color-line-strong)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || !name.trim() || !systemPrompt.trim()}
            className="rounded bg-[var(--color-ink)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-cream)] disabled:opacity-40"
          >
            {submitting ? "Creating…" : "Create agent"}
          </button>
        </footer>
      </div>
    </>
  );
}
