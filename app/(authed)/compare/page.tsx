"use client";

import { useState } from "react";

type Category =
  | "all"
  | "material"
  | "vendor"
  | "code"
  | "submittal"
  | "revision";

type Prompt = {
  id: string;
  cat: Exclude<Category, "all"> | "longlead" | "readiness" | "rfi";
  label: string;
  prompt: string;
};

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All" },
  { id: "material", label: "Material" },
  { id: "vendor", label: "Vendor" },
  { id: "code", label: "Code" },
  { id: "submittal", label: "Submittal" },
  { id: "revision", label: "Revision" },
];

const PROMPTS: Prompt[] = [
  {
    id: "material-panelboard",
    cat: "material",
    label: "Material compliance",
    prompt:
      "Check panelboard submittals against Spec 26 24 16 — AIC rating, enclosure, bus rating",
  },
  {
    id: "material-conductor",
    cat: "material",
    label: "Material compliance",
    prompt:
      "Verify conductor insulation across all feeder submittals (wet vs dry locations)",
  },
  {
    id: "vendor-unapproved",
    cat: "vendor",
    label: "Vendor compliance",
    prompt: "Find submittals with vendors not on the approved manufacturer list",
  },
  {
    id: "vendor-listing",
    cat: "vendor",
    label: "Vendor compliance",
    prompt: "Verify UL listings and certifications match spec requirements",
  },
  {
    id: "code-clearance",
    cat: "code",
    label: "Code compliance",
    prompt: "NEC 110.26 — working clearances on all gear installations",
  },
  {
    id: "code-conduitfill",
    cat: "code",
    label: "Code compliance",
    prompt: "NEC Chapter 9 — conduit fill on feeder runs",
  },
  {
    id: "submittal-short-circuit",
    cat: "submittal",
    label: "Submittal conformance",
    prompt: "Confirm short-circuit study is attached to all >200A submittals",
  },
  {
    id: "revision-aic",
    cat: "revision",
    label: "Revision impact",
    prompt:
      "Compare Rev 4 drawings to Rev 3 — what changed and what's now affected?",
  },
  {
    id: "revision-rfi",
    cat: "revision",
    label: "RFI / ASI reconciliation",
    prompt: "Which equipment is affected by open RFI-042 and RFI-046?",
  },
  {
    id: "longlead-ups",
    cat: "longlead",
    label: "Long-lead risk",
    prompt: "Surface open issues on equipment with >16-week lead time",
  },
  {
    id: "install-ready",
    cat: "readiness",
    label: "Install readiness",
    prompt: "What's blocking install in the next 7 days?",
  },
];

const CAT_CLASS: Record<Prompt["cat"], string> = {
  material: "cat-material",
  vendor: "cat-vendor",
  code: "cat-code",
  submittal: "cat-submittal",
  revision: "cat-revision",
  rfi: "cat-rfi",
  longlead: "cat-longlead",
  readiness: "cat-readiness",
};

