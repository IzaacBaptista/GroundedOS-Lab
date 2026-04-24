# ADR-009: Semantic Cache Design
## Status
Accepted

## Context
Exact-string caches miss many naturally equivalent user queries. GroundedOS needs semantic reuse to reduce repeated retrieval work while preserving answer quality.

## Decision
Adopt an in-memory semantic cache for Phase 2 keyed by document scope with cosine similarity lookup over query embeddings. Expose cache metrics (`hits`, `misses`, `evictions`) and support document-level invalidation.

## Consequences
- Lower repeated retrieval cost/latency for similar queries.
- Requires careful similarity thresholds to avoid false hits.
- Cache is process-local; no cross-instance sharing until Redis-backed phase.

## Alternatives considered
- **Exact text cache:** simple but low hit rate for paraphrases.
- **Persistent Redis cache now:** useful at scale but unnecessary complexity for Phase 2 local-first setup.
- **No cache:** simplest, but leaves avoidable repeated work.
