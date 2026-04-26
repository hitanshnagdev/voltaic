import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db/client";
import { llmCalls } from "@/lib/db/schema";
import { estimateCostUsd } from "@/lib/llm/pricing";

export type Purpose =
  | "classify"
  | "extract_equipment"
  | "parse_spec"
  | "parse_submittal"
  | "finding_interpretive"
  | "finding_consensus"
  | "chat"
  | "embed_spec_paragraph";

export type LogCtx = {
  workspaceId: string;
  projectId?: string | null;
};

let _anthropic: Anthropic | undefined;
function anthropic(): Anthropic {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

async function logCall(args: {
  ctx: LogCtx;
  provider: "anthropic";
  model: string;
  purpose: Purpose;
  tokensIn?: number;
  tokensOut?: number;
  imageCount?: number;
  latencyMs: number;
  error?: string;
  meta?: Record<string, unknown>;
}) {
  const costUsd =
    args.tokensIn != null && args.tokensOut != null
      ? estimateCostUsd(args.model, args.tokensIn, args.tokensOut)
      : null;
  await db.insert(llmCalls).values({
    workspaceId: args.ctx.workspaceId,
    projectId: args.ctx.projectId ?? null,
    provider: args.provider,
    model: args.model,
    purpose: args.purpose,
    tokensIn: args.tokensIn ?? null,
    tokensOut: args.tokensOut ?? null,
    imageCount: args.imageCount ?? 0,
    costUsd: costUsd != null ? costUsd.toString() : null,
    latencyMs: args.latencyMs,
    error: args.error ?? null,
    meta: args.meta ?? null,
  });
}

function extractJson<T>(text: string): T {
  const trimmed = text.trim();
  // Sometimes models wrap JSON in fences. Strip them.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const raw = fenced ? fenced[1] : trimmed;
  return JSON.parse(raw) as T;
}

export async function classify<T>(args: {
  system: string;
  user: string;
  model?: string;
  ctx: LogCtx;
  maxTokens?: number;
  /**
   * Cost-log purpose. Defaults to "classify" — the original use case
   * was Haiku doc-type classification. Pass "parse_spec" for spec
   * checklist extraction, "finding_interpretive" for rule overlays,
   * etc., so the cost meter separates spend correctly.
   */
  purpose?: Purpose;
}): Promise<T> {
  const model = args.model ?? "claude-haiku-4-5";
  const purpose = args.purpose ?? "classify";
  const start = Date.now();
  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: args.maxTokens ?? 512,
      system: args.system,
      messages: [{ role: "user", content: args.user }],
    });
    const latencyMs = Date.now() - start;
    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("no text in response");
    }
    const parsed = extractJson<T>(textBlock.text);
    await logCall({
      ctx: args.ctx,
      provider: "anthropic",
      model,
      purpose,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      latencyMs,
    });
    return parsed;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    await logCall({
      ctx: args.ctx,
      provider: "anthropic",
      model,
      purpose,
      latencyMs,
      error: msg,
    });
    throw err;
  }
}

/**
 * Vision extraction — pass one or more images plus a prompt, get structured
 * JSON back. Used by submittal field extraction and (future) drawing
 * annotation extraction.
 *
 * Logs to llm_calls with imageCount populated so the cost meter can
 * separate vision spend from text spend.
 */
export type VisionImage = {
  /** "image/png" or "image/jpeg" — anything Anthropic vision accepts. */
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  /** Base64-encoded image bytes. No data: prefix. */
  data: string;
};

/**
 * Document extraction — pass a PDF directly to Claude's vision model
 * via the document content block. Sonnet renders the PDF internally,
 * which avoids every server-side rendering pitfall on Node serverless
 * (missing fonts, fontconfig gaps, file:// URL bugs in pdfjs).
 *
 * Useful for submittal cut sheets where the structural data lives in
 * tables and rendered layout — Sonnet sees the PDF the same way a
 * human reviewer would, no intermediate raster step we have to keep
 * in sync with whatever the model expects.
 */
export type DocumentInput = {
  /** Currently only "application/pdf" is supported by the API. */
  mediaType: "application/pdf";
  /** Base64-encoded PDF bytes. No data: prefix. */
  data: string;
};

/**
 * One PDF citation returned by Anthropic's citations API. Pages are
 * 1-indexed; `endPageNumber` is exclusive (the docs are explicit about
 * this — a citation spanning only page 4 has start=4, end=5).
 */
export type DocumentPageCitation = {
  type: "page_location";
  citedText: string;
  documentIndex: number;
  documentTitle: string | null;
  startPageNumber: number;
  endPageNumber: number;
};

export type DocumentExtractResult<T> = {
  data: T;
  citations: DocumentPageCitation[];
};

