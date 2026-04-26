/**
 * Query Understanding layer (Concept 1 — Phase 2).
 *
 * Transforms a raw user query into a richer `ProcessedQuery` before RAG
 * retrieval to improve recall and intent-aligned ranking.
 *
 * Three stages (all rule-based in Phase 2 — deterministic, no LLM required):
 *   1. Rewriting  — lower-case, strip filler words, normalise whitespace
 *   2. Expansion  — generate lexical variants from a static synonym map
 *   3. Intent detection — classify into five QueryIntent categories
 */
import type { ProcessedQuery, QueryIntent, RawQuery } from "@groundedos/core";
/**
 * Normalise the raw query for better lexical matching.
 *
 * Rules (Phase 2 — rule-based, no LLM):
 *   - Lowercase and normalise Unicode
 *   - Strip common filler words
 *   - Collapse multiple spaces
 *   - Returns undefined when the rewritten form matches the original
 */
export declare function rewriteQuery(text: string): string | undefined;
/**
 * Generate lexical variants for the key terms in the query.
 * Returns an array of additional terms to append to the retrieval query.
 */
export declare function expandQuery(text: string): string[];
/**
 * Classify the query into a QueryIntent.
 * Returns the intent with the highest-confidence matching pattern.
 */
export declare function detectIntent(text: string): {
    intent: QueryIntent;
    confidence: number;
};
/**
 * Process a raw query through the three-stage pipeline and return a
 * `ProcessedQuery` ready for downstream retrieval.
 */
export declare function processQuery(raw: RawQuery): ProcessedQuery;