export default function ComparePage() {
  const [filter, setFilter] = useState<Category>("all");
  const [active, setActive] = useState<string>("material-panelboard");
  const [activeIssue, setActiveIssue] = useState<number>(1);
  const [chat, setChat] = useState("");

  const visible = PROMPTS.filter(
    (p) => filter === "all" || (p.cat as string) === filter,
  );

  return (
    <div
      className="grid flex-1 overflow-hidden"
      style={{ gridTemplateColumns: "280px 1fr 1fr 340px" }}
    >
      {/* LEFT RAIL */}
      <aside className="flex flex-col overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-cream)]">
        <div className="border-b border-[var(--color-line)] px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Saved compliance checks
          </div>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            Run any with one click · AI selects the documents ·{" "}
            <span className="italic">engineer verify</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-[var(--color-line)] px-4 py-2.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`cat-pill ${filter === c.id ? "active" : ""}`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
          {visible.map((p) => (
            <button
              key={p.id}
              onClick={() => setActive(p.id)}
              className={`prompt-chip ${active === p.id ? "running" : ""}`}
            >
              <span className={`cat ${CAT_CLASS[p.cat]}`}>{p.label}</span>
              {p.prompt}
            </button>
          ))}
          <button className="mt-2 w-full rounded border border-dashed border-[var(--color-line-strong)] py-2 text-center text-[11px] text-[var(--color-muted)] hover:text-[var(--color-ink-soft)]">
            + Save a new check from a chat turn
          </button>
        </div>

        <div className="border-t border-[var(--color-line)] bg-white p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
            Ask Voltaic
          </div>
          <div className="relative">
            <textarea
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              rows={2}
              placeholder="e.g. Does the latest panelboard submittal match the spec?"
              className="w-full resize-none rounded-lg border border-[var(--color-line)] px-3 py-2 pr-20 text-[13px] focus:border-[var(--color-coral-dark)] focus:outline-none"
            />
            <button
              onClick={() => {
                setChat("");
                setActive("material-panelboard");
              }}
              className="btn-primary absolute bottom-2 right-2 px-3 py-1 text-[12px]"
            >
              Run
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--color-muted-soft)]">
            AI picks documents based on your question · Results are
            evidence-linked · Engineer verify before action
          </p>
        </div>
      </aside>

      {/* DOC PANE A — Spec */}
      <div
        className="flex flex-col overflow-hidden p-4"
        style={{ background: "var(--color-cream)" }}
      >
        <div className="doc-pane slide-in-up flex-1" key={`a-${active}`}>
          <div className="doc-pane-header">
            <PaneIcon />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-[var(--color-ink)]">
                Spec 26 24 16 — Panelboards
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                Section 2.2 · Distribution Panelboards ·{" "}
                <span className="font-mono">§ 2.2.B</span>
              </div>
            </div>
            <button className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)]">
              Swap ▾
            </button>
          </div>
          <div className="doc-pane-body pdf-preview relative overflow-auto p-6">
            <div className="mx-auto max-w-[520px]">
              <div className="mb-3 font-mono text-[11px] text-[var(--color-muted)]">
                SECTION 26 24 16 — PANELBOARDS
              </div>
              <div className="serif-display text-[14px] leading-[1.7] text-[var(--color-ink-soft)]">
                <p className="mb-4">
                  <b>PART 2 — PRODUCTS</b>
                </p>
                <p className="mb-2">
                  <b>2.2 DISTRIBUTION PANELBOARDS</b>
                </p>
                <p className="mb-4 pl-4">
                  <b>A.</b> Provide panelboards of the sizes, ratings, and
                  configurations shown on the Drawings, UL 67 listed and
                  labeled.
                </p>
                <p className="relative mb-4 pl-4">
                  <b>B.</b>{" "}
                  <span className="highlight-mark">
                    Short-circuit current rating (AIC) shall be not less than{" "}
                    <b>65,000 amperes RMS symmetrical</b>
                  </span>{" "}
                  at 480Y/277V, coordinated with the available fault current
                  from the utility transformer and upstream overcurrent
                  devices. Series-rated combinations are <b>not</b> acceptable.
                </p>
                <p className="mb-4 pl-4">
                  <b>C.</b> Enclosure shall be NEMA 1 for indoor dry locations,
                  NEMA 3R for wet or outdoor locations.
                </p>
                <p className="mb-4 pl-4">
                  <b>D.</b> Bus bars shall be copper, tin-plated at joints,
                  rated for 75°C termination temperature.
                </p>
                <p className="mb-4 pl-4">
                  <b>E.</b> Ground bus shall be provided full-length on every
                  panelboard. Isolated ground bus shall be furnished where
                  called out on elevation drawings.
                </p>
              </div>
              <div
                className="doc-region"
                style={{
                  top: 195,
                  left: 68,
                  width: 446,
                  height: 74,
                }}
              >
                <span className="region-tag">ISSUE 1 · Spec</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DOC PANE B — Submittal */}
      <div
        className="flex flex-col overflow-hidden p-4"
        style={{ background: "var(--color-cream)" }}
      >
        <div className="doc-pane slide-in-up flex-1" key={`b-${active}`}>
          <div className="doc-pane-header">
            <PaneIcon />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-semibold text-[var(--color-ink)]">
                SUB-026-2416-003 Rev 2 — Panelboard submittal
              </div>
              <div className="text-[10px] text-[var(--color-muted)]">
                PB-L1-A, PB-L1-B, PB-L2-A · Received Apr 16 · Under review
              </div>
            </div>
            <button className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-cream-deep)]">
              Swap ▾
            </button>
          </div>
          <div className="doc-pane-body pdf-preview relative overflow-auto p-6">
            <div className="mx-auto max-w-[520px]">
              <div className="mb-3 font-mono text-[11px] text-[var(--color-muted)]">
                SUB-026-2416-003 · REV 2 · PAGE 3 of 12
              </div>
              <div className="serif-display text-[13px] leading-[1.65] text-[var(--color-ink-soft)]">
                <p className="mb-3 font-semibold text-[var(--color-ink)]">
                  Panelboard Data Sheet — PB-L1-A
                </p>
                <table className="mb-4 w-full border border-[var(--color-line)] text-[12px]">
                  <tbody className="divide-y divide-[var(--color-line-soft)]">
                    <tr>
                      <td className="w-1/2 px-3 py-1.5 text-[var(--color-muted)]">
                        Manufacturer
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        Square D · NF-series
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-[var(--color-muted)]">
                        Voltage
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        480Y/277V · 3-phase · 4-wire
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-[var(--color-muted)]">
                        Main rating
                      </td>
                      <td className="px-3 py-1.5 font-medium">225A · MLO</td>
                    </tr>
                    <tr style={{ background: "var(--color-clay-tint)" }}>
                      <td className="px-3 py-1.5 text-[var(--color-muted)]">
                        AIC rating
                      </td>
                      <td className="px-3 py-1.5 font-semibold">
                        <span
                          className="highlight-mark"
                          style={{
                            background: "#F5DAD0",
                            color: "#76342A",
                          }}
                        >
                          42,000 A RMS symmetrical @ 480V
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-[var(--color-muted)]">
                        Enclosure
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        NEMA 1 · Indoor
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-[var(--color-muted)]">
                        Bus material
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        Copper · tin-plated
                      </td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5 text-[var(--color-muted)]">
                        Ground bus
                      </td>
                      <td className="px-3 py-1.5 font-medium">
                        Furnished full-length
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="mb-3 text-[11px] italic text-[var(--color-muted)]">
                  Series-rated combination with upstream SWB-1 breaker (65kAIC)
                  to achieve system interrupting rating per manufacturer
                  published tables.
                </p>
              </div>
              <div
                className="doc-region"
                style={{ top: 206, left: 58, width: 466, height: 34 }}
              >
                <span className="region-tag">ISSUE 1 · Submittal</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT RAIL */}
      <aside className="flex flex-col overflow-hidden border-l border-[var(--color-line)] bg-[var(--color-cream)]">
        <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Findings
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              <span className="font-medium text-[var(--color-ink-soft)]">
                3
              </span>{" "}
              AI-flagged · Evidence-linked
            </div>
          </div>
          <button className="rounded border border-[var(--color-line)] px-2 py-1 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-paper)]">
            Pin all
          </button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
          <IssueCard
            n={1}
            severity="HIGH"
            title="AIC rating mismatch — spec 65kA, submittal 42kA"
            body="Spec §2.2.B requires 65,000 A minimum AIC and explicitly prohibits series-rated combinations. Submittal lists 42kA and relies on a series-rated combination with SWB-1."
            footer="Affects PB-L1-A, PB-L1-B, PB-L2-A · installs in 4 days"
            cites={["SPEC 26 24 16 §2.2.B", "SUB-026-2416-003 p.3"]}
            active={activeIssue === 1}
            onClick={() => setActiveIssue(1)}
          />
          <IssueCard
            n={2}
            severity="HIGH"
            title="Series-rated combination explicitly prohibited"
            body={'Spec §2.2.B ends with "Series-rated combinations are not acceptable." Submittal page 3 notes its AIC is achieved via a series-rated combination with upstream SWB-1.'}
            footer="Will require resubmittal or spec RFI"
            cites={["SPEC 26 24 16 §2.2.B", "SUB-026-2416-003 p.3 note"]}
            active={activeIssue === 2}
            onClick={() => setActiveIssue(2)}
          />
          <IssueCard
            n={3}
            severity="MEDIUM"
            title="Ground bus visible on data sheet — verify elevations show it"
            body="Spec §2.2.E requires full-length ground bus on every panelboard. Data sheet confirms 'furnished full-length,' but elevation drawings on pages 7–9 don't annotate the ground bus explicitly. Could be covered by general notes — engineer confirm."
            cites={["SPEC 26 24 16 §2.2.E", "SUB-026-2416-003 p.7-9"]}
            active={activeIssue === 3}
            onClick={() => setActiveIssue(3)}
          />

          {/* Reasoning */}
          <div className="mt-5 border-t border-[var(--color-line)] pt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Voltaic&apos;s reasoning
            </div>
            <div className="chat-bubble-user fade-in mb-3">
              Check panelboard submittals against Spec 26 24 16 — AIC rating,
              enclosure, bus rating
            </div>
            <div className="chat-bubble-ai fade-in">
              <p className="mb-2">
                I loaded{" "}
                <span className="chat-citation">Spec 26 24 16</span> on the
                left and the latest panelboard submittal{" "}
                <span className="chat-citation">SUB-026-2416-003 Rev 2</span>{" "}
                on the right, which covers PB-L1-A, PB-L1-B, and PB-L2-A.
              </p>
              <p className="mb-2">
                I found <b>3 issues</b>. Two are firm compliance gaps (AIC
                rating + series-rated combination, both called out in §2.2.B),
                and one is a verification flag on the ground bus on elevation
                drawings.
              </p>
              <p className="text-[11px] italic text-[var(--color-muted)]">
                Findings are AI-flagged based on spec text and submittal data.
                I don&apos;t approve or reject — please verify before action.
              </p>
            </div>
          </div>
        </div>

        <div className="trust-note">
          <svg
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <span>
            Every finding links to source evidence · AI does not approve ·
            Engineer verifies
          </span>
        </div>
      </aside>
    </div>
  );
}

