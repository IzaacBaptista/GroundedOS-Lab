# Re-ranking

## What it is

**Re-ranking** takes an initial set of retrieved candidates and reorders them with a stronger relevance model or scoring strategy.

## Why it matters

Initial retrieval is usually optimized for speed and broad recall. Re-ranking improves the final context by pushing the most useful chunks to the top before they consume context window space.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Applies relevance ordering before context assembly. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Measures latency and quality impact of rerankers. |
| [`packages/evals`](../../packages/evals/README.md) | Scores retrieval relevance and answer faithfulness. |
| [`packages/observability`](../../packages/observability/README.md) | Tracks reranking latency and selected chunks. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Precision vs latency** | Reranking improves final context but adds another model or scoring step. |
| **Cost** | Cross-encoder or LLM rerankers can be more expensive than vector search. |
| **Candidate depth** | Too few candidates limits reranking value; too many increases latency. |
