import { auth, clerkClient } from "@clerk/nextjs/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { transcripts } from "@/lib/db/schema";
import { ensureWorkspace } from "@/lib/db/workspace";
import { DocsClient } from "@/components/docs/DocsClient";
import { MeetingComposer } from "@/components/meetings/MeetingComposer";
import { UpcomingMeetings } from "@/components/meetings/UpcomingMeetings";
import { getGoogleIntegration } from "@/lib/integrations/google-store";

/**
 * Sources — pure intake (Phase 0 IA). Two lanes: Meetings (Google Calendar
 * connect + upcoming + transcript drop) and Specs & Submittals (the existing
 * DocsClient: upload, pairing, run compliance). Replaces Documents + Meetings.
 */

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-[var(--color-cream-deep)] text-[var(--color-muted)]",
  processing: "bg-[var(--color-gold-tint)] text-[#87602b]",
  ready: "bg-[var(--color-sage-tint)] text-[#3a5844]",
  failed: "bg-[var(--color-clay-tint)] text-[var(--color-clay)]",
};

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
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

  const [transcriptRows, googleIntegration, sp] = await Promise.all([
    db
      .select()
      .from(transcripts)
      .where(eq(transcripts.projectId, project.id))
      .orderBy(desc(transcripts.createdAt)),
    getGoogleIntegration(workspace.id),
    searchParams,
  ]);
  const googleStatus = sp.google ?? null;

  return (
    <section className="scrollbar-thin flex-1 overflow-y-auto pb-24">
      <div className="mx-auto max-w-6xl space-y-10 px-8 py-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-ink)]">
            Sources
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            What flows into Voltaic — meetings, specs, and submittals. Drop them
            in; findings surface in the Feed.
          </p>
        </div>

        {/* ── Lane: Meetings ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Meetings
          </h2>

          {googleStatus && (
            <div
              className={`rounded-lg px-4 py-2.5 text-[13px] ${
                googleStatus === "connected"
                  ? "bg-[var(--color-sage-tint)] text-[#3a5844]"
                  : "bg-[var(--color-clay-tint)] text-[var(--color-clay)]"
              }`}
            >
              {googleStatus === "connected"
                ? "Google Calendar connected."
                : googleStatus === "denied"
                  ? "Google connection was cancelled."
                  : "Couldn't connect Google Calendar — try again."}
            </div>
          )}

          {googleIntegration ? (
            <div className="paper p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-sage-tint)] text-[#3a5844]">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <div>
                    <div className="text-sm font-medium text-[var(--color-ink)]">
                      Google Calendar connected
                    </div>
                    <div className="text-[11px] text-[var(--color-muted-soft)]">
                      {googleIntegration.email ?? "—"}
                    </div>
                  </div>
                </div>
                <a
                  href="/api/integrations/google/connect"
                  className="text-[12px] text-[var(--color-muted)] underline hover:text-[var(--color-ink)]"
                >
                  Reconnect
                </a>
              </div>
              <UpcomingMeetings />
            </div>
          ) : (
            <div className="paper flex items-center justify-between p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-cream-deep)] text-[var(--color-muted)]">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--color-ink)]">
                    Connect Google Calendar
                  </div>
                  <div className="text-[11px] text-[var(--color-muted)]">
                    See your upcoming meetings here and drop in transcripts.
                  </div>
                </div>
              </div>
              <a href="/api/integrations/google/connect" className="btn-primary">
                Connect
              </a>
            </div>
          )}

          <MeetingComposer />

          {transcriptRows.length > 0 && (
            <div className="space-y-2">
              {transcriptRows.map((t) => (
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

        {/* ── Lane: Specs & Submittals ── */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-ink-soft)]">
            Specs &amp; Submittals
          </h2>
          <DocsClient />
        </div>
      </div>
    </section>
  );
}
