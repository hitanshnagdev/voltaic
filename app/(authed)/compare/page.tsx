import { auth, clerkClient } from "@clerk/nextjs/server";
import { CompareEmptyState } from "@/components/compare/CompareEmptyState";
import { CompareEquipmentSelector } from "@/components/compare/CompareEquipmentSelector";
import { CompareTable } from "@/components/compare/CompareTable";
import { TrustFooter } from "@/components/today/TrustFooter";
import { buildCompareData, listEquipmentForCompare } from "@/lib/db/compare";
import { ensureWorkspace } from "@/lib/db/workspace";

/**
 * /compare — per-equipment compliance table.
 *
 * Per docs/DECISIONS.md U14, this supersedes the prior chat-based
 * Compare design entirely. Per U15, this page must read real data
 * from `submittal_fields` directly (no mocks) AND retrieve real spec
 * values for the requirement column (no hardcoded spec values). Per
 * the post-mortem: failure visibility is first-class — empty rows
 * render as MISSING with a one-line reason, the page surfaces a
 * specific empty state when there's nothing to compare.
 *
 * The "what to render" attribute list IS hardcoded per U12 Phase A
 * (panelboard expectation set). Phase B (the spec-checklist parser)
 * will make the attribute list itself spec-driven later.
 *
 * URL contract: `/compare?eq=<equipmentId>`. When `eq` is missing,
 * defaults to the first equipment in the project (sorted by
 * flagged-count desc).
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ eq?: string }>;
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

  const equipment = await listEquipmentForCompare({
    workspaceId: workspace.id,
    projectId: project.id,
  });

  if (equipment.length === 0) {
    return (
      <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
          <Header projectName={project.name} />
          <CompareEmptyState reason="no_equipment" />
        </div>
      </section>
    );
  }

  const params = await searchParams;
  const requestedId = params.eq;
  const selected = requestedId
    ? equipment.find((e) => e.id === requestedId) ?? equipment[0]
    : equipment[0];

  const data = await buildCompareData({
    workspaceId: workspace.id,
    projectId: project.id,
    equipmentId: selected.id,
  });

  if (!data) {
    return (
      <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
        <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
          <Header projectName={project.name} />
          <CompareEmptyState
            reason="equipment_not_found"
            detail={requestedId ? `equipmentId=${requestedId}` : undefined}
          />
        </div>
      </section>
    );
  }

  const matchPct =
    data.summary.evaluatedCount > 0
      ? Math.round(
          (data.summary.passCount / data.summary.evaluatedCount) * 100,
        )
      : null;

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-5xl space-y-6 px-8 py-8">
        <Header projectName={project.name} />

        {/* Equipment + summary row */}
        <div className="paper flex flex-wrap items-center gap-4 px-4 py-3">
          <CompareEquipmentSelector
            equipment={equipment}
            selectedId={selected.id}
          />
          <div className="text-[12px] text-[var(--color-muted)]">
            <span className="font-medium text-[var(--color-ink-soft)]">
              {data.equipment.category}
            </span>
            {data.equipment.csiSections.length > 0 && (
              <>
                {" · "}
                <span className="font-mono text-[11px]">
                  CSI {data.equipment.csiSections.join(", ")}
                </span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3 text-[12px]">
            {matchPct !== null && (
              <span className="text-[var(--color-ink-soft)]">
                <span
                  className="font-mono text-[15px] font-semibold"
                  style={{
                    color:
                      matchPct >= 80
                        ? "#3a5844"
                        : matchPct >= 50
                          ? "#87602B"
                          : "var(--color-clay)",
                  }}
                >
                  {matchPct}%
                </span>{" "}
                <span className="text-[var(--color-muted)]">match</span>
              </span>
            )}
            {data.summary.flaggedCount > 0 && (
              <span
                className="font-mono text-[11px] font-semibold"
                style={{ color: "var(--color-clay)" }}
              >
                · {data.summary.flaggedCount} flagged
              </span>
            )}
            <span className="text-[var(--color-muted-soft)]">
              · {data.summary.evaluatedCount} of {data.summary.totalCount}{" "}
              evaluated
            </span>
          </div>
        </div>

        {/* CTAs (stub — UI only, no behavior; tracked for Phase C) */}
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
      </div>
    </section>
  );
}

function Header({ projectName }: { projectName: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
        Compare
      </h1>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Per-equipment compliance against the spec ·{" "}
        <span className="font-medium text-[var(--color-ink-soft)]">
          {projectName}
        </span>{" "}
        ·{" "}
        <span className="italic">Engineer verification required before action</span>
      </p>
    </div>
  );
}
