import { auth, clerkClient } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrustFooter } from "@/components/today/TrustFooter";
import { CopyArtifactButton } from "@/components/outputs/CopyArtifactButton";
import { ensureWorkspace } from "@/lib/db/workspace";
import {
  getArtifact,
  type ComplianceReportContent,
  type RfiContent,
} from "@/lib/db/artifacts";

const TYPE_LABEL: Record<string, string> = {
  rfi: "RFI",
  compliance_report: "Compliance report",
  change_order: "Change order",
  recap_email: "Recap email",
  filled_template: "Template",
};

const SEV_CLASS: Record<string, string> = {
  hot: "severity-high",
  warm: "severity-medium",
  cool: "severity-low",
};

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

  const isReport = artifact.type === "compliance_report";

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
            <span className="rounded-full bg-[var(--color-coral-tint)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-coral-dark)]">
              {TYPE_LABEL[artifact.type] ?? artifact.type} · Draft
            </span>
            <h1 className="mt-2 text-xl font-semibold text-[var(--color-ink)]">
              {artifact.title}
            </h1>
          </div>
          <CopyArtifactButton text={plainText(artifact.type, artifact.content)} />
        </div>

        {isReport ? (
          <ComplianceReportView content={artifact.content as unknown as ComplianceReportContent} />
        ) : (
          <RfiView content={artifact.content as unknown as RfiContent} fallbackTitle={artifact.title} />
        )}

        <TrustFooter />
      </div>
    </section>
  );
}

/* ── RFI ── */
function RfiView({ content, fallbackTitle }: { content: RfiContent; fallbackTitle: string }) {
  const refs = content.references ?? [];
  return (
    <div className="paper space-y-5 p-6">
      <Field label="Subject" value={content.subject ?? fallbackTitle} />
      {content.equipment && <Field label="Equipment" value={content.equipment} />}
      <Field label="Question" value={content.question ?? ""} />
      <Field label="Rationale" value={content.rationale ?? ""} />
      <References refs={refs} />
    </div>
  );
}

/* ── Compliance report ── */
function ComplianceReportView({ content }: { content: ComplianceReportContent }) {
  const counts = content.counts ?? { hot: 0, warm: 0, cool: 0, total: 0 };
  const rows = content.rows ?? [];
  return (
    <div className="paper space-y-5 p-6">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-[var(--color-muted)]">{counts.total} findings</span>
        <span className="tti hot">{counts.hot} HOT</span>
        <span className="tti warm">{counts.warm} WARM</span>
        <span className="tti cool">{counts.cool} COOL</span>
      </div>

      {rows.length === 0 ? (
        <div className="text-[13px] text-[var(--color-muted)]">
          No open findings at the time of this report.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-line)]">
          {rows.map((r, i) => (
            <div
              key={i}
              className="border-t border-[var(--color-line)] px-4 py-3 first:border-t-0"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEV_CLASS[r.severity] ?? ""}`}>
                  {r.severity?.toUpperCase()}
                </span>
                <span className="font-mono text-[12px] text-[var(--color-ink)]">
                  {r.equipment}
                </span>
                <span className="text-sm font-medium text-[var(--color-ink)]">
                  {r.title}
                </span>
              </div>
              <div className="mt-1 text-[12px] text-[var(--color-ink-soft)]">
                {r.summary}
              </div>
              {r.references.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.references.map((ref, j) => (
                    <span
                      key={j}
                      className="rounded border border-[var(--color-line)] bg-[var(--color-cream-deep)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-muted)]"
                    >
                      {ref.label}
                      {ref.documentName ? ` · ${ref.documentName}` : ""}
                      {ref.pageNum != null ? ` p.${ref.pageNum}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function References({
  refs,
}: {
  refs: RfiContent["references"];
}) {
  return (
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

function plainText(type: string, raw: unknown): string {
  if (type === "compliance_report") {
    const c = raw as ComplianceReportContent;
    const counts = c.counts ?? { hot: 0, warm: 0, cool: 0, total: 0 };
    return [
      "Compliance Report",
      `${counts.total} findings — ${counts.hot} HOT · ${counts.warm} WARM · ${counts.cool} COOL`,
      "",
      ...(c.rows ?? []).map(
        (r) =>
          `- [${(r.severity ?? "").toUpperCase()}] ${r.equipment} — ${r.title} (${r.verdict}): ${r.summary}`,
      ),
    ].join("\n");
  }
  const c = raw as RfiContent;
  return [
    `RFI — ${c.subject ?? ""}`,
    c.equipment ? `Equipment: ${c.equipment}` : "",
    "",
    `Question: ${c.question ?? ""}`,
    "",
    `Rationale: ${c.rationale ?? ""}`,
    "",
    "References:",
    ...(c.references ?? []).map(
      (r) =>
        `- [${r.label}] ${r.documentName ?? "—"}${r.pageNum != null ? ` p.${r.pageNum}` : ""}${r.snippet ? `: ${r.snippet}` : ""}`,
    ),
  ].join("\n");
}
