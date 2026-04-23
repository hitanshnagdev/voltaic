"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DocumentRow = {
  id: string;
  filename: string;
  sizeBytes: number;
  mimeType: string | null;
  docType: string | null;
  status: string;
  pageCount: number | null;
  uploadedAt: string;
};

type Pending = {
  tempId: string;
  filename: string;
  sizeBytes: number;
  progress: "uploading" | "error";
  error?: string;
};

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

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DocsClient() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/documents");
    if (res.ok) {
      const json = await res.json();
      setDocs(json.documents ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
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

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
              Documents
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Drag drawings, specs, and submittals in. Classification and
              parsing run automatically on upload.
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
          className={`flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-[12px] border-2 border-dashed p-10 text-center transition ${
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

        {pending.length > 0 && (
          <div className="paper divide-y divide-[var(--color-line-soft)]">
            {pending.map((p) => (
              <div
                key={p.tempId}
                className="flex items-center gap-3 px-4 py-3 text-sm"
              >
                <span
                  className={`pulse-dot h-2 w-2 rounded-full ${
                    p.progress === "error" ? "" : ""
                  }`}
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
              Uploaded
            </h2>
            <span className="text-xs text-[var(--color-muted)]">
              {loading ? "Loading…" : `${docs.length} document${docs.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {docs.length === 0 && !loading ? (
            <div className="paper p-8 text-center text-sm text-[var(--color-muted)]">
              No documents yet. Drop a PDF above to get started.
            </div>
          ) : (
            <div className="paper divide-y divide-[var(--color-line-soft)]">
              {docs.map((d) => (
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
                  <span
                    className="w-20 text-xs font-mono uppercase tracking-wider"
                    style={{
                      color: d.docType
                        ? "var(--color-coral-dark)"
                        : "var(--color-muted-soft)",
                    }}
                  >
                    {d.docType ?? "—"}
                  </span>
                  <span className="w-14 text-right text-xs text-[var(--color-muted)]">
                    {d.pageCount != null ? `${d.pageCount}p` : "—"}
                  </span>
                  <span className="w-20 text-right text-xs text-[var(--color-muted)]">
                    {formatBytes(d.sizeBytes)}
                  </span>
                  <span className="w-28 text-right text-xs text-[var(--color-muted)]">
                    {formatDate(d.uploadedAt)}
                  </span>
                  <button
                    onClick={() => onDelete(d.id)}
                    className="text-xs text-[var(--color-muted)] hover:text-[var(--color-clay)]"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
