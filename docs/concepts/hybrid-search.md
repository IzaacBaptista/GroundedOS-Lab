# Hybrid Search

## What it is

**Hybrid search** combines dense semantic search with sparse keyword or lexical search. The goal is to capture both meaning-based similarity and exact term matching.

## Why it matters

Grounded documents often contain product names, IDs, error codes and exact phrases. Dense retrieval can miss these. Hybrid search improves retrieval reliability by combining semantic and lexical evidence.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Implements `mode: "hybrid"` retrieval with dense score + sparse lexical score blending. |
| [`apps/api/src/rag-service.ts`](../../apps/api/src/rag-service.ts) | Uses hybrid mode by default in ask workflows before answer construction. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares hybrid retrieval against dense-only baselines. |
| [`packages/evals`](../../packages/evals/README.md) | Measures retrieval relevance and answer faithfulness. |
| [`packages/viz`](../../packages/viz/README.md) | Can expose retrieval scores and chunk origins. |

## Current implementation notes

- Dense candidates are fetched from vector search.
- Sparse lexical score is computed with character n-gram overlap for robustness.
- Final ranking blends both signals using configurable weights.
- Dev Mode can expose hybrid diagnostics (`denseWeight`, `sparseWeight`, `candidateCount`).

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Quality vs complexity** | Combining search modes improves coverage but adds scoring and tuning work. |
| **Score calibration** | Dense and sparse scores are not directly comparable without normalization. |
| **Indexing cost** | Maintaining two retrieval indexes can increase storage and operations. |
