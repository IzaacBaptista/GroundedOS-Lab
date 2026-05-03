/**
 * Recall Evaluator
 *
 * Measures whether relevant chunks were successfully retrieved.
 * Checks if expected chunks appear in top-K results.
 */
import type { Evaluator, EvalInput, EvalResult } from '../types.js';
export declare class RecallEvaluator implements Evaluator {
    readonly name = "recall@3";
    readonly topK: number;
    constructor(topK?: number);
    evaluate(input: EvalInput): Promise<EvalResult>;
}
