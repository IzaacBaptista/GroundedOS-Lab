# rag

Retrieval-Augmented Generation pipeline. Implements the full retrieval stack from document ingestion to context assembly.

## Responsibilities

- Chunk and embed documents into vector representations
- Perform hybrid search (dense + sparse) over the vector store
- Re-rank retrieved candidates for relevance
- Assemble the final context window for LLM inference
- Support Adaptive RAG (decide when retrieval is needed)

## Status

In Progress - Phase 1 chunking, deterministic local embeddings, in-memory vector storage, first retrieval flow and Dev Mode retrieval output contract implemented. Re-ranking and context assembly remain planned.

## Current implementation

The first Phase 1 slices expose deterministic character-based chunking through
`chunkDocument()`, a local deterministic embedding provider through
`embedChunks()`, local similarity search through `InMemoryVectorStore`, and
end-to-end local retrieval through `buildRetrievalIndex()` and
`retrieveFromIndex()`.

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

Embeddings are local and deterministic by default, intended for tests and the
first retrieval pipeline wiring. They are not a semantic quality baseline.

```ts
import {
  DeterministicEmbeddingProvider,
  chunkDocument,
  embedChunks,
} from "@groundedos/rag";

const chunks = chunkDocument(normalizedDocument);
const embeddedChunks = await embedChunks(
  chunks,
  new DeterministicEmbeddingProvider({ dimensions: 16 })
);
```

The in-memory vector store supports insert, cosine similarity search, `topK`
limits and exact-match filtering over flat chunk metadata such as `documentId`,
`sectionId`, `modality`, `page`, `sourceType`, `originalFilename` and
`embeddingProvider`.

```ts
import { InMemoryVectorStore } from "@groundedos/rag";

const store = new InMemoryVectorStore();
store.insert(embeddedChunks);

const results = store.search({
  embedding: embeddedChunks[0].embedding,
  topK: 3,
  filter: { modality: "text" },
});
```

For the first local retrieval flow:

```ts
import { buildRetrievalIndex, retrieveFromIndex } from "@groundedos/rag";

const index = await buildRetrievalIndex(normalizedDocument);
const results = await retrieveFromIndex(index, "what does this document say?", {
  topK: 3,
});
```

For Dev Mode diagnostics, use `retrieveForDevMode()` to return the documented
retrieval output shape with chunk IDs, scores, source metadata and offsets.

```ts
import { retrieveForDevMode } from "@groundedos/rag";

const devOutput = await retrieveForDevMode(index, "what does this document say?", {
  topK: 3,
});
```

The output contract is documented in
[`docs/phase-1-dev-mode-output.md`](../../docs/phase-1-dev-mode-output.md).

## Public API

| Export | Purpose |
|---|---|
| `chunkDocument(document, options?)` | Convert normalized document sections into retrieval chunks |
| `RetrievalChunk` | Stable chunk shape for retrieval and Dev Mode diagnostics |
| `ChunkDocumentOptions` | Optional chunk size and overlap settings |
| `embedChunks(chunks, provider)` | Attach embedding vectors to retrieval chunks |
| `EmbeddingProvider` | Interface for local or remote embedding providers |
| `DeterministicEmbeddingProvider` | Local deterministic provider for tests and development |
| `EmbeddedChunk` | Retrieval chunk plus embedding vector and embedding metadata |
| `InMemoryVectorStore` | Local vector store with insert, similarity search and metadata filtering |
| `VectorSearchResult` | Search result containing an embedded chunk and cosine similarity score |
| `buildRetrievalIndex(document, options?)` | Chunk, embed and insert a normalized document into a local retrieval index |
| `retrieveFromIndex(index, query, options?)` | Embed a query and retrieve ranked chunks from an index |
| `RetrievalIndex` | Local retrieval index with provider, store and embedded chunks |
| `retrieveForDevMode(index, query, options?)` | Retrieve ranked chunks as the Dev Mode diagnostics contract |
| `RetrievalDevModeOutput` | Stable Dev Mode retrieval output shape |
