# Vector Database

## What it is

A **vector database** stores embeddings and supports nearest-neighbor search over vector representations.

## Why it matters

RAG needs a retrieval layer that can find semantically related chunks quickly. A vector database provides the indexing and query primitives for semantic search, memory recall and similarity inspection.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Uses vector search to retrieve candidate chunks. |
| [`packages/memory`](../../packages/memory/README.md) | Can use vector-backed long-term memory. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Measures retrieval latency and quality across configurations. |
| [`packages/viz`](../../packages/viz/README.md) | Visualizes similarity, clusters and retrieval results. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Recall vs speed** | Approximate search improves speed but may miss some nearest neighbors. |
| **Operational complexity** | Vector stores require indexing, migrations, backups and monitoring. |
| **Hybrid needs** | Pure vector search may underperform on exact terms, IDs or rare entities. |
