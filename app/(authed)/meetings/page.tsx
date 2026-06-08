import { auth, clerkClient } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { transcripts } from "@/lib/db/schema";
import { ensureWorkspace } from "@/lib/db/workspace";
import { MeetingComposer } from "@/components/meetings/MeetingComposer";
import { TrustFooter } from "@/components/today/TrustFooter";

/**
 * Meetings view. Paste a transcript → the ingest pipeline parses it into
 * utterances and the contradiction pass checks spoken rating decisions
 * against the project's specs. Contradictions surface in Today.
 *
 * v1 minimum: a composer + the list of transcripts with status. Live Google
 * Calendar / Meet sync is a later milestone.
 */

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[var(--color-cream-deep)] text-[var(--color-muted)]",
  processing: "bg-[var(--color-gold-tint)] text-[#87602b]",
  ready: "bg-[var(--color-sage-tint)] text-[#3a5844]",
  failed: "bg-[var(--color-clay-tint)] text-[var(--color-clay)]",
};

export default async function MeetingsPage() {
  const { orgId } = await auth();
  if (!orgId) return null;

  const client = await clerkClient();
  const org = await client.organizations.getOrganization({
    organizationId: orgId,
  });
  const { project } = await ensureWorkspace({
    clerkOrgId: orgId,
    orgName: org.name,
  });

  const rows = await db
    .select()
    .from(transcripts)
    .where(eq(transcripts.projectId, project.id))
    .orderBy(desc(transcripts.createdAt));

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-6xl space-y-8 px-8 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Meetings
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Drop in a meeting transcript · Voltaic turns decisions into findings
            and flags anything said that contradicts your specs ·{" "}
            <span className="font-medium text-[var(--color-ink-soft)]">
              Engineer verification required before action
            </span>
          </p>
        </div>

        <MeetingComposer />

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Transcripts
          </h2>
          {rows.length === 0 ? (
            <div className="paper p-8 text-center">
              <p className="text-sm text-[var(--color-muted)]">
                No transcripts yet. Paste one above — contradictions against your
                specs will appear in Today.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((t) => (
                <div
                  key={t.id}
                  className="paper flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[var(--color-ink)]">
                      {t.title ?? "Untitled meeting"}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[var(--color-muted-soft)]">
                      {t.sourceType.replace(/_/g, " ")} ·{" "}
                      {new Date(t.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                      STATUS_STYLE[t.status] ?? STATUS_STYLE.pending
                    }`}
                  >
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <TrustFooter />
      </div>
    </section>
  );
}
