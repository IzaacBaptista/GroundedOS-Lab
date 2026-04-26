/**
 * Eval History Store
 *
 * Rolling ring-buffer (last 50 entries) that tracks structured eval scorer
 * results across RAG requests.  Used to surface trend data in the Evals
 * tab without requiring a persistent database.
 */

export interface ScorerResultEntry {
  score: number;
  passed: boolean;
  reason?: string;
}

export interface EvalHistoryEntry {
  timestamp: number;
  query: string;
  documentId: string;
  /** Legacy lexical metrics kept for backwards compat */
  groundedness: number;
  answerOverlap: number;
  pipelineScore: number;
  /** Structured scorer results from @groundedos/evals */
  scorerResults?: {
    faithfulness?: ScorerResultEntry;
    relevance?: ScorerResultEntry;
    recall?: ScorerResultEntry;
    averageScore: number;
    passedCount: number;
  };
}

export interface EvalHistorySummary {
  count: number;
  avgPipelineScore: number;
  avgFaithfulness: number;
  avgRelevance: number;
  trend: "improving" | "declining" | "stable";
  recent: EvalHistoryEntry[];
}

const MAX_ENTRIES = 50;
const _history: EvalHistoryEntry[] = [];

export function recordEvalHistory(entry: EvalHistoryEntry): void {
  _history.push(entry);
  if (_history.length > MAX_ENTRIES) {
    _history.shift();
  }
}

export function getEvalHistory(documentId?: string): EvalHistoryEntry[] {
  const base = documentId ? _history.filter((e) => e.documentId === documentId) : _history;
  return base.slice(-20);
}

export function getEvalHistorySummary(documentId?: string): EvalHistorySummary {
  const entries = getEvalHistory(documentId);

  if (entries.length === 0) {
    return {
      count: 0,
      avgPipelineScore: 0,
      avgFaithfulness: 0,
      avgRelevance: 0,
      trend: "stable",
      recent: [],
    };
  }

  const avgPipelineScore =
    entries.reduce((sum, e) => sum + e.pipelineScore, 0) / entries.length;

  const faithfulnessEntries = entries.filter((e) => e.scorerResults?.faithfulness != null);
  const avgFaithfulness =
    faithfulnessEntries.length > 0
      ? faithfulnessEntries.reduce((sum, e) => sum + (e.scorerResults!.faithfulness!.score), 0) /
        faithfulnessEntries.length
      : 0;

  const relevanceEntries = entries.filter((e) => e.scorerResults?.relevance != null);
  const avgRelevance =
    relevanceEntries.length > 0
      ? relevanceEntries.reduce((sum, e) => sum + (e.scorerResults!.relevance!.score), 0) /
        relevanceEntries.length
      : 0;

  let trend: "improving" | "declining" | "stable" = "stable";
  if (entries.length >= 4) {
    const mid = Math.floor(entries.length / 2);
    const firstHalf = entries.slice(0, mid);
    const secondHalf = entries.slice(mid);
    const firstAvg = firstHalf.reduce((s, e) => s + e.pipelineScore, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, e) => s + e.pipelineScore, 0) / secondHalf.length;
    if (secondAvg - firstAvg > 0.05) trend = "improving";
    else if (firstAvg - secondAvg > 0.05) trend = "declining";
  }

  return {
    count: _history.length,
    avgPipelineScore: Number(avgPipelineScore.toFixed(3)),
    avgFaithfulness: Number(avgFaithfulness.toFixed(3)),
    avgRelevance: Number(avgRelevance.toFixed(3)),
    trend,
    recent: entries.slice(-5),
  };
}

/** Exposed for testing only – clears the store */
export function _clearEvalHistory(): void {
  _history.length = 0;
}
