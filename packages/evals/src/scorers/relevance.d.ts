/**
 * Relevance Evaluator
 *
 * Measures whether the answer adequately addresses the question.
 * Uses keyword overlap and semantic similarity heuristics.
 */
import type { Evaluator, EvalInput, EvalResult } from '../types.js';
export declare class RelevanceEvaluator implements Evaluator {
    readonly name = "relevance";
    evaluate(input: EvalInput): Promise<EvalResult>;
    private tokenize;
    private isStopword;
}
