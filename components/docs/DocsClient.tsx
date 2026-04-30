"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssignModal, type SpecOption } from "./AssignModal";

type PairState = "unassigned" | "suggested" | "auto-paired" | "confirmed";

type DocumentRow = {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string | null;
  docType: string | null;
  status: string;
  pageCount: number | null;
  uploadedAt: string;
  /** Count of submittal_spec_assignments rows pointing at this doc (0 for specs). */
  assignmentCount: number;
  /** Strongest-signal pair state — see lib/db/assignments.ts PairState. */
  pairState: PairState;
};

type Pending = {
  tempId: string;
  filename: string;
  sizeBytes: number;
  progress: "uploading" | "error";
  error?: string;
};

type Bucket = "all" | "spec" | "submittal" | "other";

function bucketOf(docType: string | null): "spec" | "submittal" | "other" {
  // Drawing docs (and unclassified rows) live in the "Other" bucket
  // until v2's drawing parser ships.
  if (docType === "spec") return "spec";
  if (docType === "submittal") return "submittal";
  return "other";
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function StatusPill({ status }: { status: string }) {
  const label =
    status === "pending"
      ? "Queued"
      : status === "parsing"
        ? "Parsing"
        : status === "ready"
          ? "Ready"
          : status === "failed"
            ? "Failed"
            : status;
  const animated = status === "pending" || status === "parsing";
  const color =
    status === "ready"
      ? { bg: "var(--color-sage-tint)", fg: "#3a5844" }
      : status === "failed"
        ? { bg: "var(--color-clay-tint)", fg: "var(--color-clay)" }
        : { bg: "var(--color-coral-tint)", fg: "var(--color-coral-dark)" };
  return (
    <span
      className="inline-flex w-20 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ background: color.bg, color: color.fg }}
    >
      {animated && (
        <span
          className="pulse-dot h-1.5 w-1.5 rounded-full"
          style={{ background: color.fg }}
        />
      )}
      {label}
    </span>
  );
}

function PairBadge({ state }: { state: PairState }) {
  const cfg: Record<
    PairState,
    { label: string; bg: string; fg: string }
  > = {
    confirmed: {
      label: "Confirmed",
      bg: "var(--color-sage-tint)",
      fg: "#3a5844",
    },
    "auto-paired": {
      label: "Auto-paired",
      bg: "var(--color-sage-tint)",
      fg: "#3a5844",
    },
    suggested: {
      label: "Suggested",
      bg: "var(--color-gold-tint)",
      fg: "#87602B",
    },
    unassigned: {
      label: "Unassigned",
      bg: "var(--color-coral-tint)",
      fg: "var(--color-coral-dark)",
    },
  };
  const c = cfg[state];
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function BucketCard({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="paper flex flex-1 items-center justify-between px-4 py-3 text-left transition"
      style={{
        borderColor: active
          ? "var(--color-coral-tint-2)"
          : "var(--color-line)",
        background: active
          ? "var(--color-coral-tint)"
          : "var(--color-paper)",
      }}
    >
      <div>
        <div
          className="text-[10px] font-semibold uppercase tracking-[0.14em]"
          style={{
            color: active
              ? "var(--color-coral-dark)"
              : "var(--color-muted)",
          }}
        >
          {label}
        </div>
        <div
          className="mt-1 text-2xl font-semibold"
          style={{
            color: active
              ? "var(--color-coral-dark)"
              : "var(--color-ink)",
          }}
        >
          {count}
        </div>
      </div>
    </button>
  );
}

function RowMenu({
  doc,
  onReclassify,
  onDelete,
}: {
  doc: DocumentRow;
  onReclassify: (target: "spec" | "submittal" | "other") => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const currentBucket = bucketOf(doc.docType);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded px-1.5 py-0.5 text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)] hover:text-[var(--color-ink-soft)]"
        title="More actions"
      >
        ⋯
      </button>
      {open && (
        <div
          className="paper absolute right-0 top-full z-20 mt-1 w-44 py-1 text-[12px] shadow-md"
          style={{ borderColor: "var(--color-line)" }}
        >
          <div className="px-3 pb-1 pt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Move to bucket
          </div>
          {(["spec", "submittal", "other"] as const).map((target) => (
            <button
              key={target}
              disabled={target === currentBucket}
              onClick={() => {
                setOpen(false);
                onReclassify(target);
              }}
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[var(--color-ink-soft)] hover:bg-[var(--color-cream-deep)] disabled:cursor-default disabled:text-[var(--color-muted-soft)] disabled:hover:bg-transparent"
            >
              <span className="capitalize">
                {target === "spec"
                  ? "Specs"
                  : target === "submittal"
                    ? "Submittals"
                    : "Other"}
              </span>
              {target === currentBucket && (
                <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--color-muted-soft)]">
                  current
                </span>
              )}
            </button>
          ))}
          <div className="my-1 border-t border-[var(--color-line-soft)]" />
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="block w-full px-3 py-1.5 text-left text-[var(--color-clay)] hover:bg-[var(--color-clay-tint)]"
          >
            Delete document
          </button>
        </div>
      )}
    </div>
  );
}

