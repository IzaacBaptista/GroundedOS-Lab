/**
 * Book cap. 19 — re-ranking. A cross-encoder needs a real trained model
 * this project doesn't ship; an LLM reranker doesn't — any chat-capable
 * model can judge relevance directly. This is that: a real LLM call that
 * reads the query and the candidate passages and returns them reordered
 * by relevance, not a heuristic standing in for one.
 */

import type { LlmTextProvider } from "./llm-text-provider";

export interface RerankCandidate {
  id: string;
  text: string;
}

export interface RerankedCandidate {
  id: string;
  /** Rank-derived, not geometric — `(n - rank) / n`. Only meant to order candidates, per book cap. 19's "Scoring" section. */
  score: number;
}

const MAX_CANDIDATE_CHARS = 500;

/**
 * Asks the LLM to order `candidates` from most to least relevant to
 * `query`, then reconstructs the order by locating each candidate's id in
 * the raw response text (robust to numbering/formatting the model adds
 * around the id). A candidate the model never mentions keeps its original
 * relative position, appended after every candidate it did rank.
 */
export async function rerankWithLlm(
  query: string,
  candidates: RerankCandidate[],
  llmProvider: LlmTextProvider
): Promise<RerankedCandidate[]> {
  if (candidates.length === 0) {
    return [];
  }

  if (candidates.length === 1) {
    return [{ id: candidates[0]!.id, score: 1 }];
  }

  const listing = candidates
    .map((candidate) => `[${candidate.id}] ${candidate.text.slice(0, MAX_CANDIDATE_CHARS)}`)
    .join("\n\n");

  const response = await llmProvider.complete({
    system:
      "You are a search relevance judge. Given a query and a list of candidate " +
      "passages, each tagged with an id in square brackets, list the candidate " +
      "ids ordered from MOST to LEAST relevant to the query. Use exactly the " +
      "ids given, one per line, nothing else.",
    user: `Query: ${query}\n\nCandidates:\n${listing}`,
  });

  const ordered = [...candidates].sort((left, right) => {
    const positionLeft = firstIndexOf(response, left.id);
    const positionRight = firstIndexOf(response, right.id);

    if (positionLeft !== positionRight) {
      return positionLeft - positionRight;
    }

    return candidates.indexOf(left) - candidates.indexOf(right);
  });

  const total = ordered.length;
  return ordered.map((candidate, rank) => ({
    id: candidate.id,
    score: (total - rank) / total,
  }));
}

function firstIndexOf(haystack: string, needle: string): number {
  const index = haystack.indexOf(needle);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}
