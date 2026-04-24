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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CacheEntry {
  queryEmbedding: number[];
  processedQuery: ProcessedQuery;
  /** Serialised RagAskResponse — stored as unknown to avoid circular deps. */
  result: unknown;
  createdAt: number;
  hitCount: number;
}

export interface SemanticCacheConfig {
  /** Minimum cosine similarity to consider a cache hit. Default: 0.92 */
  similarityThreshold: number;
  /** Maximum number of entries per documentId. Default: 100 */
  maxEntries: number;
  /** Time-to-live in milliseconds. Default: 3 600 000 (1 hour) */
  ttlMs: number;
}

export interface CacheLookupResult {
  hit: boolean;
  entry?: CacheEntry;
  similarity?: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: SemanticCacheConfig = {
  similarityThreshold: 0.92,
  maxEntries: 100,
  ttlMs: 3_600_000,
};

// ---------------------------------------------------------------------------
// SemanticCache
// ---------------------------------------------------------------------------

export class SemanticCache {
  private readonly config: SemanticCacheConfig;
  /** Entries per documentId, ordered by `createdAt` desc (newest first). */
  private readonly store = new Map<string, CacheEntry[]>();
  private readonly metrics: CacheMetrics = { hits: 0, misses: 0, evictions: 0 };

  constructor(config: Partial<SemanticCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // Lookup
  // ---------------------------------------------------------------------------

  /**
   * Look up a query against the cache for a given documentId.
   * Returns the best matching entry when similarity >= threshold, or a miss.
   */
  lookup(documentId: string, queryEmbedding: number[]): CacheLookupResult {
    const entries = this.store.get(documentId);

    if (!entries || entries.length === 0) {
      this.metrics.misses += 1;
      return { hit: false };
    }

    const now = Date.now();
    let bestEntry: CacheEntry | undefined;
    let bestSimilarity = -Infinity;

    for (const entry of entries) {
      // Skip expired entries
      if (now - entry.createdAt > this.config.ttlMs) {
        continue;
      }

      const similarity = cosineSimilarity(queryEmbedding, entry.queryEmbedding);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestEntry = entry;
      }
    }

    if (bestEntry === undefined || bestSimilarity < this.config.similarityThreshold) {
      this.metrics.misses += 1;
      return { hit: false };
    }

    bestEntry.hitCount += 1;
    this.metrics.hits += 1;

    return { hit: true, entry: bestEntry, similarity: bestSimilarity };
  }

  // ---------------------------------------------------------------------------
  // Store
  // ---------------------------------------------------------------------------

  /**
   * Add a new entry to the cache for the given documentId.
   * Evicts the oldest entry when `maxEntries` is exceeded.
   */
  set(
    documentId: string,
    queryEmbedding: number[],
    processedQuery: ProcessedQuery,
    result: unknown
  ): void {
    const entry: CacheEntry = {
      queryEmbedding,
      processedQuery,
      result,
      createdAt: Date.now(),
      hitCount: 0,
    };

    let entries = this.store.get(documentId) ?? [];

    entries = [entry, ...entries];

    // Evict oldest when over capacity
    while (entries.length > this.config.maxEntries) {
      entries.pop();
      this.metrics.evictions += 1;
    }

    this.store.set(documentId, entries);
  }

  // ---------------------------------------------------------------------------
  // Invalidation
  // ---------------------------------------------------------------------------

  /**
   * Remove all cached entries for a documentId.
   * Call this when the document index is deleted or re-indexed.
   */
  invalidate(documentId: string): void {
    const entries = this.store.get(documentId);

    if (entries) {
      this.metrics.evictions += entries.length;
    }

    this.store.delete(documentId);
  }

  /** Flush the entire cache. */
  clear(): void {
    for (const entries of this.store.values()) {
      this.metrics.evictions += entries.length;
    }

    this.store.clear();
  }

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  getMetrics(): Readonly<CacheMetrics> {
    return { ...this.metrics };
  }

  get size(): number {
    let total = 0;

    for (const entries of this.store.values()) {
      total += entries.length;
    }

    return total;
  }
}

// ---------------------------------------------------------------------------
// Cosine similarity helper
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);

  return denom === 0 ? 0 : dot / denom;
}
