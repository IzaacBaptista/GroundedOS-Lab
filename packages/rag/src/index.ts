/**
 * @packageDocumentation
 * rag
 *
 * Retrieval-Augmented Generation primitives for GroundedOS Lab.
 */

export {
  chunkDocument,
  type ChunkDocumentOptions,
  type ChunkOffsetBasis,
  type RetrievalChunk,
  type RetrievalChunkMetadata,
} from "./chunking";

export {
  DeterministicEmbeddingProvider,
  LocalHashEmbeddingsProvider,
  OpenAIEmbeddingsProvider,
  OllamaEmbeddingsProvider,
  createEmbeddingProviderRegistry,
  embeddingProviderToSemantic,
  embedChunks,
  semanticToEmbeddingProvider,
  type DeterministicEmbeddingProviderOptions,
  type EmbedTextInput,
  type EmbedTextResult,
  type EmbeddedChunk,
  type EmbeddingModelInfo,
  type EmbeddingProvider,
  type EmbeddingProviderId,
  type EmbeddingProviderRegistry,
  type EmbeddingVector,
  type LocalHashEmbeddingsProviderOptions,
  type OpenAIEmbeddingsProviderOptions,
  type OllamaEmbeddingsProviderOptions,
  type SemanticEmbeddingsProvider,
} from "./embeddings";

export {
  InMemoryVectorStore,
  type VectorMetadataFilter,
  type VectorSearchQuery,
  type VectorSearchResult,
  type VectorStore,
} from "./vector-store";

export {
  PgvectorVectorStore,
  createVectorStore,
  resolveVectorBackend,
  type PgClient,
  type PgvectorStoreOptions,
} from "./pgvector-store";

export {
  buildRetrievalIndex,
  createRetrievalDevOutput,
  retrieveForDevMode,
  retrieveFromIndex,
  type BuildRetrievalIndexOptions,
  type RetrievalDevModeOutput,
  type RetrievalDevModeResult,
  type RetrievalIndex,
  type RetrievalMode,
  type RetrievalResult,
  type RetrieveFromIndexOptions,
} from "./retrieval";

// Query Understanding (Phase 2 — Concept 1)
export {
  processQuery,
  rewriteQuery,
  expandQuery,
  detectIntent,
} from "./query-understanding";

// Semantic Cache (Phase 2 — Concept 4)
export {
  SemanticCache,
  buildCacheKey,
  hashContextSignature,
  selectAdaptiveCacheThreshold,
  type CacheEntry,
  type SemanticCacheConfig,
  type CacheLookupResult,
  type CacheMetrics,
  type CacheLookupContext,
  type CacheStoreContext,
  type CacheShadowEvalInput,
  type AdaptiveThresholdInput,
} from "./semantic-cache";
