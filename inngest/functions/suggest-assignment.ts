import "server-only";
import { asc, eq } from "drizzle-orm";
import { inngest } from "@/inngest/client";
import {
  assignSubmittalToSpec,
  listSpecsForProject,
} from "@/lib/db/assignments";
import { db } from "@/lib/db/client";
import { documentPages } from "@/lib/db/schema";
import { suggestSpecAssignment } from "@/lib/rag/assign/suggest";

/**
 * Fire when a submittal is classified — ask Sonnet which spec section
 * the submittal most likely answers, persist as an `auto-suggested`
 * assignment that the user can confirm or override in the docs page
 * AssignModal.
 *
 * Sequenced after `parse-submittal` only loosely: we use the cover
 * text from `document_pages` (populated by `ingest-document`), not
 * the structured submittal_fields, because the goal is to identify
 * "what equipment is this submittal FOR" not "what are its values."
 * The cover text is enough to nail vendor + equipment type, which
 * usually maps unambiguously to a CSI section.
 *
 * No-op when:
 *   - The project has no specs yet (suggest needs candidates)
 *   - Sonnet returns confidence < 0.5 (don't surface low-trust suggestions)
 *   - An assignment already exists for this submittal (don't double-suggest)
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

    const result = await step.run("persist-assignment", async () => {
      // assignSubmittalToSpec is idempotent on the unique
      // (submittal, spec, csi_section) triple — re-running this
      // function (e.g. on retry, or after a re-classify) doesn't
      // create duplicates.
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
      specDocumentId: suggestion.specDocumentId,
      csiSection: suggestion.csiSection,
      confidence: suggestion.confidence,
    };
  },
);
