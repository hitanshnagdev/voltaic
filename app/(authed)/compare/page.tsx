import { auth, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { CompareEmptyState } from "@/components/compare/CompareEmptyState";
import { CompareSubmittalSelector } from "@/components/compare/CompareEquipmentSelector";
import { CompareTable } from "@/components/compare/CompareTable";
import { TrustFooter } from "@/components/today/TrustFooter";
import {
  buildCompareDataForSubmittal,
  listSubmittalsForCompare,
  type CompareData,
  type CompareEmptyReason,
} from "@/lib/db/compare";
import { ensureWorkspace } from "@/lib/db/workspace";

/**
 * /compare — per-submittal compliance table.
 *
 * Phase B PR 3 (DECISIONS.md U12). Reads from the spec-driven path
 * (assignments → checklist → responses), not the prior hardcoded
 * panelboard schema. Replaces the field-fishing extractor bugs from
 * #36 entirely — those code paths no longer exist on this page.
 *
 * URL: /compare?submittal=<id>&spec=<id>
 *   - Defaults to the most-flagged submittal in the project.
 *   - When a submittal has multiple assignments, ?spec= picks which
 *     one drives the comparison; chips above the table let the PM
 *     switch.
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ submittal?: string; spec?: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) return null;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });
  const { workspace, project } = await ensureWorkspace({
    clerkOrgId: orgId,
    orgName: org.name,
  });

  const submittals = await listSubmittalsForCompare({
    workspaceId: workspace.id,
    projectId: project.id,
  });

  if (submittals.length === 0) {
    return (
      <PageShell projectName={project.name}>
        <CompareEmptyState reason="no_equipment" />
      </PageShell>
    );
  }

  const params = await searchParams;
  const requestedId = params.submittal;
  const selected = requestedId
    ? submittals.find((s) => s.id === requestedId) ?? submittals[0]
    : submittals[0];

  const result = await buildCompareDataForSubmittal({
    workspaceId: workspace.id,
    projectId: project.id,
    submittalId: selected.id,
    specId: params.spec ?? null,
  });

  if ("empty" in result) {
    return (
      <PageShell projectName={project.name}>
        <SelectorBar
          submittals={submittals}
          selectedId={selected.id}
          summary={null}
        />
        <CompareEmptyMessage
          submittalId={selected.id}
          reason={result.empty}
        />
      </PageShell>
    );
  }

  const data = result;
  const matchPct =
    data.summary.evaluatedCount > 0
      ? Math.round((data.summary.passCount / data.summary.evaluatedCount) * 100)
      : null;

  return (
    <PageShell projectName={project.name}>
      <SelectorBar
        submittals={submittals}
        selectedId={selected.id}
        summary={{
          matchPct,
          flagged: data.summary.flaggedCount,
          missing: data.summary.missingCount,
          evaluated: data.summary.evaluatedCount,
          total: data.summary.totalCount,
        }}
      />

      {data.assignments.length > 1 && (
        <AssignmentChips data={data} />
      )}

      <ActiveAssignmentLine data={data} />

      <div className="flex items-center justify-end gap-2 text-[12px]">
        <button
          disabled
          className="cursor-not-allowed rounded border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-muted-soft)]"
          title="Coming soon"
        >
          Compile RFI from {data.summary.flaggedCount} flagged
        </button>
        <button
          disabled
          className="cursor-not-allowed rounded border border-[var(--color-line)] px-3 py-1.5 text-[var(--color-muted-soft)]"
          title="Coming soon"
        >
          Approve as noted
        </button>
      </div>

      <CompareTable data={data} />

      <TrustFooter />
    </PageShell>
  );
}

function PageShell({
  projectName,
  children,
}: {
  projectName: string;
  children: React.ReactNode;
}) {
  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Compare
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Per-submittal compliance against the assigned spec ·{" "}
            <span className="font-medium text-[var(--color-ink-soft)]">
              {projectName}
            </span>{" "}
            ·{" "}
            <span className="italic">
              Engineer verification required before action
            </span>
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}

function SelectorBar({
  submittals,
  selectedId,
  summary,
}: {
  submittals: Awaited<ReturnType<typeof listSubmittalsForCompare>>;
  selectedId: string;
  summary: {
    matchPct: number | null;
    flagged: number;
    missing: number;
    evaluated: number;
    total: number;
  } | null;
}) {
  return (
    <div className="paper flex flex-wrap items-center gap-4 px-4 py-3">
      <CompareSubmittalSelector submittals={submittals} selectedId={selectedId} />
      {summary && (
        <div className="ml-auto flex items-center gap-3 text-[12px]">
          {summary.matchPct !== null && (
            <span className="text-[var(--color-ink-soft)]">
              <span
                className="font-mono text-[15px] font-semibold"
                style={{
                  color:
                    summary.matchPct >= 80
                      ? "#3a5844"
                      : summary.matchPct >= 50
                        ? "#87602B"
                        : "var(--color-clay)",
                }}
              >
                {summary.matchPct}%
              </span>{" "}
              <span className="text-[var(--color-muted)]">match</span>
            </span>
          )}
          {summary.flagged > 0 && (
            <span
              className="font-mono text-[11px] font-semibold"
              style={{ color: "var(--color-clay)" }}
            >
              · {summary.flagged} flagged
            </span>
          )}
          {summary.missing > 0 && (
            <span
              className="font-mono text-[11px] font-semibold"
              style={{ color: "var(--color-muted)" }}
            >
              · {summary.missing} missing
            </span>
          )}
          <span className="text-[var(--color-muted-soft)]">
            · {summary.evaluated} of {summary.total} evaluated
          </span>
        </div>
      )}
    </div>
  );
}

function AssignmentChips({ data }: { data: CompareData }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <span className="font-mono uppercase tracking-wider text-[var(--color-muted-soft)]">
        Comparing against:
      </span>
      {data.assignments.map((a) => {
        const active = a.specDocumentId === data.activeAssignment.specDocumentId;
        return (
          <Link
            key={`${a.specDocumentId}-${a.csiSection ?? "any"}`}
            href={`/compare?submittal=${data.submittal.id}&spec=${a.specDocumentId}`}
            className="rounded border px-2 py-0.5 font-mono"
            style={
              active
                ? {
                    borderColor: "var(--color-coral-tint-2)",
                    background: "var(--color-coral-tint)",
                    color: "var(--color-coral-dark)",
                  }
                : {
                    borderColor: "var(--color-line)",
                    color: "var(--color-muted)",
                  }
            }
          >
            {a.specFilename}
            {a.csiSection ? ` · §${a.csiSection}` : ""}
          </Link>
        );
      })}
    </div>
  );
}

function ActiveAssignmentLine({ data }: { data: CompareData }) {
  return (
    <div className="text-[11px] text-[var(--color-muted)]">
      Submittal{" "}
      <span className="font-medium text-[var(--color-ink-soft)]">
        {data.submittal.filename}
      </span>{" "}
      · spec{" "}
      <span className="font-medium text-[var(--color-ink-soft)]">
        {data.activeAssignment.specFilename}
      </span>
      {data.activeAssignment.csiSection && (
        <>
          {" "}
          · <span className="font-mono">§{data.activeAssignment.csiSection}</span>
        </>
      )}
    </div>
  );
}

function CompareEmptyMessage({
  submittalId,
  reason,
}: {
  submittalId: string;
  reason: CompareEmptyReason;
}) {
  const messages: Record<CompareEmptyReason, { title: string; body: string; cta?: { href: string; label: string } }> = {
    submittal_not_found: {
      title: "Submittal not found",
      body: "The submittal in the URL doesn't exist in this project.",
    },
    submittal_not_assigned: {
      title: "Submittal not assigned to a spec yet",
      body: "Voltaic compares each submittal against the spec section it answers. Assign this submittal to a spec from the documents page.",
      cta: { href: "/docs", label: "Go to Documents" },
    },
    checklist_not_ready: {
      title: "Spec checklist not ready",
      body: "The assigned spec hasn't finished extracting its checklist yet. This usually finishes in under a minute. Refresh shortly.",
    },
    responses_not_ready: {
      title: "Submittal extraction in progress",
      body: "Voltaic is still reading the submittal against the spec checklist. Refresh in ~30 seconds.",
    },
  };
  const m = messages[reason];
  return (
    <div className="paper mx-auto mt-12 max-w-xl p-8 text-center">
      <h2 className="text-base font-semibold text-[var(--color-ink)]">
        {m.title}
      </h2>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{m.body}</p>
      {m.cta && (
        <div className="mt-6">
          <Link
            href={m.cta.href}
            className="inline-block rounded border border-[var(--color-line)] px-4 py-1.5 text-[12px] font-medium text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]"
          >
            {m.cta.label}
          </Link>
        </div>
      )}
      <div className="mt-4 text-[10px] text-[var(--color-muted-soft)] font-mono">
        submittal: {submittalId}
      </div>
    </div>
  );
}
