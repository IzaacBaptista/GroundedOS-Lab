/**
 * Semantic Cache (Concept 4 — Phase 2).
 *
 * An in-memory cache that stores previous RAG query results and retrieves
 * them when a new query is *semantically similar* — not just an exact text
 * match.  Similarity is measured via cosine distance between query embeddings.
 *
 * Cache key: (documentId, queryEmbedding)
 *   Two queries with different wording but similar embeddings share the same
 *   cached answer when their cosine similarity >= `similarityThreshold`.
 *
 * Phase 2: in-memory only.  Migration to Redis-backed in Phase 4 (see ADR-009).
 */
import type { ProcessedQuery } from "@groundedos/core";
export interface CacheEntry {
    cacheKey: string;
    indexId: string;
    contextSignature: string;
    indexVersion: string;
    queryEmbedding: number[];
    queryText?: string;
    processedQuery: ProcessedQuery;
    /** Serialised RagAskResponse — stored as unknown to avoid circular deps. */
    result: unknown;
    createdAt: number;
    hitCount: number;
    ttlMs: number;
    metadata?: Record<string, unknown>;
}
export interface SemanticCacheConfig {
    /** Minimum cosine similarity to consider a cache hit. Default: 0.92 */
    similarityThreshold: number;
    /** Maximum number of entries per documentId. Default: 100 */
    maxEntries: number;
    /** Time-to-live in milliseconds. Default: 3 600 000 (1 hour) */
    ttlMs: number;
    /** Shadow retrieval sampling rate for cache quality checks. */
    shadowSampleRate: number;
}
export interface CacheLookupResult {
    hit: boolean;
    entry?: CacheEntry;
    similarity?: number;
    thresholdUsed?: number;
    reason?: string;
    cacheKey?: string;
    contextHash?: string;
}
export interface CacheMetrics {
    hits: number;
    misses: number;
    evictions: number;
    lookups: number;
    shadowChecks: number;
    shadowAgreements: number;
    cacheSavingsMs: number;
    cacheQualityScore: number;
    cacheHitRate: number;
}
export interface CacheLookupContext {
    indexId: string;
    indexVersion?: string;
    queryText: string;
    queryEmbedding: number[];
    contextSignature: string;
    threshold?: number;
    ttlMs?: number;
}
export interface CacheStoreContext {
    indexId: string;
    indexVersion?: string;
    queryText: string;
    queryEmbedding: number[];
    contextSignature: string;
    processedQuery: ProcessedQuery;
    result: unknown;
    ttlMs?: number;
    metadata?: Record<string, unknown>;
}
export interface CacheShadowEvalInput {
    indexId: string;
    cacheEntry: CacheEntry;
    freshChunkIds: string[];
    cachedChunkIds: string[];
    estimatedFreshLatencyMs: number;
}
export declare class SemanticCache {
    private readonly config;
    /** Entries per documentId, ordered by `createdAt` desc (newest first). */
    private readonly store;
    private readonly metrics;
    constructor(config?: Partial<SemanticCacheConfig>);
    /**
     * Look up a query against the cache for a given documentId.
     * Returns the best matching entry when similarity >= threshold, or a miss.
     */
    lookup(documentId: string, queryEmbedding: number[]): CacheLookupResult;
    lookupWithContext(input: CacheLookupContext): CacheLookupResult;
    /**
     * Add a new entry to the cache for the given documentId.
     * Evicts the oldest entry when `maxEntries` is exceeded.
     */
    set(documentId: string, queryEmbedding: number[], processedQuery: ProcessedQuery, result: unknown): void;
    setWithContext(input: CacheStoreContext): void;
    /**
     * Remove all cached entries for a documentId.
     * Call this when the document index is deleted or re-indexed.
     */
    invalidate(documentId: string): void;
    invalidateIndexVersion(indexId: string, indexVersion: string): void;
    /** Flush the entire cache. */
    clear(): void;
    getMetrics(): Readonly<CacheMetrics>;
    get size(): number;
    getConfig(): Readonly<SemanticCacheConfig>;
    shouldRunShadowCheck(): boolean;
    evaluateShadow(input: CacheShadowEvalInput): {
        agreement: number;
        qualityLabel: "high" | "medium" | "low";
    };
    private syncDerivedMetrics;
}
export interface AdaptiveThresholdInput {
    queryText: string;
    intent?: string;
    embeddingVariance?: number;
    recentCacheQualityScore?: number;
}
export declare function selectAdaptiveCacheThreshold(input: AdaptiveThresholdInput): {
    threshold: number;
    reason: string;
};
export declare function buildCacheKey(query: string, indexId: string, contextSignature: string, indexVersion?: string): string;
export declare function hashContextSignature(contextSignature: string): string;
