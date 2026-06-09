"use client";

import { useEffect, useState } from "react";

/**
 * Standing-Workflow toggles — plain-English automations. Reads/writes
 * /api/settings. Each toggle is checked at the end of the relevant Inngest
 * function; off by default so cost stays controlled and nothing surprises.
 */
export function WorkflowToggles() {
  const [autoRfi, setAutoRfi] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: { settings?: { autoRfiOnContradiction?: boolean } }) =>
        setAutoRfi(!!d.settings?.autoRfiOnContradiction),
      )
      .catch(() => setAutoRfi(false));
  }, []);

  async function toggle() {
    if (autoRfi === null || saving) return;
    const next = !autoRfi;
    setAutoRfi(next);
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ autoRfiOnContradiction: next }),
      });
    } catch {
      setAutoRfi(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="paper p-5">
      <div className="mb-3 text-sm font-medium text-[var(--color-ink)]">
        Standing workflows
      </div>
      <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3.5 py-3">
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-[var(--color-ink)]">
            When a meeting contradicts the spec, auto-draft the RFI
          </div>
          <div className="text-[11px] text-[var(--color-muted-soft)]">
            Voltaic drafts it the moment a transcript is processed — you review
            and send.
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={autoRfi === null || saving}
          aria-pressed={autoRfi ?? false}
          className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
            autoRfi ? "bg-[var(--color-coral)]" : "bg-[var(--color-line-strong)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              autoRfi ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-muted-soft)]">
        More workflows (auto compliance reports, recap emails) coming soon.
      </p>
    </div>
  );
}
