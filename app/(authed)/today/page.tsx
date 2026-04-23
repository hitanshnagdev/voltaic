import Link from "next/link";

type Blocker = {
  kind: "compliance" | "dependency" | "material";
  icon: string;
  title: string;
  tti: { label: string; tone: "hot" | "warm" | "cool" };
  detail: string;
  affects: string;
};

const BLOCKERS: Blocker[] = [
  {
    kind: "compliance",
    icon: "!",
    title:
      "Panelboard submittal SUB-026-2416-003 doesn't match spec AIC rating",
    tti: { label: "Installs in 4 days", tone: "hot" },
    detail:
      "Spec 26 24 16 §2.2.B calls for 65kA. Submittal shows 42kA. Swap or upgrade required before release.",
    affects: "PB-L1-A, PB-L1-B, PB-L2-A",
  },
  {
    kind: "material",
    icon: "V",
    title:
      "Transformer vendor \u201cOlsun Electrics\u201d not on approved manufacturer list",
    tti: { label: "Installs in 6 days", tone: "hot" },
    detail:
      "Spec 26 22 13 §1.2 lists 5 approved manufacturers. Submittal SUB-026-2213-002 proposes Olsun. RFI may be needed.",
    affects: "T-MDP, T-ICU",
  },
  {
    kind: "compliance",
    icon: "!",
    title: "NEC 110.26 working clearance potentially violated at SWB-1 location",
    tti: { label: "Installs in 11 days", tone: "warm" },
    detail:
      'Drawing E-201 shows 34" clear in front of SWB-1. NEC requires 36" minimum for 208V equipment. Needs field confirmation.',
    affects: "SWB-1",
  },
  {
    kind: "dependency",
    icon: "\u23f3",
    title: "UPS-ICU redundancy flag — submittal shows N, spec requires N+1",
    tti: { label: "Long-lead · 18 weeks", tone: "warm" },
    detail:
      "Spec 26 33 53 §3.2.A requires N+1 redundancy for ICU-serving UPS. SUB-026-3353-001 proposes single-module N config.",
    affects: "UPS-ICU",
  },
  {
    kind: "compliance",
    icon: "\u0394",
    title: "AIC regression: SUB-026-1313-004 Rev 2 dropped 100kA → 65kA",
    tti: { label: "Installs in 23 days", tone: "cool" },
    detail:
      "Rev 1 of this switchboard submittal showed 100kA. Rev 2 shows 65kA without an RFI justifying the change. Spec calls for 65kA minimum — within range but worth verifying.",
    affects: "SWB-2",
  },
];

const PINNED = [
  {
    q: "What conductor insulation is approved for feeder runs in wet locations?",
    a: "XHHW-2, per Spec 26 05 19 §2.1.A. Aluminum not permitted except where called out.",
    meta: "Pinned Apr 19 · 2 citations",
  },
  {
    q: "Which submittals require a short circuit study attached?",
    a: "SWB-1, SWB-2, DP-A, and all panels >200A per Spec 26 05 73 §1.3.B.",
    meta: "Pinned Apr 17 · 3 citations",
  },
];

const ACTIVITY = [
  {
    tone: "good",
    mark: "+",
    text: "SUB-026-0519-007 approved · No issues flagged by AI",
    when: "3h ago",
  },
  {
    tone: "good",
    mark: "\u2212",
    text: "Missing nameplate on SUB-026-2726-003 resolved in Rev 2",
    when: "5h ago",
  },
  {
    tone: "bad",
    mark: "+",
    text: "AI flagged UPS redundancy on SUB-026-3353-001 (engineer verify)",
    when: "8h ago",
  },
  {
    tone: "bad",
    mark: "\u0394",
    text: "SUB-026-1313-004 Rev 2 uploaded · AIC regression detected (100→65)",
    when: "2h ago",
  },
];

