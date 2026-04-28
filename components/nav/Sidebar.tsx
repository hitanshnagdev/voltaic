"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV: NavItem[] = [
  {
    href: "/today",
    label: "Today",
    icon: (
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
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
        />
      </svg>
    ),
  },
  {
    href: "/docs",
    label: "Documents",
    icon: (
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
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  },
  {
    href: "/compare",
    label: "Compare",
    icon: (
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
          d="M4 5a1 1 0 011-1h5v16H5a1 1 0 01-1-1V5zM14 4h5a1 1 0 011 1v14a1 1 0 01-1 1h-5V4z"
        />
      </svg>
    ),
  },
  {
    href: "/agents",
    label: "Agents",
    icon: (
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
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
    ),
  },
];

/**
 * Sidebar. Renders the active project name + a single real signal —
 * the count of open findings on the Today nav item. Decorative badges
 * (the "5" / "7" / "AI" mocks, the "$6.5M · Hospital reno · Austin TX"
 * line, the bottom "Last AI analysis · 2 minutes ago" panel) are gone:
 * each was a plausible-looking value with no backing data, exactly the
 * kind of fake the post-mortem on session 2026-04-26 named.
 */
export function Sidebar(props: {
  projectName: string;
  openFindingCount: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--color-line)] bg-[var(--color-cream)]">
      <div className="border-b border-[var(--color-line)] px-5 py-5">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
          Project
        </div>
        <div className="text-[15px] font-medium tracking-tight text-[var(--color-ink)]">
          {props.projectName}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              background: "var(--color-coral-tint)",
              color: "var(--color-coral-dark)",
            }}
          >
            Electrical scope
          </span>
          <span className="text-[10px] text-[var(--color-muted-soft)]">
            MEP later
          </span>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {NAV.map((item) => {
          const active = pathname?.startsWith(item.href);
          // Only the Today item gets a real badge — open findings count.
          // Other items get no badge (no real data to back one yet).
          const showBadge =
            item.href === "/today" && props.openFindingCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item flex items-center gap-3 rounded-md px-3 py-2 text-sm text-[var(--color-muted)] ${
                active ? "active" : ""
              }`}
            >
              <span className="text-[var(--color-muted-soft)]">
                {item.icon}
              </span>
              {item.label}
              {showBadge && (
                <span
                  className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                  style={{
                    background: "var(--color-clay-tint)",
                    color: "var(--color-clay)",
                  }}
                >
                  {props.openFindingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
