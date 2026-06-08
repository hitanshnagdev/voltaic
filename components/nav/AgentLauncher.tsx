"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Persistent agent launcher — lives in the TopBar, so the Voltaic agent is
 * one click (or ⌘K) away from every screen: Feed, Sources, Outputs. The
 * agent is the product's headline differentiator; it should never be buried
 * in a tab. (Future: opens an in-place slide-over rail instead of routing —
 * the Phase-7 action copilot.)
 */
export function AgentLauncher() {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        router.push("/agents");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <button
      type="button"
      onClick={() => router.push("/agents")}
      title="Ask Voltaic (⌘K)"
      className="flex items-center gap-2 rounded-full bg-[var(--color-coral)] px-3.5 py-1.5 text-[13px] font-medium text-white shadow-[0_1px_3px_rgba(193,95,60,0.3)] transition-colors hover:bg-[var(--color-coral-dark)]"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
      Ask Voltaic
      <span className="ml-0.5 rounded bg-white/20 px-1.5 py-0.5 font-mono text-[10px] leading-none">
        ⌘K
      </span>
    </button>
  );
}
