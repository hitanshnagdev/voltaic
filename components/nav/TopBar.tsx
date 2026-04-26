import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

/**
 * Top bar. Renders the project name as a breadcrumb after the org
 * switcher when one is available; collapses to just the brand mark when
 * the user is signed in but has no project (NoOrgGate path).
 *
 * Notification bell removed in PR A (chrome cleanup) — there is no
 * notifications system; the "3" badge was decoration. Re-add when the
 * notifications surface ships.
 */
export function TopBar(props: {
  projectName: string | null;
  projectStatus: string | null;
}) {
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
        {props.projectName ? (
          <>
            <span className="text-[var(--color-line-strong)]">/</span>
            <span className="font-medium tracking-tight text-[var(--color-ink)]">
              {props.projectName}
            </span>
            {props.projectStatus === "active" ? (
              <span
                className="ml-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{
                  background: "var(--color-sage-tint)",
                  color: "#3a5844",
                  borderColor: "#bed6c4",
                }}
              >
                Active
              </span>
            ) : props.projectStatus ? (
              <span
                className="ml-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
                style={{
                  background: "var(--color-paper)",
                  color: "var(--color-muted)",
                  borderColor: "var(--color-line)",
                }}
              >
                {props.projectStatus}
              </span>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-3">
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
