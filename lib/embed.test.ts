import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Module mocks must be set BEFORE the SUT is imported. We mock the cache
// + Voyage fetch to drive embed()'s cache-miss vs cache-hit branches
// without touching the live API or DB.
vi.mock("@/lib/cache/content_hash", () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  db: {
    insert: () => ({ values: async () => undefined }),
  },
}));

import { getCached, setCached } from "@/lib/cache/content_hash";
import { embed } from "./embed";

const mockedGet = getCached as unknown as ReturnType<typeof vi.fn>;
const mockedSet = setCached as unknown as ReturnType<typeof vi.fn>;

const ctx = { workspaceId: "ws-1", projectId: "proj-1" };

const ZEROS = (n: number) => new Array(n).fill(0);

describe("embed — cache integration", () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSet.mockReset();
    mockedSet.mockResolvedValue(undefined);
    process.env.VOYAGE_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const body = JSON.parse(init.body) as { input: string[] };
        return new Response(
          JSON.stringify({
            data: body.input.map((_, i) => ({
              embedding: ZEROS(1024),
              index: i,
            })),
            usage: { total_tokens: body.input.length * 10 },
            model: "voyage-3",
          }),
          { status: 200 },
        );
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls Voyage when no inputs are cached", async () => {
    mockedGet.mockResolvedValue(null);
    const result = await embed({ inputs: ["alpha"], ctx });
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveLength(1024);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mockedSet).toHaveBeenCalledTimes(1);
  });

  it("does NOT call Voyage when every input is cached (the 429-prevention path)", async () => {
    mockedGet.mockResolvedValue(ZEROS(1024));
    const result = await embed({ inputs: ["alpha", "beta"], ctx });
    expect(result).toHaveLength(2);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockedSet).not.toHaveBeenCalled();
  });

  it("only batches the misses when partial cache hits", async () => {
    // First input cached, second misses, third cached.
    mockedGet.mockImplementation(async () => {
      // Distinguish hits from misses by varying the cached value.
      // The actual cache key check happens in embed; for the test we
      // just need to alternate hit/miss by call order.
      const calls = mockedGet.mock.calls.length;
      if (calls === 1) return ZEROS(1024).map(() => 0.1);
      if (calls === 2) return null;
      return ZEROS(1024).map(() => 0.3);
    });

    const result = await embed({
      inputs: ["cached-a", "miss-b", "cached-c"],
      ctx,
    });
    expect(result).toHaveLength(3);
    // Voyage called exactly once with one input (only the miss).
    expect(fetch).toHaveBeenCalledTimes(1);
    const fetchCall = (fetch as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0];
    const body = JSON.parse((fetchCall[1] as { body: string }).body);
    expect(body.input).toEqual(["miss-b"]);
    // Cache write only for the miss.
    expect(mockedSet).toHaveBeenCalledTimes(1);
    // Order preserved.
    expect(result[0][0]).toBe(0.1);
    expect(result[1][0]).toBe(0); // from Voyage stub
    expect(result[2][0]).toBe(0.3);
  });

  it("changes the cache key when model or inputType changes", async () => {
    mockedGet.mockResolvedValue(null);
    await embed({ inputs: ["alpha"], ctx, model: "voyage-3" });
    await embed({ inputs: ["alpha"], ctx, model: "voyage-3-large" });
    await embed({ inputs: ["alpha"], ctx, inputType: "query" });
    // Three distinct cache lookups → three distinct keys.
    const keys = mockedGet.mock.calls.map((c) => c[1]);
    expect(new Set(keys).size).toBe(3);
  });

  it("returns empty array on empty input without touching cache or fetch", async () => {
    const result = await embed({ inputs: [], ctx });
    expect(result).toEqual([]);
    expect(mockedGet).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates Voyage errors instead of swallowing them", async () => {
    mockedGet.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate limit", { status: 429 })),
    );
    await expect(embed({ inputs: ["alpha"], ctx })).rejects.toThrow(
      /Voyage 429/,
    );
    // Critical: cache write must NOT happen on error — otherwise the
    // next call returns a phantom embedding.
    expect(mockedSet).not.toHaveBeenCalled();
  });
});
