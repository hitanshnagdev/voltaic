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

/**
 * Strip optional code fences and parse JSON. Exported for unit tests
 * — the function is small but its truncation-handling matters: Sonnet
 * occasionally hits max_tokens mid-response and returns an unclosed
 * fence that crashes a strict regex parser. Real failure caught
 * running parse-spec-checklist on the demo spec at max_tokens=1500.
 */
export function extractJson<T>(text: string): T {
  let raw = text.trim();
  // Strip a fully-closed ```json ... ``` fence first — the cleanest case.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    raw = fenced[1];
  } else {
    // Defensive: model output sometimes opens a fence but the closing
    // backticks get truncated (max_tokens cutoff). Strip a leading
    // ```json prefix and a trailing ``` if present, independently.
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  }
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
  /**
   * When true, attach `cache_control: { type: "ephemeral" }` to the
   * document block so the PDF input gets cached for ~5 min. First
   * call writes the cache (1.25× input cost on the cached portion);
   * subsequent calls within the TTL read it (0.1× input cost). Big
   * win for batched extractions that re-send the same PDF — ~70%
   * cheaper across a 12-batch run.
   */
  cacheDocument?: boolean;
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
  if (args.cacheDocument)
    documentBlock.cache_control = { type: "ephemeral" };
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

/**
 * Streaming chat — yields text deltas as they arrive, then a final
 * "done" event with token counts, cost, and a stop reason. Used by
 * the /agents route. Logs one llm_calls row when the stream ends.
 *
 * Set `cacheSystem` to wrap the system prompt in a cache_control block.
 * Anthropic ephemeral caching has a 5-min TTL and a 1024-token minimum
 * for Sonnet — short system prompts won't get a cache hit, but the
 * call still succeeds. Cost saving applies on subsequent turns within
 * the TTL window. Do NOT enable on dynamic content (retrieved atoms).
 */
export type ChatStreamMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatStreamEvent =
  | { type: "text"; delta: string }
  | {
      type: "done";
      tokensIn: number;
      tokensOut: number;
      costUsd: number | null;
      stopReason: string | null;
    }
  | { type: "error"; message: string };

export async function* chatStream(args: {
  system: string;
  messages: ChatStreamMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  ctx: LogCtx;
  purpose?: Purpose;
  cacheSystem?: boolean;
  meta?: Record<string, unknown>;
}): AsyncGenerator<ChatStreamEvent, void, void> {
  const model = args.model ?? "claude-sonnet-4-6";
  const purpose = args.purpose ?? "chat";
  const start = Date.now();

  // System block: either a plain string (cheapest path) or an array
  // with cache_control on the lone text block.
  const systemParam = args.cacheSystem
    ? [
        {
          type: "text" as const,
          text: args.system,
          cache_control: { type: "ephemeral" as const },
        },
      ]
    : args.system;

  let tokensIn = 0;
  let tokensOut = 0;
  let stopReason: string | null = null;
  let errorMsg: string | null = null;

  try {
    const stream = anthropic().messages.stream({
      model,
      max_tokens: args.maxTokens ?? 2048,
      temperature: args.temperature,
      // SDK type lags the cache_control field by a few releases; the
      // wire shape matches the public API spec.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      system: systemParam as any,
      messages: args.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "text", delta: event.delta.text };
      } else if (event.type === "message_delta") {
        if (event.usage?.output_tokens != null) {
          tokensOut = event.usage.output_tokens;
        }
        if (event.delta?.stop_reason) {
          stopReason = event.delta.stop_reason;
        }
      } else if (event.type === "message_start") {
        if (event.message.usage?.input_tokens != null) {
          tokensIn = event.message.usage.input_tokens;
        }
      }
    }

    const final = await stream.finalMessage();
    tokensIn = final.usage.input_tokens;
    tokensOut = final.usage.output_tokens;
    stopReason = final.stop_reason ?? stopReason;
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
    yield { type: "error", message: errorMsg };
  } finally {
    const latencyMs = Date.now() - start;
    const costUsd =
      tokensIn > 0 || tokensOut > 0
        ? estimateCostUsd(model, tokensIn, tokensOut)
        : null;
    await logCall({
      ctx: args.ctx,
      provider: "anthropic",
      model,
      purpose,
      tokensIn: tokensIn || undefined,
      tokensOut: tokensOut || undefined,
      latencyMs,
      error: errorMsg ?? undefined,
      meta: args.meta,
    });
    if (!errorMsg) {
      yield {
        type: "done",
        tokensIn,
        tokensOut,
        costUsd,
        stopReason,
      };
    }
  }
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
