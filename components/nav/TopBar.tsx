import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex items-center gap-6 border-b border-[var(--color-line)] bg-[var(--color-cream)] px-6 py-3">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ background: "var(--color-coral)" }}
        >
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.4}
            className="h-[18px] w-[18px] text-white"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <span className="text-[15px] font-medium tracking-tight text-[var(--color-ink)]">
          Voltaic
        </span>
      </div>

      <span className="text-[var(--color-line-strong)]">/</span>

      <div className="flex items-center gap-2 text-sm">
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/today"
          afterSelectOrganizationUrl="/today"
          appearance={{
            variables: { colorPrimary: "#cc785c" },
            elements: {
              organizationSwitcherTrigger:
                "px-2 py-1 rounded-md hover:bg-[var(--color-cream-deep)] text-[var(--color-muted)]",
            },
          }}
        />
        <span className="text-[var(--color-line-strong)]">/</span>
        <span className="font-medium tracking-tight text-[var(--color-ink)]">
          Riverside Medical Center — Electrical
        </span>
        <span
          className="ml-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: "var(--color-sage-tint)",
            color: "#3a5844",
            borderColor: "#bed6c4",
          }}
        >
          ACTIVE
        </span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
        <button
          title="Notifications"
          className="relative rounded p-1.5 text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)] hover:text-[var(--color-ink)]"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span
            className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
            style={{ background: "var(--color-clay)" }}
          >
            3
          </span>
        </button>
        <div className="h-6 w-px bg-[var(--color-line)]" />
        <UserButton
          appearance={{
            variables: { colorPrimary: "#cc785c" },
            elements: { avatarBox: "h-7 w-7" },
          }}
        />
      </div>
    </header>
  );
}
