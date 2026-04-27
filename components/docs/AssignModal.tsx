"use client";

import { useCallback, useEffect, useState } from "react";

export type SpecOption = {
  documentId: string;
  filename: string;
  csiSections: string[];
};

export type ExistingAssignment = {
  id: string;
  specDocumentId: string;
  csiSection: string | null;
  source: "manual" | "auto-suggested" | "auto-applied";
  confidence: number | null;
  specFilename: string;
  specCsiSections: string[];
};

/**
 * Modal that lists existing submittal→spec assignments for one
 * submittal and lets the user add a new one. Many-to-many: a
 * submittal can be assigned to multiple specs / multiple CSI
 * sections, so the modal supports adding without replacing.
 *
 * The available-specs list comes from the parent (already fetched
 * with /api/documents) — no extra round-trip on open.
 */
export function AssignModal({
  open,
  submittal,
  specs,
  onClose,
  onChanged,
}: {
  open: boolean;
  submittal: { id: string; filename: string } | null;
  specs: SpecOption[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [existing, setExisting] = useState<ExistingAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSpecId, setSelectedSpecId] = useState<string>("");
  const [selectedCsi, setSelectedCsi] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!submittal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/documents/${submittal.id}/assignments`);
      if (res.ok) {
        const json = await res.json();
        setExisting(json.assignments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [submittal]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    // Reset modal state on each open. open/close is the trigger, not
    // derived state, so resetting once per open is the right shape.
    setSelectedSpecId("");
    setSelectedCsi("");
    setErr(null);
    void load();
  }, [open, load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!open || !submittal) return null;

  const selectedSpec = specs.find((s) => s.documentId === selectedSpecId);

  const submit = async () => {
    if (!selectedSpecId) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          submittalDocumentId: submittal.id,
          specDocumentId: selectedSpecId,
          csiSection: selectedCsi || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `assign_failed_${res.status}`);
      }
      setSelectedSpecId("");
      setSelectedCsi("");
      await load();
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "assign_failed");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this assignment?")) return;
    const res = await fetch(`/api/assignments/${id}`, { method: "DELETE" });
    if (res.ok) {
      await load();
      onChanged();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        className="paper w-full max-w-xl space-y-4 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Assign submittal to spec
          </div>
          <div className="mt-1 truncate font-medium text-[var(--color-ink)]">
            {submittal.filename}
          </div>
          <p className="mt-1 text-[11px] text-[var(--color-muted)]">
            A submittal can answer one or more spec sections. Voltaic compares
            this submittal&apos;s extracted values against each assigned
            spec&apos;s checklist.
          </p>
        </div>

        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Current assignments
          </div>
          {loading ? (
            <div className="text-[12px] text-[var(--color-muted)]">Loading…</div>
          ) : existing.length === 0 ? (
            <div className="rounded border border-dashed border-[var(--color-line-strong)] px-3 py-2 text-[12px] text-[var(--color-muted)]">
              Not assigned yet.
            </div>
          ) : (
            <div className="space-y-1">
              {existing.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2 rounded border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-[12px]"
                >
                  <span className="flex-1 truncate text-[var(--color-ink-soft)]">
                    {a.specFilename}
                    {a.csiSection && (
                      <span className="ml-1 font-mono text-[10.5px] text-[var(--color-muted)]">
                        · §{a.csiSection}
                      </span>
                    )}
                  </span>
                  {a.source !== "manual" && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide"
                      style={{
                        background: "var(--color-gold-tint)",
                        color: "#87602B",
                      }}
                    >
                      {a.source}
                    </span>
                  )}
                  <button
                    onClick={() => remove(a.id)}
                    className="text-[var(--color-muted)] hover:text-[var(--color-clay)]"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Add an assignment
          </div>
          {specs.length === 0 ? (
            <div className="rounded border border-dashed border-[var(--color-line-strong)] px-3 py-3 text-[12px] text-[var(--color-muted)]">
              No specs in this project yet. Upload a Division-26 spec PDF
              first.
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={selectedSpecId}
                onChange={(e) => {
                  setSelectedSpecId(e.target.value);
                  setSelectedCsi("");
                }}
                className="w-full rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-[13px] focus:border-[var(--color-coral-dark)] focus:outline-none"
              >
                <option value="">Pick a spec document…</option>
                {specs.map((s) => (
                  <option key={s.documentId} value={s.documentId}>
                    {s.filename}
                  </option>
                ))}
              </select>

              {selectedSpec && selectedSpec.csiSections.length > 0 && (
                <select
                  value={selectedCsi}
                  onChange={(e) => setSelectedCsi(e.target.value)}
                  className="w-full rounded border border-[var(--color-line)] bg-white px-3 py-1.5 text-[13px] focus:border-[var(--color-coral-dark)] focus:outline-none"
                >
                  <option value="">
                    Whole spec doc (any CSI section)
                  </option>
                  {selectedSpec.csiSections.map((c) => (
                    <option key={c} value={c}>
                      §{c}
                    </option>
                  ))}
                </select>
              )}

              {err && (
                <div className="text-[11px] text-[var(--color-clay)]">
                  {err}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="rounded border border-[var(--color-line)] px-3 py-1.5 text-[12px] text-[var(--color-muted)] hover:bg-[var(--color-paper)]"
                >
                  Close
                </button>
                <button
                  onClick={submit}
                  disabled={!selectedSpecId || submitting}
                  className="btn-primary px-3 py-1.5 text-[12px] disabled:opacity-50"
                >
                  {submitting ? "Assigning…" : "Assign"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
