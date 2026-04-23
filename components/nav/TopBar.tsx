import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-rule)] bg-[var(--color-surface-raised)] px-6">
      <div className="flex items-center gap-3">
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/today"
          afterSelectOrganizationUrl="/today"
          appearance={{
            variables: { colorPrimary: "#c15f3c" },
            elements: {
              organizationSwitcherTrigger:
                "px-2 py-1 rounded-md hover:bg-[var(--color-surface-sunken)]",
            },
          }}
        />
        <span aria-hidden className="text-[var(--color-ink-faint)]">
          /
        </span>
        <nav className="flex items-center gap-1.5 text-[13px] text-[var(--color-ink-muted)]">
          <span>Riverside Medical Center</span>
          <span aria-hidden className="text-[var(--color-ink-faint)]">
            /
          </span>
          <span className="text-[var(--color-ink)]">Electrical</span>
        </nav>
        <span className="ml-2 rounded-full border border-[var(--color-rule)] px-2.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink-muted)]">
          Day 85 of 240
        </span>
      </div>

      <div className="flex items-center gap-3">
        <CostMeter amountUsd={0} />
        <UserButton
          appearance={{
            variables: { colorPrimary: "#c15f3c" },
            elements: { avatarBox: "h-7 w-7" },
          }}
        />
      </div>
    </header>
  );
}

function CostMeter({ amountUsd }: { amountUsd: number }) {
  return (
    <span
      title="LLM cost for this project"
      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-rule)] bg-[var(--color-surface-sunken)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] text-[var(--color-ink-muted)]"
    >
      <span
        aria-hidden
        className="h-1.5 w-1.5 rounded-full bg-[var(--color-sage)]"
      />
      Analysis ${amountUsd.toFixed(2)}
    </span>
  );
}