export default function TodayPage() {
  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-6xl space-y-8 px-8 py-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
              Today
            </h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Tuesday, Apr 21, 2026 · AI-flagged issues from the last analysis
              ·{" "}
              <span className="font-medium text-[var(--color-ink-soft)]">
                Engineer verification required before action
              </span>
            </p>
          </div>
          <Link href="/compare" className="btn-primary">
            + Run a check
          </Link>
        </div>

        {/* Readiness hero */}
        <div className="paper p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Install readiness — electrical
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-4xl font-semibold text-[var(--color-ink)]">
                  62
                  <span className="text-2xl text-[var(--color-muted-soft)]">
                    /87
                  </span>
                </span>
                <span className="text-sm text-[var(--color-muted)]">
                  equipment items ready to install
                </span>
              </div>
              <div className="mt-4 flex items-center gap-4 text-xs text-[var(--color-ink-soft)]">
                <span className="flex items-center gap-1.5">
                  <span className="readiness-dot ready" />
                  62 ready
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="readiness-dot compliance" />
                  16 open issues
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="readiness-dot dependency" />
                  9 waiting upstream
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[var(--color-muted)]">
                Trend vs last week
              </div>
              <div
                className="mt-1 text-sm font-medium"
                style={{ color: "#3a5844" }}
              >
                ↑ 8 items became ready
              </div>
              <div className="mt-2 text-[11px] text-[var(--color-muted-soft)]">
                Based on last AI analysis · 2 min ago
              </div>
            </div>
          </div>
          <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-[var(--color-cream-deep)]">
            <div style={{ flex: 62, background: "var(--color-sage)" }} />
            <div style={{ flex: 16, background: "var(--color-clay)" }} />
            <div style={{ flex: 9, background: "var(--color-gold)" }} />
          </div>
        </div>

        {/* Blockers */}
        <div>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                What&apos;s blocking install today
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                AI-flagged · Ranked by time-to-impact on install ·{" "}
                <span className="italic">Engineer verify before action</span>
              </p>
            </div>
            <Link
              href="/compare"
              className="text-xs font-medium"
              style={{ color: "var(--color-coral-dark)" }}
            >
              See all 16 in Compare →
            </Link>
          </div>
          <div className="space-y-2">
            {BLOCKERS.map((b, i) => (
              <Link
                key={i}
                href="/compare"
                className={`blocker-row ${b.kind}`}
              >
                <div className={`blocker-icon ${b.kind}`}>{b.icon}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-ink)]">
                      {b.title}
                    </span>
                    <span className={`tti ${b.tti.tone}`}>{b.tti.label}</span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--color-ink-soft)]">
                    {b.detail}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[var(--color-muted-soft)]">
                    <span>{b.affects}</span>
                    <span>·</span>
                    <span style={{ color: "var(--color-coral-dark)" }}>
                      Open in Compare with evidence
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Pinned answers */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                Pinned answers
              </h2>
              <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                Questions you&apos;ve saved from Compare sessions
              </p>
            </div>
            <Link
              href="/compare"
              className="text-xs font-medium"
              style={{ color: "var(--color-coral-dark)" }}
            >
              Ask Voltaic →
            </Link>
          </div>
          <div className="paper divide-y divide-[var(--color-line-soft)]">
            {PINNED.map((p, i) => (
              <div
                key={i}
                className="cursor-pointer px-4 py-3 hover:bg-[var(--color-cream-deep)]"
              >
                <div className="mb-1 text-xs text-[var(--color-muted)]">
                  &ldquo;{p.q}&rdquo;
                </div>
                <div className="text-sm leading-snug text-[var(--color-ink-soft)]">
                  {p.a}
                </div>
                <div className="mt-1.5 text-[10px] text-[var(--color-muted-soft)]">
                  {p.meta}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What changed */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            What changed in the last 24 hours
          </h2>
          <div className="paper divide-y divide-[var(--color-line-soft)] p-0">
            {ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className="flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold"
                  style={
                    a.tone === "good"
                      ? {
                          background: "var(--color-sage-tint)",
                          color: "#3a5844",
                        }
                      : {
                          background: "var(--color-clay-tint)",
                          color: "var(--color-clay)",
                        }
                  }
                >
                  {a.mark}
                </span>
                <div className="flex-1 text-sm text-[var(--color-ink-soft)]">
                  {a.text}
                </div>
                <span className="text-xs text-[var(--color-muted-soft)]">
                  {a.when}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
