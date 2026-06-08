import { auth, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { BlockerCard } from "@/components/today/BlockerCard";
import { ContradictionCard } from "@/components/today/ContradictionCard";
import { TrustFooter } from "@/components/today/TrustFooter";
import { ArtifactCard } from "@/components/feed/ArtifactCard";
import { DraftRfiButton } from "@/components/feed/DraftRfiButton";
import { DraftComplianceButton } from "@/components/feed/DraftComplianceButton";
import {
  listOpenFindingsForProject,
  type FindingForToday,
} from "@/lib/db/findings";
import { listArtifactsForProject } from "@/lib/db/artifacts";
import type { Artifact } from "@/lib/db/schema";
import { ensureWorkspace } from "@/lib/db/workspace";

/**
 * Feed — the home surface. One reverse-chronological stream of cards:
 * Findings (solid severity border) + Artifact drafts (dashed coral border).
 * Ask bar on top; severity signal summary so a fresh session has a pulse.
 */

type FeedItem =
  | { kind: "finding"; at: number; finding: FindingForToday }
  | { kind: "artifact"; at: number; artifact: Artifact };

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

  const [findings, artifactRows] = await Promise.all([
    listOpenFindingsForProject({
      workspaceId: workspace.id,
      projectId: project.id,
    }),
    listArtifactsForProject({
      workspaceId: workspace.id,
      projectId: project.id,
    }),
  ]);

  const counts = {
    hot: findings.filter((f) => f.severity === "hot").length,
    warm: findings.filter((f) => f.severity === "warm").length,
    cool: findings.filter((f) => f.severity === "cool").length,
  };

  const items: FeedItem[] = [
    ...findings.map((f) => ({
      kind: "finding" as const,
      at: new Date(f.createdAt).getTime(),
      finding: f,
    })),
    ...artifactRows.map((a) => ({
      kind: "artifact" as const,
      at: new Date(a.createdAt).getTime(),
      artifact: a,
    })),
  ].sort((x, y) => y.at - x.at);

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
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted-soft)]">
              <span>{findings.length} open</span>
              <span>·</span>
              <span className="tti hot">{counts.hot} HOT</span>
              <span className="tti warm">{counts.warm} WARM</span>
              <span className="tti cool">{counts.cool} COOL</span>
            </div>
            <DraftComplianceButton />
          </div>
        )}

        {items.length === 0 ? (
          <div className="paper p-8 text-center">
            <h2 className="text-base font-semibold text-[var(--color-ink)]">
              Nothing here yet
            </h2>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Add sources in the <span className="font-medium">Sources</span> tab
              — a spec + a matching submittal, or a meeting transcript. Findings
              and drafted documents surface here.
            </p>
            <div className="mt-6">
              <TrustFooter />
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) =>
                item.kind === "artifact" ? (
                  <ArtifactCard key={`a-${item.artifact.id}`} artifact={item.artifact} />
                ) : (
                  <div key={`f-${item.finding.id}`}>
                    {item.finding.kind === "contradiction" ? (
                      <ContradictionCard finding={item.finding} />
                    ) : (
                      <BlockerCard finding={item.finding} />
                    )}
                    <div className="mt-1 flex justify-end">
                      <DraftRfiButton findingId={item.finding.id} />
                    </div>
                  </div>
                ),
              )}
            </div>
            <TrustFooter />
          </>
        )}
      </div>
    </section>
  );
}
