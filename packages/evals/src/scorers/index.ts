/**
 * Evaluator Chain
 *
 * Execute multiple evaluators and aggregate results.
 */

import type { Evaluator, EvalInput, EvalResult, EvalSummary } from '../types.js';

export class EvaluatorChain {
  private evaluators: Map<string, Evaluator> = new Map();

  register(evaluator: Evaluator): void {
    this.evaluators.set(evaluator.name, evaluator);
  }

  deregister(name: string): void {
    this.evaluators.delete(name);
  }

  list(): Evaluator[] {
    return Array.from(this.evaluators.values());
  }

  /**
   * Run all registered evaluators against the input.
   */
  async evaluate(input: EvalInput): Promise<EvalSummary> {
    const results = new Map<string, EvalResult>();
    const evaluators = this.evaluators.values();

    for (const evaluator of evaluators) {
      const result = await evaluator.evaluate(input);
      results.set(evaluator.name, result);
    }

    // Calculate aggregates
    const scores = Array.from(results.values()).map((r) => r.score);
    const averageScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const passedCount = Array.from(results.values()).filter((r) => r.passed).length;
    const totalCount = results.size;

    return {
      question: input.question,
      answer: input.answer,
      timestamp: Date.now(),
      results,
      averageScore: Math.round(averageScore * 1000) / 1000,
      passedCount,
      totalCount,
    };
  }
}

/**
 * Create a default evaluator chain with faithfulness, relevance, and recall.
 */
export function createDefaultEvaluatorChain(): EvaluatorChain {
  const chain = new EvaluatorChain();

  // Lazy import to avoid circular deps
  const { FaithfulnessEvaluator } = require('./faithfulness.js');
  const { RelevanceEvaluator } = require('./relevance.js');
  const { RecallEvaluator } = require('./recall.js');

  chain.register(new FaithfulnessEvaluator());
  chain.register(new RelevanceEvaluator());
  chain.register(new RecallEvaluator(3));

  return chain;
}

export * from '../scorers/faithfulness.js';
export * from '../scorers/relevance.js';
export * from '../scorers/recall.js';
