# ADR-024 — Declared similarity metric per embedding model

**Status:** Accepted

## Context

The RAG book's chapter 11 covers embeddings fundamentals and is explicit that
similarity is not one fixed concept: cosine similarity (direction only),
dot product (direction + magnitude — some models encode extra signal in
vector length), and Euclidean distance (straight-line distance, smaller is
more similar) are three different, non-interchangeable ways to compare
vectors. The book calls out that using the wrong metric for a given model
is "an erro sutil e comum" — a silent quality regression, not a crash,
because nothing in a typical pipeline checks whether the metric matches
what the model was evaluated on.

Auditing the code: `InMemoryVectorStore.search()` computed **only** cosine
similarity, unconditionally, with no way to select or even record a
different metric. `EmbeddingModelInfo` had no field for it at all. Every
provider (`LocalHashEmbeddingsProvider`, `OllamaEmbeddingsProvider`,
`OpenAIEmbeddingsProvider`, `DeterministicEmbeddingProvider`) happens to work
fine under cosine today, so this wasn't producing a visible bug — but the
book's own warning is specifically that this class of bug *doesn't* show up
until a differently-tuned model is swapped in, and the codebase had no
mechanism to prevent or even flag that.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Where to record the metric | Add `similarityMetric?: SimilarityMetric` to `EmbeddingModelInfo`, defaulting to `"cosine"` when a provider doesn't declare one | Inferring the metric from provider id via a lookup table (rejected: brittle, and doesn't help a caller plugging in a genuinely new provider) |
| Where the metric lives per-chunk | Copied onto `EmbeddedChunk.embeddingMetadata.similarityMetric` at embed time (same place `dimensions`/`normalized` already live) | Passing the metric only at query time via `VectorSearchQuery` (rejected: the metric is a property of the *embedding*, not the *query* — a caller could accidentally request the wrong metric for stored vectors with no way for the store to catch it) |
| Store behavior with mixed metrics | `InMemoryVectorStore` tracks the metric like it already tracks `dimensions`, and rejects inserting a chunk whose declared metric conflicts with what's already stored | Silently using whatever the first chunk declared and ignoring later mismatches (rejected: exactly the silent-regression failure mode the book warns about — this makes it a loud error at insert time instead) |
| Euclidean scoring vs the store's existing "higher score wins" sort | Convert distance to a score via `1 / (1 + distance)` — monotonic, so ranking is identical to sorting by raw distance ascending, but keeps a single sort direction across all three metrics | Branching the sort direction based on metric (rejected: more branching in `search()` for no behavioral difference, since the transform is order-preserving) |
| Score bounds in `VectorSearchResultSchema` | Relaxed `score: z.number().min(-1).max(1)` to `z.number()` | Keeping the bound and special-casing validation per metric (rejected: unnecessary complexity — cosine still naturally falls in [-1,1], dot product and the euclidean-derived score just aren't bounded the same way, and nothing downstream depends on the bound) |

## Decision

- `EmbeddingModelInfo.similarityMetric?: "cosine" | "dotProduct" | "euclidean"`
  added in `packages/rag/src/embeddings.ts`; all four built-in providers
  declare `"cosine"` explicitly.
- `embedChunks()` copies the metric (defaulting to `"cosine"` when a provider
  has none) onto `EmbeddedChunk.embeddingMetadata.similarityMetric`.
- `InMemoryVectorStore` picks the scoring function (`cosineSimilarity`,
  `dotProductScore`, or `euclideanScore`) based on the metric declared by
  its stored chunks, validated for consistency the same way dimensions
  already are.
- `EmbeddedChunkSchema`/`VectorSearchResultSchema` (`@groundedos/core`)
  updated to match.

## Consequences

- Swapping in a future embedding provider whose model is documented as
  dot-product- or Euclidean-optimized now works correctly out of the box
  once its `getModelInfo()` declares that metric — no vector store change
  needed.
- Accidentally mixing embeddings from providers with different declared
  metrics in the same `InMemoryVectorStore` now fails loudly at `insert()`
  instead of silently producing degraded rankings.
- `PgvectorVectorStore`/`QdrantVectorStore` (external vector backends) are
  untouched by this ADR — they have their own metric configuration at the
  database/collection level, and reconciling that with
  `EmbeddingModelInfo.similarityMetric` is future work if/when that gap is
  audited against the book's own vector-store chapter (cap. 13).
