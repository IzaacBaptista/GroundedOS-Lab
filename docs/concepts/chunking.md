# Chunking

## What it is

**Chunking** splits documents into smaller units that can be embedded, indexed, retrieved and placed into a model context window.

## Why it matters

Chunk quality directly affects RAG quality. Chunks that are too small lose context; chunks that are too large waste tokens and reduce retrieval precision. GroundedOS Lab treats chunking as a core retrieval design decision.

## Where it is used

| Package / Location | How it uses the concept |
|---|---|
| [`packages/rag`](../../packages/rag/README.md) | Owns chunk generation and context assembly for retrieval. |
| [`packages/etl`](../../packages/etl/README.md) | Produces normalized sections that feed chunking. |
| [`packages/core`](../../packages/core/README.md) | Defines `DocumentSection`, the input shape for future chunking. |
| [`packages/viz`](../../packages/viz/README.md) | Can show chunk similarity and retrieval results. |

## Trade-offs

| Trade-off | Detail |
|---|---|
| **Small chunks** | Improve precision but can lose surrounding meaning. |
| **Large chunks** | Preserve context but increase token cost and retrieval noise. |
| **Structure-aware splitting** | Better quality requires respecting headings, pages, tables or speaker turns. |
