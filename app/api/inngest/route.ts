import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { analyzeEnclosure } from "@/inngest/functions/analyze-enclosure";
import { analyzeProject } from "@/inngest/functions/analyze-project";
import { analyzeSccr } from "@/inngest/functions/analyze-sccr";
import { embedSpecParagraphs } from "@/inngest/functions/embed-spec-paragraphs";
import { ingestDocument } from "@/inngest/functions/ingest-document";
import { parseSpecDocument } from "@/inngest/functions/parse-spec";
import { parseSubmittalDocument } from "@/inngest/functions/parse-submittal";

export const runtime = "nodejs";
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ingestDocument,
    parseSpecDocument,
    parseSubmittalDocument,
    embedSpecParagraphs,
    analyzeProject,
    analyzeSccr,
    analyzeEnclosure,
  ],
});
