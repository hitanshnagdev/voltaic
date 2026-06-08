"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

// Phase 0 IA: three surfaces — Feed (what's happening) / Sources (what flows
// in) / Outputs (what's drafted). Replaces the old 5 siloed tabs.
const NAV: NavItem[] = [
  {
    href: "/feed",
    label: "Feed",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    href: "/sources",
    label: "Sources",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V18a2 2 0 002 2h14a2 2 0 002-2v-1.5M12 3v10m0 0l4-4m-4 4l-4-4" />
      </svg>
    ),
  },
  {
    href: "/outputs",
    label: "Outputs",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V18a2 2 0 002 2h14a2 2 0 002-2v-1.5M12 13V3m0 0l4 4m-4-4l-4 4" />
      </svg>
    ),
  },
];

export function Sidebar(props: { projectName: string }) {
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
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
