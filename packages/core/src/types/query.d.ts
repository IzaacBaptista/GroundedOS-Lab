/**
 * Query types for the Query Understanding layer (Concept 1 — Phase 2).
 *
 * These types flow from the raw user input through the query understanding
 * pipeline before reaching the RAG retrieval stage.
 */
/** The raw incoming query, as received from the user or API. */
export interface RawQuery {
    /** The raw query text as typed by the user. */
    text: string;
    /** Optional session identifier for memory and context injection. */
    sessionId?: string;
    /** Optional caller-supplied intent hint; overrides detection when present. */
    intent?: string;
}
/**
 * A high-level classification of the user's intent.
 *
 * Used to select retrieval strategies, prompt templates, and evaluation
 * metrics that are appropriate for the type of question asked.
 */
export type QueryIntent = "factual" | "comparative" | "procedural" | "exploratory" | "unknown";
/**
 * The enriched query produced by the query understanding pipeline.
 *
 * Downstream stages (retrieval, re-ranking, answer construction) should
 * use `ProcessedQuery` rather than the raw user input.
 */
export interface ProcessedQuery {
    /** Original unmodified user text. */
    original: string;
    /**
     * Rewritten version of the query optimised for retrieval.
     * Undefined when rewriting did not change the original meaningfully.
     */
    rewritten?: string;
    /**
     * Lexical variants and related terms added via query expansion.
     * These are merged with the (possibly rewritten) query to widen recall.
     */
    expanded: string[];
    /** Detected intent classification. */
    intent: QueryIntent;
    /** Confidence score for the intent classification (0–1). */
    confidence: number;
}
