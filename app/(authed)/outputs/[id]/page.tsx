import { auth, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrustFooter } from "@/components/today/TrustFooter";
import { CopyArtifactButton } from "@/components/outputs/CopyArtifactButton";
import { ensureWorkspace } from "@/lib/db/workspace";
import { getArtifact, type RfiContent } from "@/lib/db/artifacts";

/** Artifact detail — Chunk 1 renders the RFI with citations + copy/export. */
export default async function ArtifactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { orgId } = await auth();
  if (!orgId) return null;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });
  const { workspace } = await ensureWorkspace({
    clerkOrgId: orgId,
    orgName: org.name,
  });

  const { id } = await params;
  const artifact = await getArtifact({ workspaceId: workspace.id, id });
  if (!artifact) notFound();

  const rfi = artifact.content as unknown as RfiContent;
  const refs = rfi.references ?? [];

  const plain = [
    `RFI — ${rfi.subject ?? artifact.title}`,
    rfi.equipment ? `Equipment: ${rfi.equipment}` : "",
    "",
    `Question: ${rfi.question ?? ""}`,
    "",
    `Rationale: ${rfi.rationale ?? ""}`,
    "",
    "References:",
    ...refs.map(
      (r) =>
        `- [${r.label}] ${r.documentName ?? "—"}${r.pageNum != null ? ` p.${r.pageNum}` : ""}${r.snippet ? `: ${r.snippet}` : ""}`,
    ),
  ]
    .filter((l) => l !== undefined)
    .join("\n");

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-3xl space-y-6 px-8 py-8">
        <Link
          href="/outputs"
          className="inline-flex items-center gap-1 text-[12px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
        >
          ← Outputs
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[var(--color-coral-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-coral-dark)]">
                RFI · Draft
              </span>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">
              {artifact.title}
            </h1>
          </div>
          <CopyArtifactButton text={plain} />
        </div>

        <div className="paper space-y-5 p-6">
          <Field label="Subject" value={rfi.subject ?? artifact.title} />
          {rfi.equipment && <Field label="Equipment" value={rfi.equipment} />}
          <Field label="Question" value={rfi.question ?? ""} />
          <Field label="Rationale" value={rfi.rationale ?? ""} />

          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
              References
            </div>
            {refs.length === 0 ? (
              <div className="text-[13px] text-[var(--color-muted-soft)]">
                No cited sources on the underlying finding.
              </div>
            ) : (
              <div className="space-y-2">
                {refs.map((r, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--color-line)] bg-[var(--color-cream-deep)] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-[11px] font-medium text-[var(--color-ink-soft)]">
                      <span className="rounded bg-[var(--color-paper)] px-1.5 py-0.5 font-mono text-[10px]">
                        {r.label}
                      </span>
                      <span>{r.documentName ?? "—"}</span>
                      {r.pageNum != null && <span>· p.{r.pageNum}</span>}
                    </div>
                    {r.snippet && (
                      <div className="mt-1 text-[12px] italic text-[var(--color-muted)]">
                        “{r.snippet}”
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <TrustFooter />
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </div>
      <div className="text-[14px] leading-relaxed text-[var(--color-ink)]">
        {value}
      </div>
    </div>
  );
}
