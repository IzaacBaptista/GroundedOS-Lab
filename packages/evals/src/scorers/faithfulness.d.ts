/**
 * Faithfulness Evaluator
 *
 * Measures whether the answer's facts are supported by retrieved chunks.
 * Uses token overlap and semantic similarity heuristics.
 */
import type { Evaluator, EvalInput, EvalResult } from '../types.js';
export declare class FaithfulnessEvaluator implements Evaluator {
    readonly name = "faithfulness";
    evaluate(input: EvalInput): Promise<EvalResult>;
    private tokenize;
}
