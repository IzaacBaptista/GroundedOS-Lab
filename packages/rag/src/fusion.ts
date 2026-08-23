/**
 * Book cap. 18 — Reciprocal Rank Fusion (RRF).
 *
 * Combines multiple ranked lists by *position*, not by raw score value —
 * which is what makes it work without normalizing scores that live on
 * incompatible scales (a BM25 score and a cosine similarity are never
 * directly comparable). Each list contributes `1 / (k + rank)` per item;
 * contributions across lists are summed.
 */

const DEFAULT_RRF_K = 60;

export interface RankedItem {
  id: string;
}

/**
 * `k` dampens the influence of rank differences (higher k = flatter curve,
 * top-ranked items matter relatively less) — 60 is the value most commonly
 * cited in IR literature and is what most vector stores default to.
 */
export function reciprocalRankFusion(
  rankedLists: ReadonlyArray<ReadonlyArray<RankedItem>>,
  k: number = DEFAULT_RRF_K
): Map<string, number> {
  if (!Number.isFinite(k) || k <= 0) {
    throw new Error("[rag/fusion] k must be a positive number.");
  }

  const scores = new Map<string, number>();

  for (const list of rankedLists) {
    list.forEach((item, index) => {
      const rank = index + 1;
      const contribution = 1 / (k + rank);
      scores.set(item.id, (scores.get(item.id) ?? 0) + contribution);
    });
  }

  return scores;
}
