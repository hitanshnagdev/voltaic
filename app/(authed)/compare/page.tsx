import { auth, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { CompareEmptyState } from "@/components/compare/CompareEmptyState";
import { CompareHeaderBar } from "@/components/compare/CompareHeaderBar";
import { CompareTableV2 } from "@/components/compare/CompareTableV2";
import { RunComplianceButton } from "@/components/compare/RunComplianceButton";
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
 * Layout matches the 2026-04-28 design mock:
 *   - Top bar: breadcrumb (Compare / 26 24 16 Panelboards), submittal
 *     selector, stats line, action buttons (Compile RFI, Approve as
 *     noted). Lives in CompareHeaderBar.
 *   - Optional second bar of assignment chips when a submittal has
 *     multiple spec assignments.
 *   - Main: CompareTableV2 with status pills + Filter button + dense
 *     row table (#, status dot, attribute w/ inline reasoning,
 *     required, submitted [red on flag], category, verify, ⋯).
 *
 * URL: /compare?submittal=<id>&spec=<id>
 *   - Defaults to the most-flagged submittal in the project.
 *   - When a submittal has multiple assignments, ?spec= picks which
 *     one drives the comparison; chips switch.
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
      <PageShell>
        <div className="px-6 py-8">
          <CompareEmptyState reason="no_equipment" />
        </div>
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
      <PageShell>
        <CompareHeaderBar
          submittals={submittals}
          selectedId={selected.id}
          data={null}
          projectName={project.name}
        />
        <div className="px-6 py-8">
          <CompareEmptyMessage
            submittalId={selected.id}
            reason={result.empty}
            activeAssignment={result.activeAssignment ?? null}
          />
        </div>
      </PageShell>
    );
  }

  const data = result;

  return (
    <PageShell>
      <CompareHeaderBar
        submittals={submittals}
        selectedId={selected.id}
        data={data}
        projectName={project.name}
      />
      {data.assignments.length > 1 && (
        <div className="border-b border-[var(--color-line)] bg-[var(--color-cream)] px-6 py-2">
          <AssignmentChips data={data} />
        </div>
      )}
      <div className="px-6 py-4">
        <CompareTableV2 data={data} />
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="scrollbar-thin flex flex-1 flex-col overflow-y-auto pb-12">
      {children}
    </section>
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

function CompareEmptyMessage({
  submittalId,
  reason,
  activeAssignment,
}: {
  submittalId: string;
  reason: CompareEmptyReason;
  activeAssignment: {
    specDocumentId: string;
    specFilename: string;
    csiSection: string | null;
  } | null;
}) {
  // For the assigned-but-not-yet-extracted cases, render the explicit
  // "Run Compliance" affordance. Compliance is now opt-in per pair —
  // the previous auto-fire-on-assignment behavior burned tokens
  // silently and gave the PM no agency over when the AI ran.
  if (
    (reason === "responses_not_ready" || reason === "checklist_not_ready") &&
    activeAssignment
  ) {
    const checklistStillParsing = reason === "checklist_not_ready";
    return (
      <div className="paper mx-auto mt-12 max-w-xl p-8 text-center">
        <h2 className="text-base font-semibold text-[var(--color-ink)]">
          Ready to run compliance
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {checklistStillParsing
            ? "The spec checklist is still being parsed. You can queue compliance now and Voltaic will start as soon as it's ready."
            : "Voltaic will read this submittal against the spec checklist and grade each requirement with citations. Takes ~30–60 seconds."}
        </p>
        <p className="mt-2 text-[11px] text-[var(--color-muted-soft)]">
          Pair: <span className="font-mono">{activeAssignment.specFilename}</span>
          {activeAssignment.csiSection && (
            <span className="font-mono"> · §{activeAssignment.csiSection}</span>
          )}
        </p>
        <div className="mt-6 flex justify-center">
          <RunComplianceButton
            submittalDocumentId={submittalId}
            specDocumentId={activeAssignment.specDocumentId}
            csiSection={activeAssignment.csiSection}
          />
        </div>
        <p className="mt-4 text-[10px] text-[var(--color-muted-soft)]">
          AI-flagged · Engineer verifies before action.
        </p>
      </div>
    );
  }

  const messages: Record<
    CompareEmptyReason,
    { title: string; body: string; cta?: { href: string; label: string } }
  > = {
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
      body: "The assigned spec hasn't finished extracting its checklist yet. Refresh shortly.",
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
