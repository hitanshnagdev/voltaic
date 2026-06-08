"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Paste a meeting transcript → POST /api/transcripts → the ingest pipeline
 * parses it into utterances, extracts spoken rating claims, and checks them
 * against the project's specs. Any contradiction surfaces in Today.
 */
export function MeetingComposer() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function submit() {
    if (!text.trim() || status === "submitting") return;
    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/transcripts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, text }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? "request_failed");
      }
      setText("");
      setTitle("");
      setStatus("done");
      setMessage(
        "Transcript added. Voltaic is extracting decisions and checking them against your specs — contradictions will appear in Today.",
      );
      router.refresh();
    } catch (e) {
      setStatus("error");
      setMessage(
        e instanceof Error && e.message !== "request_failed"
          ? `Couldn't add transcript (${e.message}).`
          : "Couldn't add the transcript. Try again.",
      );
    }
  }

  return (
    <div className="paper p-5">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        Meeting title
      </label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. OAC Coordination — Jun 8"
        className="mb-4 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-coral)]"
      />
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
        Transcript
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={
          'Paste the meeting transcript here.\n\nWorks with "Speaker: text" exports (Otter / Fireflies / Granola / Meet), VTT/SRT, or plain text.'
        }
        className="scrollbar-thin w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 font-mono text-[13px] leading-relaxed text-[var(--color-ink)] outline-none focus:border-[var(--color-coral)]"
      />
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || status === "submitting"}
          className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Processing…" : "Process transcript"}
        </button>
        {message && (
          <span
            className={`text-[12px] ${
              status === "error"
                ? "text-[var(--color-clay)]"
                : "text-[var(--color-sage)]"
            }`}
          >
            {message}
          </span>
        )}
      </div>
    </div>
  );
}
