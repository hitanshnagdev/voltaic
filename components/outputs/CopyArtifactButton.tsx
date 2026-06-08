"use client";

import { useState } from "react";

/** Copy the artifact's plain-text form to the clipboard (Chunk-1 export). */
export function CopyArtifactButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="btn-primary"
    >
      {copied ? "Copied ✓" : "Copy RFI text"}
    </button>
  );
}
