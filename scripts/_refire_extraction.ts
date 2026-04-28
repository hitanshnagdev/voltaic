import "dotenv/config";
import postgres from "postgres";

/**
 * One-shot: re-fire the `submittal/extract-against-checklist-ready`
 * event for every existing assignment in a target database. Use after
 * a PR that changes the extractor logic (and bumps CACHE_PURPOSE) to
 * regenerate `submittal_checklist_responses` rows.
 *
 * Usage:
 *   INNGEST_EVENT_KEY='<key>' DATABASE_URL='<env>' \
 *     npx tsx scripts/_refire_extraction.ts
 *
 * Sends events through Inngest's HTTP event API directly (no SDK
 * import — the SDK pulls in server-only modules). Requires
 * INNGEST_EVENT_KEY to be set; without it Inngest's free tier rejects.
 *
 * Filename starts with `_` so the operator notices it's a one-shot
 * tool. Safe to run repeatedly: the runner is idempotent (INSERT-on-
 * conflict-DO-NOTHING + DELETE-by-NOT-IN), so duplicate fires converge.
 *
 * Prints estimated cost before sending so the operator can abort.
 */

const ESTIMATED_COST_PER_SUBMITTAL_USD = 0.3;

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }
  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey) {
    console.error("INNGEST_EVENT_KEY not set — required to fire events");
    process.exit(1);
  }
  const sql = postgres(dbUrl, { max: 1 });

  try {
    const rows = await sql<
      Array<{
        submittal_document_id: string;
        spec_document_id: string;
        csi_section: string | null;
        workspace_id: string;
        project_id: string;
      }>
    >`
      SELECT a.submittal_document_id,
             a.spec_document_id,
             a.csi_section,
             a.workspace_id,
             d.project_id
      FROM submittal_spec_assignments a
      JOIN documents d ON d.id = a.submittal_document_id
    `;

    console.log(`found ${rows.length} assignment(s)`);
    console.log(
      `estimated cost: ~$${(rows.length * ESTIMATED_COST_PER_SUBMITTAL_USD).toFixed(2)} ` +
        `(at ~$${ESTIMATED_COST_PER_SUBMITTAL_USD.toFixed(2)} per submittal-extraction with batching + PDF caching)`,
    );

    if (process.env.DRY_RUN === "1") {
      console.log("\nDRY_RUN=1 — skipping event sends. Set DRY_RUN=0 to fire.");
      for (const r of rows) {
        console.log(
          `  would fire: submittal=${r.submittal_document_id} spec=${r.spec_document_id} csi=${r.csi_section ?? "(any)"}`,
        );
      }
      return;
    }

    let sent = 0;
    for (const r of rows) {
      const res = await fetch(`https://inn.gs/e/${eventKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "submittal/extract-against-checklist-ready",
          data: {
            submittalDocumentId: r.submittal_document_id,
            specDocumentId: r.spec_document_id,
            csiSection: r.csi_section,
            workspaceId: r.workspace_id,
            projectId: r.project_id,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `  FAIL submittal=${r.submittal_document_id} status=${res.status} body=${body.slice(0, 200)}`,
        );
        continue;
      }
      sent++;
      console.log(
        `  fired: submittal=${r.submittal_document_id} csi=${r.csi_section ?? "(any)"}`,
      );
    }

    console.log(`\nfired ${sent} of ${rows.length}`);
    console.log(
      "watch progress: Inngest dashboard → submittal/extract-against-checklist-ready",
    );
  } finally {
    await sql.end({ timeout: 2 });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
