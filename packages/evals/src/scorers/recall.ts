/**
 * Recall Evaluator
 *
 * Measures whether relevant chunks were successfully retrieved.
 * Checks if expected chunks appear in top-K results.
 */

import type { Evaluator, EvalInput, EvalResult } from '../types.js';

export class RecallEvaluator implements Evaluator {
  readonly name = 'recall@3';
  readonly topK: number;

  constructor(topK = 3) {
    this.topK = topK;
  }

  async evaluate(input: EvalInput): Promise<EvalResult> {
    const { retrievedChunks, expectedChunkIds } = input;

    if (!expectedChunkIds || expectedChunkIds.length === 0) {
      return {
        score: 1, // No expected chunks = recall is perfect (by definition)
        passed: true,
        label: `recall@${this.topK}`,
        reason: 'No expected chunks specified (perfect recall)',
        details: { strategy: 'no-expected-chunks' },
      };
    }

    // Check if expected chunks appear in top-K retrieved
    const topKChunks = retrievedChunks.slice(0, this.topK);
    const topKIds = new Set(topKChunks.map((c) => c.chunkId));

    const foundExpected = expectedChunkIds.filter((id) => topKIds.has(id));
    const recall = foundExpected.length / expectedChunkIds.length;

    const passed = recall >= 0.5; // Pass if >= 50% of expected chunks found

    return {
      score: Math.round(recall * 1000) / 1000,
      passed,
      label: `recall@${this.topK}`,
      reason: buildRecallReason(recall, this.topK, expectedChunkIds.length, foundExpected.length),
      details: {
        strategy: 'top-k-recall',
        topK: this.topK,
        expectedCount: expectedChunkIds.length,
        foundCount: foundExpected.length,
        retrievedCount: retrievedChunks.length,
        foundChunkIds: foundExpected,
        missingChunkIds: expectedChunkIds.filter((id) => !topKIds.has(id)),
      },
    };
  }
}

function buildRecallReason(recall: number, topK: number, expectedCount: number, foundCount: number): string {
  if (recall === 1) {
    return `All ${expectedCount} expected chunks found in top-${topK}`;
  }
  if (recall >= 0.5) {
    return `${foundCount}/${expectedCount} expected chunks found in top-${topK} (partial recall)`;
  }
  if (recall === 0) {
    return `No expected chunks found in top-${topK} (zero recall)`;
  }
  return `${foundCount}/${expectedCount} expected chunks found in top-${topK}`;
}
