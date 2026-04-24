# rag

Retrieval-Augmented Generation pipeline. Implements the full retrieval stack from document ingestion to context assembly.

## Responsibilities

- Chunk and embed documents into vector representations
- Perform hybrid search (dense + sparse) over the vector store
- Re-rank retrieved candidates for relevance
- Assemble the final context window for LLM inference
- Support Adaptive RAG (decide when retrieval is needed)

## Status

In Progress - Phase 1 chunking, deterministic local embeddings, semantic
embedding provider interfaces, in-memory vector storage, first retrieval flow
and Dev Mode retrieval output contract implemented. Re-ranking and context
assembly remain planned.

## Current implementation

The first Phase 1 slices expose deterministic character-based chunking through
`chunkDocument()`, embedding contracts and local deterministic providers,
local similarity search through `InMemoryVectorStore`, and end-to-end local
retrieval through `buildRetrievalIndex()` and `retrieveFromIndex()`.

From the repository root, the complete local pipeline can be exercised with:

```bash
npm run rag:smoke -- --dataset phase-0-smoke-text --query "What does this command verify?"
npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
```

The smoke command runs a registered dataset through ETL, chunking, embeddings,
in-memory vector search and Dev Mode output generation. The ask command runs
the same local pipeline against an arbitrary local text or PDF file. Both print
a simple grounded answer plus retrieval diagnostics.

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
first retrieval pipeline wiring. The package now has two compatible layers:

- `EmbeddingProvider`, the existing low-level interface used by the retrieval
  pipeline.
- `SemanticEmbeddingsProvider`, the provider contract that exposes model
  metadata, per-input results and future provider compatibility.

`LocalHashEmbeddingsProvider` is the first semantic-style provider. It hashes
tokens and token bigrams into a fixed 256-dimensional L2-normalized vector by
default. It is deterministic and dependency-free, but still not a semantic
quality baseline like a real embedding model.

`OllamaEmbeddingsProvider` is the first real semantic provider. It calls
Ollama's local `/api/embed` endpoint, uses `embeddinggemma` with 768 dimensions
by default, and remains opt-in so tests and local smoke flows stay deterministic
without requiring an external service.

```ts
import {
  DeterministicEmbeddingProvider,
  LocalHashEmbeddingsProvider,
  OllamaEmbeddingsProvider,
  chunkDocument,
  embedChunks,
  semanticToEmbeddingProvider,
} from "@groundedos/rag";

const chunks = chunkDocument(normalizedDocument);
const embeddedChunks = await embedChunks(
  chunks,
  new DeterministicEmbeddingProvider({ dimensions: 16 })
);

const localHashProvider = semanticToEmbeddingProvider(
  new LocalHashEmbeddingsProvider()
);
const localHashChunks = await embedChunks(chunks, localHashProvider);

const ollamaProvider = semanticToEmbeddingProvider(
  new OllamaEmbeddingsProvider({
    baseUrl: "http://localhost:11434",
    model: "embeddinggemma",
    dimensions: 768,
  })
);
const semanticChunks = await embedChunks(chunks, ollamaProvider);
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
The local CLI usage guide is documented in
[`docs/phase-1-local-rag.md`](../../docs/phase-1-local-rag.md).
The end-to-end internals guide is documented in
[`docs/phase-1-rag-internals.md`](../../docs/phase-1-rag-internals.md).

## Public API

| Export | Purpose |
|---|---|
| `chunkDocument(document, options?)` | Convert normalized document sections into retrieval chunks |
| `RetrievalChunk` | Stable chunk shape for retrieval and Dev Mode diagnostics |
| `ChunkDocumentOptions` | Optional chunk size and overlap settings |
| `embedChunks(chunks, provider)` | Attach embedding vectors to retrieval chunks |
| `EmbeddingProvider` | Interface for local or remote embedding providers |
| `DeterministicEmbeddingProvider` | Local deterministic provider for tests and development |
| `SemanticEmbeddingsProvider` | Higher-level embedding provider contract with model metadata |
| `EmbeddingModelInfo` | Provider/model/dimension metadata for compatibility and Dev Mode output |
| `LocalHashEmbeddingsProvider` | Local deterministic token/ngram hashing provider |
| `OllamaEmbeddingsProvider` | Opt-in local semantic embedding provider using Ollama `/api/embed` |
| `semanticToEmbeddingProvider(provider)` | Adapt a semantic provider to the existing retrieval pipeline |
| `embeddingProviderToSemantic(provider, modelInfo?)` | Wrap a legacy provider with the semantic provider contract |
| `createEmbeddingProviderRegistry(providers?)` | Create a small provider registry for semantic providers |
| `EmbeddedChunk` | Retrieval chunk plus embedding vector and embedding metadata |
| `InMemoryVectorStore` | Local vector store with insert, similarity search and metadata filtering |
| `VectorSearchResult` | Search result containing an embedded chunk and cosine similarity score |
| `buildRetrievalIndex(document, options?)` | Chunk, embed and insert a normalized document into a local retrieval index |
| `retrieveFromIndex(index, query, options?)` | Embed a query and retrieve ranked chunks from an index |
| `RetrievalIndex` | Local retrieval index with provider, store and embedded chunks |
| `retrieveForDevMode(index, query, options?)` | Retrieve ranked chunks as the Dev Mode diagnostics contract |
| `RetrievalDevModeOutput` | Stable Dev Mode retrieval output shape |
