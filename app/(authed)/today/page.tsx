import { auth, clerkClient } from "@clerk/nextjs/server";
import { BlockerCard } from "@/components/today/BlockerCard";
import { ContradictionCard } from "@/components/today/ContradictionCard";
import { TrustFooter } from "@/components/today/TrustFooter";
import { listOpenFindingsForProject } from "@/lib/db/findings";
import { ensureWorkspace } from "@/lib/db/workspace";

/**
 * The Today view. v1 minimum cut per docs/DECISIONS.md U3:
 *   - Server-side fetch of open findings for the active project.
 *   - Group / sort by (severity, time-to-impact, confidence).
 *   - One card per finding; rule findings use BlockerCard, contradictions
 *     use ContradictionCard.
 *   - One click-through citation (document name + page).
 *   - Trust footer.
 *
 * Out of scope (see U3 / docs/HANDOFF.md): dismiss / acknowledge,
 * cross-version finding identity, multi-project nav, filter / search,
 * pinned answers, activity log. Those return when a design partner has
 * given feedback on this minimum cut.
 */
export default async function TodayPage() {
  const { orgId } = await auth();

  if (!orgId) {
    // The (authed) layout already short-circuits unauthed users to a
    // sign-in screen, but we belt-and-suspenders here so this page never
    // tries to query the DB without a tenant scope.
    return null;
  }

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });
  const { workspace, project } = await ensureWorkspace({
    clerkOrgId: orgId,
    orgName: org.name,
  });

  const findings = await listOpenFindingsForProject({
    workspaceId: workspace.id,
    projectId: project.id,
  });

  const counts = {
    hot: findings.filter((f) => f.severity === "hot").length,
    warm: findings.filter((f) => f.severity === "warm").length,
    cool: findings.filter((f) => f.severity === "cool").length,
  };

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-6xl space-y-8 px-8 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Today
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            AI-flagged issues from the latest analysis ·{" "}
            <span className="font-medium text-[var(--color-ink-soft)]">
              Engineer verification required before action
            </span>
          </p>
          {findings.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-[var(--color-muted-soft)]">
              <span>{findings.length} open</span>
              <span>·</span>
              <span className="tti hot">{counts.hot} HOT</span>
              <span className="tti warm">{counts.warm} WARM</span>
              <span className="tti cool">{counts.cool} COOL</span>
            </div>
          )}
        </div>

        {findings.length === 0 ? (
          <div className="paper p-8 text-center">
            <h2 className="text-base font-semibold text-[var(--color-ink)]">
              No issues flagged yet
            </h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Upload a Division 26 spec PDF and a matching submittal to start.
              Voltaic will run the analysis and surface install blockers here.
            </p>
            <div className="mt-6">
              <TrustFooter />
            </div>
          </div>
        ) : (
          <>
            <div>
              <div className="mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
                  What&apos;s blocking install
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">
                  Ranked by severity, then time-to-impact, then confidence.
                </p>
              </div>
              <div className="space-y-2">
                {findings.map((f) =>
                  f.kind === "contradiction" ? (
                    <ContradictionCard key={f.id} finding={f} />
                  ) : (
                    <BlockerCard key={f.id} finding={f} />
                  ),
                )}
              </div>
            </div>
            <TrustFooter />
          </>
        )}
      </div>
    </section>
  );
}
