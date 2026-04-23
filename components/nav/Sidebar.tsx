"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/today", label: "Today", key: "today" },
  { href: "/map", label: "System Map", key: "map" },
  { href: "/compare", label: "Compare", key: "compare" },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-[var(--color-rule)] bg-[var(--color-surface-sunken)] px-4 py-5">
      <div className="mb-8 flex items-center gap-2">
        <div
          aria-hidden
          className="h-6 w-6 rounded-[6px]"
          style={{ background: "var(--color-coral)" }}
        />
        <span className="font-[family-name:var(--font-display)] text-[18px] leading-none">
          Voltaic
        </span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={[
                "rounded-[8px] px-3 py-2 text-[14px] transition-colors",
                active
                  ? "bg-[var(--color-surface-raised)] text-[var(--color-ink)] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                  : "text-[var(--color-ink-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-ink)]",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <span className="inline-flex w-fit items-center rounded-full border border-[var(--color-rule)] bg-[var(--color-surface-raised)] px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          Electrical scope · MEP later
        </span>
        <p className="text-[11px] leading-snug text-[var(--color-ink-faint)]">
          AI-flagged · Engineer verifies before action.
        </p>
      </div>
    </aside>
  );
}
