/**
 * Reciprocal Rank Fusion.
 *
 * Combines N independent ranked lists into a single ranking by summing
 * 1/(k + rank) across the lists each item appears in. The k constant
 * controls how aggressively top-of-list items dominate; higher k → flatter
 * weighting.
 *
 * We default to k=60 because that's the value the original RRF paper
 * (Cormack et al., 2009) tuned against TREC, and it's the value most
 * production retrieval systems start with. The eval harness will retune
 * once we have ground-truth recall data.
 *
 * Pure function, no I/O. Tested in isolation.
 */

export type Ranked<T> = { item: T; rank: number };

export type RrfScored<T> = { item: T; score: number };

export function rrf<T>(
  rankings: Array<Ranked<T>[]>,
  opts: {
    /** Identity function: how to identify the same item across rankings. */
    keyOf: (item: T) => string;
    /** RRF constant. Default 60. */
    k?: number;
  },
): RrfScored<T>[] {
  const k = opts.k ?? 60;
  const scores = new Map<string, RrfScored<T>>();

  for (const list of rankings) {
    for (const r of list) {
      const id = opts.keyOf(r.item);
      const contribution = 1 / (k + r.rank);
      const existing = scores.get(id);
      if (existing) {
        existing.score += contribution;
      } else {
        scores.set(id, { item: r.item, score: contribution });
      }
    }
  }

  return [...scores.values()].sort((a, b) => b.score - a.score);
}
