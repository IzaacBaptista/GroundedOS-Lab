/**
 * Evaluation Types
 *
 * Defines the Evaluator interface and related types.
 * All eval scorers implement this contract.
 */
export interface EvalInput {
    question: string;
    answer: string;
    retrievedChunks: Array<{
        chunkId: string;
        text: string;
        score: number;
    }>;
    expectedChunkIds?: string[];
}
export interface EvalResult {
    score: number;
    passed: boolean;
    label: string;
    reason?: string;
    details?: Record<string, unknown>;
}
export interface Evaluator {
    readonly name: string;
    evaluate(input: EvalInput): Promise<EvalResult>;
}
/**
 * Faithfulness Eval: Does the answer stay grounded in retrieved chunks?
 * Checks that facts in the answer are supported by the retrieved context.
 */
export interface FaithfulnessInput extends EvalInput {
}
/**
 * Relevance Eval: Does the answer address the question?
 * Checks semantic similarity between answer and question intent.
 */
export interface RelevanceInput extends EvalInput {
}
/**
 * Recall Eval: Were the relevant chunks retrieved?
 * Checks if expected chunks appear in top-K results.
 */
export interface RecallInput extends EvalInput {
    topK?: number;
}
/**
 * Collection of eval results for a single request.
 */
export interface EvalSummary {
    question: string;
    answer: string;
    timestamp: number;
    results: Map<string, EvalResult>;
    averageScore: number;
    passedCount: number;
    totalCount: number;
}
