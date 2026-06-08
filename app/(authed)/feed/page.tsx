import { auth, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { BlockerCard } from "@/components/today/BlockerCard";
import { ContradictionCard } from "@/components/today/ContradictionCard";
import { TrustFooter } from "@/components/today/TrustFooter";
import { listOpenFindingsForProject } from "@/lib/db/findings";
import { ensureWorkspace } from "@/lib/db/workspace";

/**
 * Feed — the home surface (Phase 0 IA). One timeline: today's open findings
 * (rule + contradiction cards), a persistent Ask bar on top, and a sticky
 * signal summary so a fresh session always has a pulse. Replaces Today;
 * artifact-draft cards join this stream in a later phase.
 */
export default async function FeedPage() {
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
      <div className="mx-auto max-w-6xl space-y-6 px-8 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">Feed</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Everything happening on this project ·{" "}
            <span className="font-medium text-[var(--color-ink-soft)]">
              Engineer verification required before action
            </span>
          </p>
        </div>

        {/* Ask bar — opens the project chat */}
        <Link
          href="/agents"
          className="flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-paper)] px-4 py-3 text-sm text-[var(--color-muted)] transition-colors hover:border-[var(--color-coral-tint-2)] hover:bg-[var(--color-coral-tint)] hover:text-[var(--color-coral-dark)]"
        >
          <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Ask anything about this project — specs, submittals, decisions…
        </Link>

        {findings.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted-soft)]">
            <span>{findings.length} open</span>
            <span>·</span>
            <span className="tti hot">{counts.hot} HOT</span>
            <span className="tti warm">{counts.warm} WARM</span>
            <span className="tti cool">{counts.cool} COOL</span>
          </div>
        )}

        {findings.length === 0 ? (
          <div className="paper p-8 text-center">
            <h2 className="text-base font-semibold text-[var(--color-ink)]">
              No issues flagged yet
            </h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Add sources in the <span className="font-medium">Sources</span> tab
              — a Division 26 spec + a matching submittal, or a meeting transcript.
              Voltaic runs the analysis and surfaces blockers here.
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
