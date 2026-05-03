/**
 * Evaluator Chain
 *
 * Execute multiple evaluators and aggregate results.
 */
import type { Evaluator, EvalInput, EvalSummary } from '../types.js';
export declare class EvaluatorChain {
    private evaluators;
    register(evaluator: Evaluator): void;
    deregister(name: string): void;
    list(): Evaluator[];
    /**
     * Run all registered evaluators against the input.
     */
    evaluate(input: EvalInput): Promise<EvalSummary>;
}
/**
 * Create a default evaluator chain with faithfulness, relevance, and recall.
 */
export declare function createDefaultEvaluatorChain(): EvaluatorChain;
export * from '../scorers/faithfulness.js';
export * from '../scorers/relevance.js';
export * from '../scorers/recall.js';
