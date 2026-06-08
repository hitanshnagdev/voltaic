import { auth, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { ensureWorkspace } from "@/lib/db/workspace";
import { listArtifactsForProject } from "@/lib/db/artifacts";

/**
 * Outputs — the shelf of drafted deliverables. Real artifacts now (RFIs in
 * Chunk 1); honest empty state when there are none.
 */

const TYPE_LABEL: Record<string, string> = {
  rfi: "RFI",
  compliance_report: "Compliance report",
  change_order: "Change order",
  recap_email: "Recap email",
  filled_template: "Template",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  reviewed: "Reviewed",
  sent: "Sent",
  exported: "Exported",
};

export default async function OutputsPage() {
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

  const artifacts = await listArtifactsForProject({
    workspaceId: workspace.id,
    projectId: project.id,
  });

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-6xl space-y-8 px-8 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Outputs
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Everything Voltaic drafts for you — review, edit, and send or export.
          </p>
        </div>

        {artifacts.length === 0 ? (
          <div className="paper p-8 text-center">
            <h2 className="text-base font-semibold text-[var(--color-ink)]">
              Nothing drafted yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
              Open a finding in the Feed and hit <span className="font-medium">Draft RFI</span> —
              the drafted document lands here for review. Drafts only; you always
              send.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {artifacts.map((a) => (
              <Link
                key={a.id}
                href={`/outputs/${a.id}`}
                className="paper flex items-center justify-between px-4 py-3 transition-colors hover:border-[var(--color-coral-tint-2)]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[var(--color-coral-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-coral-dark)]">
                      {TYPE_LABEL[a.type] ?? a.type}
                    </span>
                    <span className="truncate text-sm font-medium text-[var(--color-ink)]">
                      {a.title}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[var(--color-muted-soft)]">
                    {new Date(a.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-muted)]">
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
