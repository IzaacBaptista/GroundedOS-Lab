# ADR-027 — ANN index metric correctness and recall/latency tuning knobs

**Status:** Accepted

## Context

The RAG book's chapter 14 covers how vector stores index embeddings for
approximate nearest-neighbor (ANN) search: brute-force as the exact
baseline, HNSW and IVF as the two dominant ANN structures, Product
Quantization for memory, and the central point that **recall vs latency is
a trade-off every ANN structure makes, tunable via its own parameters — not
a value to pick once and never revisit.**

Auditing the two real backends fixed in ADR-026:

- **`PgvectorVectorStore`** always built an `ivfflat` index with
  `vector_cosine_ops` and always queried with the `<=>` (cosine) operator,
  regardless of what `similarityMetric` the embedding model actually
  declared (`EmbeddingModelInfo.similarityMetric`, ADR-024). A model
  configured for `dotProduct` or `euclidean` would still get scored with
  cosine distance — silently wrong, no error. There was also no way to
  choose `hnsw` (pgvector ≥ 0.5, generally the better default per the book)
  over `ivfflat`, and no way to tune either structure's recall/latency
  parameters (`lists`/`probes` for ivfflat, `m`/`ef_construction`/`ef_search`
  for hnsw) — they were hardcoded.
- **`QdrantVectorStore`** always created its collection with
  `distance: "Cosine"` — the same silent-wrong-metric bug — and exposed no
  way to configure HNSW's build-time (`m`, `ef_construct`) or query-time
  (`hnsw_ef`, `exact`) parameters, despite Qdrant's API supporting all of
  them directly.
- **`ElasticsearchVectorStore`**'s native `knn` query hardcoded
  `num_candidates` to `max(topK * 10, 50)` with no override, even though
  `num_candidates` is exactly the book's recall/latency knob for this
  backend.
- `InMemoryVectorStore` was left alone — it's already brute-force, which
  the book treats as the correctness baseline, not a gap to fix.

## Options considered

| Gap | Option chosen | Alternatives considered |
|---|---|---|
| Where the metric is declared for pgvector/Qdrant | A `similarityMetric` constructor option on each store (default `"cosine"`), matching the same `SimilarityMetric` type `EmbeddingModelInfo` already uses (ADR-024) | Inferring it from the first inserted chunk's `embeddingMetadata.similarityMetric`, like `InMemoryVectorStore` does | Rejected for these two specifically: pgvector's index (and Qdrant's collection) must be created with the right operator class/distance *before* any data is inserted — there's no chunk to infer from yet at bootstrap time, so it has to be an explicit, caller-supplied setting |
| pgvector index type choice | `indexType: "ivfflat" \| "hnsw"` option, default `"ivfflat"` (preserves existing behavior for anyone already relying on it) | Defaulting to `"hnsw"` (rejected: the book presents it as *generally* better, not universally — changing the default would silently change existing deployments' index structure on upgrade) |
| pgvector's `<#>` operator sign | `-(embedding <#> $1::vector)` to recover the actual (positive-when-similar) inner product, since pgvector's `<#>` returns the *negative* inner product by convention | Leaving the raw `<#>` value as the score (rejected: would invert the "higher score = more similar" convention ADR-024 established everywhere else) |
| Recall/latency knobs' scope | Store-level constructor options (`probes`, `hnswEfSearch` for pgvector; `hnswEf`, `exact` for Qdrant; `numCandidates` for Elasticsearch) applied to every search from that store instance | Per-query options on `VectorSearchQuery` (rejected: that's a shared interface across every backend including `InMemoryVectorStore`, which has no such concept — leaking backend-specific tuning into it would couple all callers to Qdrant/pgvector-specific vocabulary) |
| SQL injection risk from interpolating tuning numbers into DDL/`SET` statements | Validate every numeric tuning value with `Number.isInteger(value) && value > 0` before string-interpolating it (Postgres doesn't support parameterized DDL) | Accepting arbitrary values (rejected: these ultimately come from server-side config in realistic deployments, but validating costs nothing and closes the door on a misconfigured or attacker-influenced value producing malformed/injected SQL) |
| Index maintenance | Added `PgvectorVectorStore.reindexAnn()` running `REINDEX INDEX CONCURRENTLY` | A cron-triggered background job wired into the API layer (rejected as this round's scope: the book's point is that periodic rebuild is *necessary*, not that this codebase needs to own the scheduling — exposing the primitive is the package-layer responsibility; wiring a schedule is an operational/deployment decision) |

## Decision

- `PgvectorStoreOptions` gained `similarityMetric`, `indexType`,
  `ivfflatLists`, `hnswM`, `hnswEfConstruction`, `probes`, `hnswEfSearch`.
  `bootstrapSchema()` builds the correct index type/operator class;
  `searchAsync()` uses the matching operator/score formula and issues a
  `SET ivfflat.probes = N` / `SET hnsw.ef_search = N` before searching when
  configured. Added `reindexAnn()`.
- `QdrantStoreOptions` gained `similarityMetric`, `hnswM`, `hnswEfConstruct`,
  `hnswEf`, `exact`. `ensureCollection()` sets the matching `distance` and
  `hnsw_config`; `searchAsync()` passes `params: {hnsw_ef, exact}` when set.
- `ElasticsearchStoreOptions` gained `numCandidates`, overriding the
  `topK`-derived default when set.
- Added `pgvector-store.test.ts` coverage for index DDL, operator/score
  selection, and the `SET`/`reindexAnn()` statements (no prior test asserted
  any of this — the metric-mismatch bug had zero test coverage before now).

## Consequences

- Configuring a pgvector or Qdrant backend with a non-cosine embedding model
  (e.g. an OpenAI model documented as dot-product-optimized) now actually
  scores and orders results correctly, instead of silently using the wrong
  distance function.
- Recall/latency is now a real, documented, per-backend knob instead of a
  value baked into the schema at first deploy — matching the book's
  explicit instruction to validate this empirically rather than pick once.
- `apps/api`'s `createApiVectorStore()` still only wires up Qdrant with a
  fixed default configuration (no `similarityMetric`/HNSW options threaded
  from env vars yet) and pgvector isn't wired at all — same precedent as
  ADR-026: the capability is real and tested at the `packages/rag` layer,
  API-level configuration surface is separate follow-up work.
- No scheduling mechanism calls `reindexAnn()` automatically; a deployment
  that wants periodic ANN index maintenance has to invoke it itself (e.g.
  from a cron job or the existing jobs queue in `apps/api`).
