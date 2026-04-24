import { describe, it, expect } from "vitest";
import { SemanticCache } from "./semantic-cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DIMS = 8;

function vec(values: number[]): number[] {
  return values;
}

/** A unit vector in the direction of `values`. */
function unit(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  return magnitude === 0 ? values : values.map((v) => v / magnitude);
}

const VEC_A = unit([1, 0, 0, 0, 0, 0, 0, 0]);
const VEC_B = unit([0.9, 0.1, 0.05, 0, 0, 0, 0, 0]);  // very similar to A
const VEC_C = unit([0, 0, 0, 0, 0, 1, 0, 0]);          // unrelated to A

const PROCESSED_QUERY = {
  original: "What is RAG?",
  expanded: ["retrieval augmented generation"],
  intent: "factual" as const,
  confidence: 0.9,
};

const FAKE_RESULT = { answer: { grounded: true, text: "RAG is..." }, query: "What is RAG?" };

function warmCache(cache: SemanticCache, docId = "doc-1"): void {
  cache.set(docId, VEC_A, PROCESSED_QUERY, FAKE_RESULT);
}

// ---------------------------------------------------------------------------
// Lookup: identical queries always hit
// ---------------------------------------------------------------------------

describe("SemanticCache — identical queries", () => {
  it("returns a cache hit for the exact same embedding", () => {
    const cache = new SemanticCache({ similarityThreshold: 0.9 });
    warmCache(cache);

    const result = cache.lookup("doc-1", VEC_A);
    expect(result.hit).toBe(true);
    expect(result.entry?.result).toEqual(FAKE_RESULT);
  });

  it("increments hitCount on repeated lookups", () => {
    const cache = new SemanticCache({ similarityThreshold: 0.9 });
    warmCache(cache);

    cache.lookup("doc-1", VEC_A);
    cache.lookup("doc-1", VEC_A);

    const result = cache.lookup("doc-1", VEC_A);
    expect(result.entry?.hitCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Lookup: semantically similar queries hit above threshold
// ---------------------------------------------------------------------------

describe("SemanticCache — similar queries", () => {
  it("returns a hit when similarity >= threshold", () => {
    // VEC_B is very similar to VEC_A; threshold = 0.9
    const cache = new SemanticCache({ similarityThreshold: 0.9 });
    warmCache(cache);

    const result = cache.lookup("doc-1", VEC_B);
    // VEC_B is a slight rotation of VEC_A — should be above 0.9
    expect(result.hit).toBe(true);
    expect(result.similarity).toBeGreaterThanOrEqual(0.9);
  });
});

// ---------------------------------------------------------------------------
// Lookup: unrelated queries miss
// ---------------------------------------------------------------------------

describe("SemanticCache — unrelated queries", () => {
  it("returns a miss when similarity < threshold", () => {
    const cache = new SemanticCache({ similarityThreshold: 0.9 });
    warmCache(cache);

    const result = cache.lookup("doc-1", VEC_C);
    expect(result.hit).toBe(false);
  });

  it("returns a miss for an empty cache", () => {
    const cache = new SemanticCache();
    const result = cache.lookup("doc-1", VEC_A);
    expect(result.hit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Eviction: maxEntries
// ---------------------------------------------------------------------------

describe("SemanticCache — eviction", () => {
  it("does not exceed maxEntries per documentId", () => {
    const cache = new SemanticCache({ maxEntries: 3, similarityThreshold: 0.5 });
    // Insert 5 distinct entries
    for (let i = 0; i < 5; i++) {
      const v = unit([i + 1, 0, 0, 0, 0, 0, 0, 0]);
      cache.set("doc-x", v, PROCESSED_QUERY, FAKE_RESULT);
    }

    expect(cache.size).toBe(3);
    expect(cache.getMetrics().evictions).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// TTL: expired entries should not be returned
// ---------------------------------------------------------------------------

describe("SemanticCache — TTL", () => {
  it("does not return an expired entry", async () => {
    // TTL of 5ms — essentially immediate expiry
    const cache = new SemanticCache({ ttlMs: 5, similarityThreshold: 0.9 });
    warmCache(cache);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = cache.lookup("doc-1", VEC_A);
    expect(result.hit).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Invalidation
// ---------------------------------------------------------------------------

describe("SemanticCache — invalidation", () => {
  it("clears all entries for a documentId on invalidate()", () => {
    const cache = new SemanticCache({ similarityThreshold: 0.9 });
    warmCache(cache, "doc-to-invalidate");

    // Should hit before invalidation
    expect(cache.lookup("doc-to-invalidate", VEC_A).hit).toBe(true);

    cache.invalidate("doc-to-invalidate");

    // Should miss after invalidation
    expect(cache.lookup("doc-to-invalidate", VEC_A).hit).toBe(false);
    expect(cache.size).toBe(0);
    expect(cache.getMetrics().evictions).toBeGreaterThan(0);
  });

  it("only invalidates the target documentId, not other entries", () => {
    const cache = new SemanticCache({ similarityThreshold: 0.9 });
    warmCache(cache, "doc-A");
    warmCache(cache, "doc-B");

    cache.invalidate("doc-A");

    expect(cache.lookup("doc-A", VEC_A).hit).toBe(false);
    expect(cache.lookup("doc-B", VEC_A).hit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe("SemanticCache — metrics", () => {
  it("tracks hits and misses correctly", () => {
    const cache = new SemanticCache({ similarityThreshold: 0.9 });
    warmCache(cache);

    cache.lookup("doc-1", VEC_A);  // hit
    cache.lookup("doc-1", VEC_C);  // miss
    cache.lookup("doc-1", VEC_C);  // miss

    const metrics = cache.getMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(2);
  });
});
