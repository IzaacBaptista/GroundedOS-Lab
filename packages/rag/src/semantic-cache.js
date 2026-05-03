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
import { createHash } from "crypto";
// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_CONFIG = {
    similarityThreshold: 0.92,
    maxEntries: 100,
    ttlMs: 3_600_000,
    shadowSampleRate: 0.2,
};
// ---------------------------------------------------------------------------
// SemanticCache
// ---------------------------------------------------------------------------
export class SemanticCache {
    config;
    /** Entries per documentId, ordered by `createdAt` desc (newest first). */
    store = new Map();
    metrics = {
        hits: 0,
        misses: 0,
        evictions: 0,
        lookups: 0,
        shadowChecks: 0,
        shadowAgreements: 0,
        cacheSavingsMs: 0,
        cacheQualityScore: 0,
        cacheHitRate: 0,
    };
    constructor(config = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    // ---------------------------------------------------------------------------
    // Lookup
    // ---------------------------------------------------------------------------
    /**
     * Look up a query against the cache for a given documentId.
     * Returns the best matching entry when similarity >= threshold, or a miss.
     */
    lookup(documentId, queryEmbedding) {
        return this.lookupWithContext({
            indexId: documentId,
            queryText: "",
            queryEmbedding,
            contextSignature: "legacy",
            threshold: this.config.similarityThreshold,
        });
    }
    lookupWithContext(input) {
        const entries = this.store.get(input.indexId);
        const contextHash = hashContextSignature(input.contextSignature);
        const threshold = input.threshold ?? this.config.similarityThreshold;
        this.metrics.lookups += 1;
        if (!entries || entries.length === 0) {
            this.metrics.misses += 1;
            this.syncDerivedMetrics();
            return {
                hit: false,
                thresholdUsed: threshold,
                reason: "no-cache-entries-for-index",
                contextHash,
            };
        }
        const now = Date.now();
        let bestEntry;
        let bestSimilarity = -Infinity;
        const version = input.indexVersion ?? "v1";
        for (const entry of entries) {
            // Skip expired entries
            if (now - entry.createdAt > entry.ttlMs) {
                continue;
            }
            if (entry.indexVersion !== version) {
                continue;
            }
            if (entry.contextSignature !== contextHash) {
                continue;
            }
            const similarity = cosineSimilarity(input.queryEmbedding, entry.queryEmbedding);
            if (similarity > bestSimilarity) {
                bestSimilarity = similarity;
                bestEntry = entry;
            }
        }
        if (bestEntry === undefined) {
            this.metrics.misses += 1;
            this.syncDerivedMetrics();
            return {
                hit: false,
                thresholdUsed: threshold,
                reason: "no-context-match",
                contextHash,
            };
        }
        if (bestSimilarity < threshold) {
            this.metrics.misses += 1;
            this.syncDerivedMetrics();
            return {
                hit: false,
                entry: bestEntry,
                thresholdUsed: threshold,
                similarity: bestSimilarity,
                reason: "below-threshold",
                cacheKey: bestEntry.cacheKey,
                contextHash,
            };
        }
        bestEntry.hitCount += 1;
        this.metrics.hits += 1;
        this.syncDerivedMetrics();
        return {
            hit: true,
            entry: bestEntry,
            similarity: bestSimilarity,
            thresholdUsed: threshold,
            reason: "semantic-context-hit",
            cacheKey: bestEntry.cacheKey,
            contextHash,
        };
    }
    // ---------------------------------------------------------------------------
    // Store
    // ---------------------------------------------------------------------------
    /**
     * Add a new entry to the cache for the given documentId.
     * Evicts the oldest entry when `maxEntries` is exceeded.
     */
    set(documentId, queryEmbedding, processedQuery, result) {
        this.setWithContext({
            indexId: documentId,
            indexVersion: "v1",
            queryText: processedQuery.rewritten ?? processedQuery.original,
            queryEmbedding,
            contextSignature: "legacy",
            processedQuery,
            result,
        });
    }
    setWithContext(input) {
        const contextHash = hashContextSignature(input.contextSignature);
        const version = input.indexVersion ?? "v1";
        const ttlMs = input.ttlMs ?? this.config.ttlMs;
        const cacheKey = buildCacheKey(input.queryText, input.indexId, contextHash, version);
        const entry = {
            cacheKey,
            indexId: input.indexId,
            contextSignature: contextHash,
            indexVersion: version,
            queryText: input.queryText,
            queryEmbedding: input.queryEmbedding,
            processedQuery: input.processedQuery,
            result: input.result,
            createdAt: Date.now(),
            hitCount: 0,
            ttlMs,
            metadata: input.metadata,
        };
        let entries = this.store.get(input.indexId) ?? [];
        entries = [entry, ...entries];
        // Evict oldest when over capacity
        while (entries.length > this.config.maxEntries) {
            entries.pop();
            this.metrics.evictions += 1;
        }
        this.store.set(input.indexId, entries);
        this.syncDerivedMetrics();
    }
    // ---------------------------------------------------------------------------
    // Invalidation
    // ---------------------------------------------------------------------------
    /**
     * Remove all cached entries for a documentId.
     * Call this when the document index is deleted or re-indexed.
     */
    invalidate(documentId) {
        const entries = this.store.get(documentId);
        if (entries) {
            this.metrics.evictions += entries.length;
        }
        this.store.delete(documentId);
        this.syncDerivedMetrics();
    }
    invalidateIndexVersion(indexId, indexVersion) {
        const entries = this.store.get(indexId);
        if (!entries || entries.length === 0) {
            return;
        }
        const retained = entries.filter((entry) => entry.indexVersion !== indexVersion);
        this.metrics.evictions += entries.length - retained.length;
        if (retained.length > 0) {
            this.store.set(indexId, retained);
        }
        else {
            this.store.delete(indexId);
        }
        this.syncDerivedMetrics();
    }
    /** Flush the entire cache. */
    clear() {
        for (const entries of this.store.values()) {
            this.metrics.evictions += entries.length;
        }
        this.store.clear();
        this.syncDerivedMetrics();
    }
    // ---------------------------------------------------------------------------
    // Metrics
    // ---------------------------------------------------------------------------
    getMetrics() {
        this.syncDerivedMetrics();
        return { ...this.metrics };
    }
    get size() {
        let total = 0;
        for (const entries of this.store.values()) {
            total += entries.length;
        }
        return total;
    }
    getConfig() {
        return { ...this.config };
    }
    shouldRunShadowCheck() {
        return Math.random() < this.config.shadowSampleRate;
    }
    evaluateShadow(input) {
        this.metrics.shadowChecks += 1;
        const cachedSet = new Set(input.cachedChunkIds);
        let overlap = 0;
        for (const id of input.freshChunkIds) {
            if (cachedSet.has(id)) {
                overlap += 1;
            }
        }
        const denom = Math.max(1, input.freshChunkIds.length);
        const agreement = Number((overlap / denom).toFixed(3));
        if (agreement >= 0.66) {
            this.metrics.shadowAgreements += 1;
        }
        this.metrics.cacheSavingsMs += Math.max(0, input.estimatedFreshLatencyMs);
        this.syncDerivedMetrics();
        return {
            agreement,
            qualityLabel: agreement >= 0.75 ? "high" : agreement >= 0.45 ? "medium" : "low",
        };
    }
    syncDerivedMetrics() {
        const lookups = Math.max(1, this.metrics.lookups);
        const shadowChecks = Math.max(1, this.metrics.shadowChecks);
        this.metrics.cacheHitRate = Number((this.metrics.hits / lookups).toFixed(4));
        this.metrics.cacheQualityScore = Number((this.metrics.shadowAgreements / shadowChecks).toFixed(4));
    }
}
export function selectAdaptiveCacheThreshold(input) {
    const tokenCount = input.queryText.trim().split(/\s+/).filter(Boolean).length;
    const variance = input.embeddingVariance ?? 0.5;
    const quality = input.recentCacheQualityScore ?? 0.6;
    const intent = (input.intent ?? "unknown").toLowerCase();
    const highConfidenceIntent = ["factual", "procedural"].includes(intent);
    const ambiguousIntent = ["unknown", "exploratory", "comparative"].includes(intent);
    let threshold = 0.9;
    let reason = "default-balanced-threshold";
    if (highConfidenceIntent && tokenCount <= 10 && variance <= 0.45) {
        threshold = 0.95;
        reason = "high-confidence-short-query";
    }
    else if (ambiguousIntent || tokenCount > 18 || variance >= 0.65) {
        threshold = 0.85;
        reason = "ambiguous-or-long-query";
    }
    if (quality < 0.45) {
        threshold = Math.min(0.97, threshold + 0.03);
        reason = `${reason}-quality-guard`;
    }
    return {
        threshold: Number(threshold.toFixed(2)),
        reason,
    };
}
export function buildCacheKey(query, indexId, contextSignature, indexVersion = "v1") {
    const raw = `${query}::${indexId}::${contextSignature}::${indexVersion}`;
    return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
export function hashContextSignature(contextSignature) {
    return createHash("sha256").update(contextSignature).digest("hex").slice(0, 16);
}
// ---------------------------------------------------------------------------
// Cosine similarity helper
// ---------------------------------------------------------------------------
function cosineSimilarity(a, b) {
    if (a.length !== b.length || a.length === 0) {
        return 0;
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}
//# sourceMappingURL=semantic-cache.js.map