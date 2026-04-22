# rag

Retrieval-Augmented Generation pipeline. Implements the full retrieval stack from document ingestion to context assembly.

## Responsibilities

- Chunk and embed documents into vector representations
- Perform hybrid search (dense + sparse) over the vector store
- Re-rank retrieved candidates for relevance
- Assemble the final context window for LLM inference
- Support Adaptive RAG (decide when retrieval is needed)

## Status

In Progress - Phase 1 chunking implemented. Embeddings, vector storage, retrieval, re-ranking and context assembly remain planned.

## Current implementation

The first Phase 1 slice exposes deterministic character-based chunking through
`chunkDocument()`.

```ts
import { chunkDocument } from "@groundedos/rag";

const chunks = chunkDocument(normalizedDocument, {
  maxChunkChars: 800,
  overlapChars: 100,
});
```

`chunkDocument()` consumes a `NormalizedDocument` from `packages/core` and
returns retrieval chunks with stable IDs, source section IDs, offsets, text and
metadata needed by future Dev Mode retrieval diagnostics.

Defaults:

| Option | Default | Description |
|---|---:|---|
| `maxChunkChars` | `800` | Maximum character window size per chunk |
| `overlapChars` | `100` | Character overlap between consecutive chunks in the same section |

Chunking is section-local: chunks do not cross `DocumentSection` boundaries.

## Public API

| Export | Purpose |
|---|---|
| `chunkDocument(document, options?)` | Convert normalized document sections into retrieval chunks |
| `RetrievalChunk` | Stable chunk shape for retrieval and Dev Mode diagnostics |
| `ChunkDocumentOptions` | Optional chunk size and overlap settings |
