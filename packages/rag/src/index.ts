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
  type PgClient,
  type PgvectorStoreOptions,
} from "./pgvector-store";

export {
  QdrantVectorStore,
  type QdrantStoreOptions,
} from "./qdrant-store";

export {
  DualWriteVectorStore,
  createDefaultVectorStore,
  createVectorStoreForDualWrite,
  isVectorDualWriteEnabled,
  resolveVectorBackend,
  type VectorBackend,
} from "./vector-backend";

export {
  buildRetrievalIndex,
  createRetrievalDevOutput,
  retrieveForDevMode,
  retrieveFromIndex,
  type AdaptiveRoutingTrace,
  type BuildRetrievalIndexOptions,
  type GraphRetrievalTrace,
  type RetrievalDevModeOutput,
  type RetrievalDevModeResult,
  type RetrievalIndex,
  type RetrievalMode,
  type RetrievalResult,
  type RetrieveFromIndexOptions,
} from "./retrieval";

export {
  buildHypotheticalDocument,
  buildRaptorTree,
  retrieveFromRaptorTree,
  type ClusterSummary,
  type HyDETrace,
  type RetrievalFusionTrace,
  type RaptorNode,
  type RaptorTrace,
  type RaptorTree,
} from "./advanced-retrieval";

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