export async function documentExtract<T>(args: {
  system: string;
  prompt: string;
  pdf: DocumentInput;
  ctx: LogCtx;
  purpose: Purpose;
  model?: string;
  maxTokens?: number;
  /**
   * When true, set `citations.enabled` on the document block. Sonnet
   * splits the response into multiple text blocks where each cited
   * span is its own block with a `citations` array attached. We
   * concatenate text blocks and collect citations into a flat array.
   * Costs a few extra input tokens; `cited_text` is free.
   */
  enableCitations?: boolean;
  /** Optional document title — surfaced inside Sonnet's reasoning, not cited from. */
  documentTitle?: string;
}): Promise<DocumentExtractResult<T>> {
  const model = args.model ?? "claude-sonnet-4-6";
  const start = Date.now();
  // Build the document block. Cast to `any` because the SDK types lag
  // the citations API field by a few releases — the shape we send
  // matches what the API accepts (verified against the docs example).
  const documentBlock: Record<string, unknown> = {
    type: "document",
    source: {
      type: "base64",
      media_type: args.pdf.mediaType,
      data: args.pdf.data,
    },
  };
  if (args.documentTitle) documentBlock.title = args.documentTitle;
  if (args.enableCitations) documentBlock.citations = { enabled: true };
  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: args.maxTokens ?? 2048,
      system: args.system,
      messages: [
        {
          role: "user",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          content: [documentBlock as any, { type: "text", text: args.prompt }],
        },
      ],
    });
    const latencyMs = Date.now() - start;
    // With citations enabled, the response interleaves text blocks and
    // cited-span text blocks. Concatenate all text blocks before
    // parsing JSON — picking just the first one would truncate the
    // payload at the first citation boundary.
    const textBlocks = res.content.filter(
      (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
    );
    if (textBlocks.length === 0) {
      throw new Error("no text in response");
    }
    const fullText = textBlocks.map((b) => b.text).join("");
    const citations = collectPageCitations(textBlocks);
    const parsed = extractJson<T>(fullText);
    await logCall({
      ctx: args.ctx,
      provider: "anthropic",
      model,
      purpose: args.purpose,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      latencyMs,
    });
    return { data: parsed, citations };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    await logCall({
      ctx: args.ctx,
      provider: "anthropic",
      model,
      purpose: args.purpose,
      latencyMs,
      error: msg,
    });
    throw err;
  }
}

/**
 * Pull `page_location` citations off a list of text blocks and convert
 * to our camel-cased shape. Other citation types (`char_location`,
 * `content_block_location`) only appear for plain-text or custom-content
 * documents; we don't request those here, so they're filtered out.
 *
 * Exported for unit tests.
 */
export function collectPageCitations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  textBlocks: Array<{ citations?: any[] | null }>,
): DocumentPageCitation[] {
  const out: DocumentPageCitation[] = [];
  for (const block of textBlocks) {
    if (!block.citations) continue;
    for (const c of block.citations) {
      if (c?.type !== "page_location") continue;
      out.push({
        type: "page_location",
        citedText: String(c.cited_text ?? ""),
        documentIndex: Number(c.document_index ?? 0),
        documentTitle:
          typeof c.document_title === "string" ? c.document_title : null,
        startPageNumber: Number(c.start_page_number ?? 1),
        endPageNumber: Number(c.end_page_number ?? 1),
      });
    }
  }
  return out;
}

export async function visionExtract<T>(args: {
  system: string;
  prompt: string;
  images: VisionImage[];
  ctx: LogCtx;
  purpose: Purpose;
  model?: string;
  maxTokens?: number;
}): Promise<T> {
  const model = args.model ?? "claude-sonnet-4-6";
  const start = Date.now();
  const imageBlocks = args.images.map(
    (img) =>
      ({
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: img.mediaType,
          data: img.data,
        },
      }) as const,
  );
  try {
    const res = await anthropic().messages.create({
      model,
      max_tokens: args.maxTokens ?? 2048,
      system: args.system,
      messages: [
        {
          role: "user",
          content: [
            ...imageBlocks,
            { type: "text", text: args.prompt },
          ],
        },
      ],
    });
    const latencyMs = Date.now() - start;
    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("no text in response");
    }
    const parsed = extractJson<T>(textBlock.text);
    await logCall({
      ctx: args.ctx,
      provider: "anthropic",
      model,
      purpose: args.purpose,
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      imageCount: args.images.length,
      latencyMs,
    });
    return parsed;
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    await logCall({
      ctx: args.ctx,
      provider: "anthropic",
      model,
      purpose: args.purpose,
      imageCount: args.images.length,
      latencyMs,
      error: msg,
    });
    throw err;
  }
}
