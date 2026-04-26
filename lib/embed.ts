import "server-only";
import crypto from "node:crypto";
import { getCached, setCached } from "@/lib/cache/content_hash";
import { db } from "@/lib/db/client";
import { llmCalls } from "@/lib/db/schema";

/**
 * Voyage-3 embeddings client.
 *
 * 1024-dim vectors, batched up to 128 inputs per API request.
 *
 * We talk to Voyage's REST API directly with `fetch` rather than pull a
 * dedicated SDK — the surface is small and a dependency adds little.
 * Every call is logged into `llm_calls` with token count, latency, and
 * cost estimate so the per-project cost meter sees embedding spend.
 */

export type EmbedCtx = {
  workspaceId: string;
  projectId?: string | null;
};

export type EmbedInputType = "document" | "query";

export type EmbedOptions = {
  model?: string;
  inputType?: EmbedInputType;
};

/** Voyage-3 batch ceiling: API returns 400 above 128 inputs per request. */
export const MAX_BATCH = 128;

const DEFAULT_MODEL = "voyage-3";

/**
 * Pricing per 1M tokens. Update when Voyage changes the rate card; this
 * is intentionally a small static table rather than a config file because
 * a stale price showing up in cost meters is loud and visible.
 */
const PRICE_PER_1M_TOKENS_USD: Record<string, number> = {
  "voyage-3": 0.06,
  "voyage-3-large": 0.18,
  "voyage-3-lite": 0.02,
};

function costUsd(model: string, tokens: number): number | null {
  const rate = PRICE_PER_1M_TOKENS_USD[model];
  if (rate == null) return null;
  return (tokens / 1_000_000) * rate;
}

type VoyageResponse = {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens: number };
  model: string;
};

async function callVoyage(args: {
  inputs: string[];
  model: string;
  inputType: EmbedInputType;
}): Promise<VoyageResponse> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set");
  }

  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      input: args.inputs,
      model: args.model,
      input_type: args.inputType,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as VoyageResponse;
}

/**
 * Split into chunks of up to MAX_BATCH while preserving original index
 * order, so callers can map the flattened result back onto their inputs
 * by position.
 */
function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/**
 * Cache key for one input. Includes model + inputType so a future model
 * bump or document/query polarity change auto-invalidates without
 * manual cache busting. Embeddings are deterministic — same key, same
 * vector, forever.
 */
function embedCacheKey(
  model: string,
  inputType: EmbedInputType,
  input: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${model}|${inputType}|${input}`)
    .digest("hex");
}

/**
 * Embed an array of strings. Returns vectors in the same order as inputs.
 *
 *   const vectors = await embed({
 *     inputs: ["hello", "world"],
 *     ctx: { workspaceId, projectId },
 *   });
 *   // vectors[0] is for "hello"
 *
 * Per-input cache: each input is keyed by sha256(model|inputType|text)
 * and looked up in the shared content-hash cache. Voyage is only called
 * for cache misses — the typical compare-page render hits the cache for
 * its broad query, so subsequent renders cost zero Voyage calls. Without
 * this, the free-tier 3 RPM rate limit makes the page unsustainable
 * even after reducing per-render fan-out.
 */
export async function embed(args: {
  inputs: string[];
  ctx: EmbedCtx;
  model?: string;
  inputType?: EmbedInputType;
}): Promise<number[][]> {
  const model = args.model ?? DEFAULT_MODEL;
  const inputType = args.inputType ?? "document";

  if (args.inputs.length === 0) return [];

  // 1. Cache lookup per input. Maintains original-order alignment via
  //    the result[] slot index.
  const result: (number[] | null)[] = await Promise.all(
    args.inputs.map((input) =>
      getCached<number[]>("embed", embedCacheKey(model, inputType, input)),
    ),
  );

  // 2. Collect cache misses (preserving the index back into result[]).
  const missingIndices: number[] = [];
  const missingInputs: string[] = [];
  for (let i = 0; i < args.inputs.length; i++) {
    if (result[i] == null) {
      missingIndices.push(i);
      missingInputs.push(args.inputs[i]);
    }
  }

  // 3. Everything cached → no Voyage call at all.
  if (missingInputs.length === 0) {
    return result as number[][];
  }

  // 4. Call Voyage only for misses. Batches of MAX_BATCH preserved.
  let cursor = 0;
  for (const batch of batches(missingInputs, MAX_BATCH)) {
    const start = Date.now();
    let tokensIn: number | null = null;
    let error: string | null = null;
    try {
      const res = await callVoyage({ inputs: batch, model, inputType });
      const sorted = [...res.data].sort((a, b) => a.index - b.index);
      for (let i = 0; i < sorted.length; i++) {
        const vec = sorted[i].embedding;
        const targetIndex = missingIndices[cursor + i];
        result[targetIndex] = vec;
        // Persist to cache. Best-effort — a failed write shouldn't
        // block the caller from getting the vector it just paid for.
        void setCached<number[]>({
          purpose: "embed",
          sha256: embedCacheKey(model, inputType, batch[i]),
          payload: vec,
          tokenCost: tokensIn ?? undefined,
        }).catch(() => {});
      }
      tokensIn = res.usage?.total_tokens ?? null;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      const latencyMs = Date.now() - start;
      const cost = tokensIn != null ? costUsd(model, tokensIn) : null;
      try {
        await db.insert(llmCalls).values({
          workspaceId: args.ctx.workspaceId,
          projectId: args.ctx.projectId ?? null,
          provider: "voyage",
          model,
          purpose: "embed_spec_paragraph",
          tokensIn: tokensIn,
          tokensOut: null,
          imageCount: 0,
          costUsd: cost != null ? cost.toString() : null,
          latencyMs,
          error: error ?? null,
          meta: {
            batchSize: batch.length,
            inputType,
            cacheMisses: missingInputs.length,
            cacheHits: args.inputs.length - missingInputs.length,
          },
        });
      } catch {
        // swallow — log failures shouldn't mask the real outcome.
      }
    }
    cursor += batch.length;
  }

  return result as number[][];
}
