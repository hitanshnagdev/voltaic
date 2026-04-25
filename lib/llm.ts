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
}): Promise<T> {
  const model = args.model ?? "claude-haiku-4-5";
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
      purpose: "classify",
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
      purpose: "classify",
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