function PaneIcon() {
  return (
    <svg
      className="h-4 w-4 text-[var(--color-muted)]"
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
  );
}

function IssueCard({
  n,
  severity,
  title,
  body,
  footer,
  cites,
  active,
  onClick,
}: {
  n: number;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  body: string;
  footer?: string;
  cites: string[];
  active: boolean;
  onClick: () => void;
}) {
  const sevStyle =
    severity === "HIGH"
      ? { background: "var(--color-clay-tint)", color: "var(--color-clay)" }
      : severity === "MEDIUM"
        ? { background: "var(--color-gold-tint)", color: "#87602B" }
        : {
            background: "var(--color-slate-blue-tint)",
            color: "#3D506B",
          };

  return (
    <button
      onClick={onClick}
      className={`issue-card ${active ? "active" : ""}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
          style={sevStyle}
        >
          {severity}
        </span>
        <span className="text-[10px] text-[var(--color-muted-soft)]">
          Issue {n} of 3
        </span>
      </div>
      <div className="text-[13px] font-semibold leading-snug text-[var(--color-ink)]">
        {title}
      </div>
      <div className="mt-1.5 text-[12px] leading-snug text-[var(--color-ink-soft)]">
        {body}
      </div>
      {footer && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
          <span>{footer}</span>
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[var(--color-line-soft)] pt-2.5 text-[10px]">
        {cites.map((c) => (
          <span key={c} className="chat-citation">
            {c}
          </span>
        ))}
      </div>
    </button>
  );
}
