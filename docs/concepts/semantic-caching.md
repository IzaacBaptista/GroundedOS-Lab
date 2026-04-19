# Semantic Caching

## What it is

**Semantic caching** reuses previous results for inputs that are semantically similar, not just byte-for-byte identical.

## Why it matters

AI requests can be expensive and slow. Semantic caching can reduce repeated retrieval and inference work when users ask equivalent questions, while preserving better flexibility than exact cache keys.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`README.md` architecture](../../README.md#-architecture) | Includes semantic cache as an optional stage before RAG. |
| [`packages/rag`](../../packages/rag/README.md) | Can reuse retrieval or answer artifacts for similar queries. |
| [`packages/observability`](../../packages/observability/README.md) | Tracks cache hit rate and latency impact. |
| [`packages/model-routing`](../../packages/model-routing/README.md) | Can avoid model calls when a trusted cached result is valid. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Savings vs staleness** | Cached answers can become outdated when source documents change. |
| **Similarity threshold** | Loose thresholds risk wrong reuse; strict thresholds reduce cache hits. |
| **Invalidation** | Grounded caches need document lineage and version-aware invalidation. |
