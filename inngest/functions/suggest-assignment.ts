import "server-only";
import { asc, eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import {
  assignSubmittalToSpec,
  listSpecsForProject,
} from "@/lib/db/assignments";
import { db } from "@/lib/db/client";
import { documentPages } from "@/lib/db/schema";
import {
  extractCsiCrossRefs,
  matchCrossRefAgainstSpecs,
} from "@/lib/rag/assign/crossref";
import { suggestSpecAssignment } from "@/lib/rag/assign/suggest";

/**
 * Two-tier matcher fired when a submittal is classified.
 *
 * Tier 1 — *cross-ref confirmed* (deterministic, free):
 *   The submittal's cover text literally cites a CSI section (e.g.
 *   "Spec Section: 26 24 16" on a transmittal stamp), and that
 *   section appears in some project spec's resolved identity. That's
 *   direct textual evidence of pairing. Persisted as `auto-applied`
 *   — the strongest auto signal short of a manual pick.
 *
 * Tier 2 — *cover-text similarity* (Sonnet, paid):
 *   Falls through when no cross-ref hits. Sonnet looks at "what is
 *   this submittal *about*" and maps to a likely CSI section based
 *   on equipment type. Persisted as `auto-suggested` — the PM
 *   confirms / rejects in the docs UI.
 *
 * No-op when:
 *   - The project has no specs yet (no candidates to match against).
 *   - Cover text is empty.
 *   - Sonnet returns confidence < 0.5 (suggest only above threshold).
 *
 * Idempotent on the unique (submittal, spec, csi_section) triple, so
 * re-firing on retry doesn't double-suggest.
 */

type SubmittalClassifiedEvent = {
  documentId: string;
  workspaceId: string;
  projectId: string;
};

const COVER_PAGES = 3;

export const suggestSpecAssignmentForSubmittal = inngest.createFunction(
  {
    id: "suggest-spec-assignment",
    name: "Suggest spec assignment for submittal",
    retries: 2,
    concurrency: { limit: 4 },
    triggers: [{ event: "document/submittal-classified" }],
  },
  async ({ event, step }) => {
    const { documentId, workspaceId, projectId } =
      event.data as SubmittalClassifiedEvent;

    const cover = await step.run("load-cover-text", async () => {
      const rows = await db
        .select({
          pageNum: documentPages.pageNum,
          textContent: documentPages.textContent,
        })
        .from(documentPages)
        .where(eq(documentPages.documentId, documentId))
        .orderBy(asc(documentPages.pageNum))
        .limit(COVER_PAGES);
      return rows
        .map((r) => r.textContent ?? "")
        .filter((t) => t.length > 0)
        .join("\n\n");
    });

    if (cover.trim().length === 0) {
      return { documentId, skipped: "no_cover_text" };
    }

    const candidates = await step.run("load-spec-candidates", async () => {
      return listSpecsForProject({ workspaceId, projectId });
    });

    if (candidates.length === 0) {
      return { documentId, skipped: "no_specs_in_project" };
    }

    // Tier 1: deterministic cross-ref. If the submittal cites a CSI
    // section that matches a project spec, that's the strongest auto
    // signal — skip the Sonnet call entirely and persist as
    // `auto-applied`.
    const refs = extractCsiCrossRefs(cover);
    const crossRef = refs.length
      ? matchCrossRefAgainstSpecs({ refs, candidates })
      : null;

    if (crossRef) {
      const result = await step.run("persist-crossref-assignment", async () => {
        return assignSubmittalToSpec({
          workspaceId,
          submittalDocumentId: documentId,
          specDocumentId: crossRef.specDocumentId,
          csiSection: crossRef.csiSection,
          source: "auto-applied",
          confidence: 0.99,
          notes: `Cross-reference to §${crossRef.csiSection} found in submittal cover.`,
        });
      });
      return {
        documentId,
        assignmentId: result.id,
        created: result.created,
        tier: "cross-ref",
        specDocumentId: crossRef.specDocumentId,
        csiSection: crossRef.csiSection,
      };
    }

    // Tier 2: Sonnet cover-text similarity. Lower-trust → user
    // confirms in the docs UI before compliance runs.
    const suggestion = await step.run("ask-sonnet", async () => {
      return suggestSpecAssignment({
        coverText: cover,
        candidates,
        ctx: { workspaceId, projectId },
      });
    });

    if (!suggestion) {
      return { documentId, skipped: "no_confident_match" };
    }

    const result = await step.run("persist-suggested-assignment", async () => {
      return assignSubmittalToSpec({
        workspaceId,
        submittalDocumentId: documentId,
        specDocumentId: suggestion.specDocumentId,
        csiSection: suggestion.csiSection,
        source: "auto-suggested",
        confidence: suggestion.confidence,
        notes: suggestion.rationale || null,
      });
    });

    return {
      documentId,
      assignmentId: result.id,
      created: result.created,
      tier: "cover-text",
      specDocumentId: suggestion.specDocumentId,
      csiSection: suggestion.csiSection,
      confidence: suggestion.confidence,
    };
  },
);