export function DocsClient() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [specs, setSpecs] = useState<SpecOption[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [bucket, setBucket] = useState<Bucket>("all");
  const [assignTarget, setAssignTarget] = useState<DocumentRow | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const json = await res.json();
      setDocs(json.documents ?? []);
      setSpecs(json.specs ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // Initial fetch on mount. Intentional one-shot; not a render-feedback loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  // Poll while any doc is still being ingested so status updates live.
  useEffect(() => {
    const anyInFlight = docs.some(
      (d) => d.status === "pending" || d.status === "parsing",
    );
    if (!anyInFlight) return;
    const id = setInterval(() => {
      refresh();
    }, 2000);
    return () => clearInterval(id);
  }, [docs, refresh]);

  const bucketCounts = useMemo(() => {
    const counts = { spec: 0, submittal: 0, other: 0 };
    for (const d of docs) counts[bucketOf(d.docType)]++;
    return counts;
  }, [docs]);

  const visibleDocs = useMemo(
    () =>
      bucket === "all"
        ? docs
        : docs.filter((d) => bucketOf(d.docType) === bucket),
    [docs, bucket],
  );

  const uploadFile = useCallback(
    async (file: File) => {
      const tempId = `${file.name}-${file.size}-${Date.now()}`;
      setPending((p) => [
        ...p,
        {
          tempId,
          filename: file.name,
          sizeBytes: file.size,
          progress: "uploading",
        },
      ]);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          throw new Error(json.error ?? `upload_failed_${res.status}`);
        }
        setPending((p) => p.filter((x) => x.tempId !== tempId));
        await refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown_error";
        setPending((p) =>
          p.map((x) =>
            x.tempId === tempId ? { ...x, progress: "error", error: msg } : x,
          ),
        );
      }
    },
    [refresh],
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      for (const f of Array.from(files)) {
        if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
          continue;
        }
        uploadFile(f);
      }
    },
    [uploadFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles],
  );

  const onDelete = useCallback(
    async (id: string) => {
      setDocs((d) => d.filter((x) => x.id !== id));
      await fetch(`/api/documents/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  const onReclassify = useCallback(
    async (doc: DocumentRow, target: "spec" | "submittal" | "other") => {
      const previousBucket = bucketOf(doc.docType);
      const warnings: string[] = [];
      if (previousBucket === "spec") {
        warnings.push(
          "Its parsed paragraphs and any submittal pairings will be cleared.",
        );
      } else if (previousBucket === "submittal") {
        warnings.push(
          "Its extracted fields, spec assignments, and any compliance responses will be cleared.",
        );
      }
      const note = warnings.length
        ? `\n\n${warnings.join(" ")}\n\nThis cannot be undone.`
        : "";
      const ok = window.confirm(
        `Move "${doc.filename}" to the ${target} bucket?${note}`,
      );
      if (!ok) return;

      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ docType: target }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        window.alert(`Reclassify failed: ${j.error ?? res.status}`);
        return;
      }
      await refresh();
    },
    [refresh],
  );

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
              Documents
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Drop drawings, specs, and submittals in. Voltaic auto-classifies
              each PDF; reclassify from the row menu if it gets one wrong.
            </p>
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-[12px] border-2 border-dashed p-8 text-center transition ${
            dragOver
              ? "border-[var(--color-coral)] bg-[var(--color-coral-tint)]"
              : "border-[var(--color-line-strong)] bg-[var(--color-paper)] hover:border-[var(--color-coral-tint-2)] hover:bg-[var(--color-cream-deep)]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <div className="font-semibold text-[var(--color-ink)]">
            Drop PDFs here
          </div>
          <div className="mt-1 text-sm text-[var(--color-muted)]">
            or click to choose files · up to 50&nbsp;MB each
          </div>
        </div>

        <div className="flex gap-3">
          <BucketCard
            label="Specs"
            count={bucketCounts.spec}
            active={bucket === "spec"}
            onClick={() => setBucket((b) => (b === "spec" ? "all" : "spec"))}
          />
          <BucketCard
            label="Submittals"
            count={bucketCounts.submittal}
            active={bucket === "submittal"}
            onClick={() =>
              setBucket((b) => (b === "submittal" ? "all" : "submittal"))
            }
          />
          <BucketCard
            label="Other"
            count={bucketCounts.other}
            active={bucket === "other"}
            onClick={() => setBucket((b) => (b === "other" ? "all" : "other"))}
          />
        </div>

        {pending.length > 0 && (
          <div className="paper divide-y divide-[var(--color-line-soft)]">
            {pending.map((p) => (
              <div
                key={p.tempId}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span
                  className="pulse-dot h-2 w-2 rounded-full"
                  style={{
                    background:
                      p.progress === "error"
                        ? "var(--color-clay)"
                        : "var(--color-coral)",
                  }}
                />
                <span className="flex-1 truncate text-[var(--color-ink-soft)]">
                  {p.filename}
                </span>
                <span className="text-xs text-[var(--color-muted)]">
                  {formatBytes(p.sizeBytes)}
                </span>
                <span
                  className="w-24 text-right text-xs font-mono"
                  style={{
                    color:
                      p.progress === "error"
                        ? "var(--color-clay)"
                        : "var(--color-muted)",
                  }}
                >
                  {p.progress === "error" ? p.error ?? "error" : "uploading…"}
                </span>
              </div>
            ))}
          </div>
        )}

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
              {bucket === "all"
                ? "All documents"
                : bucket === "spec"
                  ? "Specs"
                  : bucket === "submittal"
                    ? "Submittals"
                    : "Other"}
            </h2>
            <span className="text-xs text-[var(--color-muted)]">
              {loading
                ? "Loading…"
                : `${visibleDocs.length} document${visibleDocs.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {visibleDocs.length === 0 && !loading ? (
            <div className="paper p-8 text-center text-sm text-[var(--color-muted)]">
              {docs.length === 0
                ? "No documents yet. Drop a PDF above to get started."
                : "No documents in this bucket yet."}
            </div>
          ) : (
            <div className="paper divide-y divide-[var(--color-line-soft)]">
              {visibleDocs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-4 px-4 py-3 text-sm"
                >
                  <svg
                    className="h-4 w-4 shrink-0 text-[var(--color-muted)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate font-medium text-[var(--color-ink)]">
                    {d.filename}
                  </span>
                  <StatusPill status={d.status} />
                  {d.docType === "submittal" ? (
                    <span className="w-24 text-left">
                      <PairBadge state={d.pairState} />
                    </span>
                  ) : (
                    <span className="w-24" />
                  )}
                  <span className="w-14 text-right text-xs text-[var(--color-muted)]">
                    {d.pageCount != null ? `${d.pageCount}p` : "—"}
                  </span>
                  <span className="w-20 text-right text-xs text-[var(--color-muted)]">
                    {formatBytes(d.sizeBytes)}
                  </span>
                  <span className="w-28 text-right text-xs text-[var(--color-muted)]">
                    {formatDate(d.uploadedAt)}
                  </span>
                  {d.docType === "submittal" ? (
                    <button
                      onClick={() => setAssignTarget(d)}
                      className="rounded border px-2 py-0.5 text-[11px] font-medium transition"
                      style={
                        d.assignmentCount > 0
                          ? {
                              borderColor: "var(--color-line)",
                              color: "var(--color-ink-soft)",
                              background: "var(--color-paper)",
                            }
                          : {
                              borderColor: "var(--color-coral-tint-2)",
                              color: "var(--color-coral-dark)",
                              background: "var(--color-coral-tint)",
                            }
                      }
                      title="Assign to spec section"
                    >
                      {d.assignmentCount > 0
                        ? `Assigned · ${d.assignmentCount}`
                        : "Assign"}
                    </button>
                  ) : (
                    <span className="w-[78px]" />
                  )}
                  <RowMenu
                    doc={d}
                    onReclassify={(target) => onReclassify(d, target)}
                    onDelete={() => {
                      if (
                        window.confirm(
                          `Delete "${d.filename}"? This cannot be undone.`,
                        )
                      ) {
                        void onDelete(d.id);
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <AssignModal
        open={assignTarget !== null}
        submittal={
          assignTarget
            ? { id: assignTarget.id, filename: assignTarget.filename }
            : null
        }
        specs={specs}
        onClose={() => setAssignTarget(null)}
        onChanged={() => {
          void refresh();
        }}
      />
    </section>
  );
}
