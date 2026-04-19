# Embeddings

## What it is

**Embeddings** are vector representations of text or other data. Similar items should land near each other in vector space, allowing semantic search and clustering.

## Why it matters

Embeddings are the bridge between normalized documents and semantic retrieval. They allow GroundedOS Lab to search by meaning rather than exact keywords and support memory recall, similarity maps and retrieval diagnostics.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Embeds chunks for vector search and retrieval. |
| [`packages/memory`](../../packages/memory/README.md) | Can use vector-backed recall for long-term memory. |
| [`packages/viz`](../../packages/viz/README.md) | Visualizes embedding spaces and similarity maps. |
| [`packages/benchmarks`](../../packages/benchmarks/README.md) | Compares retrieval quality across embedding choices. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Semantic recall vs exactness** | Embeddings find meaning but can miss exact identifiers or rare terms. |
| **Model choice** | Embedding model quality strongly affects downstream retrieval. |
| **Storage cost** | Large vector indexes add storage and update complexity. |
