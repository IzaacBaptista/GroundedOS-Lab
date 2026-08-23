/**
 * @packageDocumentation
 * rag
 *
 * Retrieval-Augmented Generation primitives for GroundedOS Lab.
 */

export {
  chunkDocument,
  chunkDocumentWithParents,
  type ChunkDocumentOptions,
  type ChunkDocumentWithParentsResult,
  type ChunkOffsetBasis,
  type ChunkStrategy,
  type HierarchicalChunk,
  type ParentChunk,
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
  truncateEmbedding,
  truncateEmbeddedChunk,
  type DeterministicEmbeddingProviderOptions,
  type EmbedTextInput,
  type EmbedTextResult,
  type EmbeddedChunk,
  type EmbeddingInputType,
  type EmbeddingModelInfo,
  type EmbeddingProvider,
  type EmbeddingProviderId,
  type EmbeddingProviderRegistry,
  type EmbeddingVector,
  type LocalHashEmbeddingsProviderOptions,
  type OpenAIEmbeddingsProviderOptions,
  type OllamaEmbeddingsProviderOptions,
  type SemanticEmbeddingsProvider,
  type SimilarityMetric,
} from "./embeddings";

export {
  InMemoryVectorStore,
  type VectorMetadataFilter,
  type VectorSearchQuery,
  type VectorSearchResult,
  type VectorStore,
} from "./vector-store";

export {
  InMemoryProvider,
  NoopVectorIndexManager,
  IdentityEmbeddingStorageAdapter,
  PgVectorProvider,
  QdrantProvider,
  PineconeProvider,
  WeaviateProvider,
  ElasticsearchProvider,
  VectorStoreCollection,
  createDualWriteStore,
  type EmbeddingStorageAdapter,
  type VectorCollection,
  type VectorIndexManager,
  type VectorStoreProvider,
} from "./vector-provider";

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
  PineconeVectorStore,
  type PineconeStoreOptions,
} from "./pinecone-store";

export {
  WeaviateVectorStore,
  type WeaviateStoreOptions,
} from "./weaviate-store";

export {
  ElasticsearchVectorStore,
  type ElasticsearchStoreOptions,
} from "./elasticsearch-store";

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
  buildStepBackQuery,
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
  extractQueryFilters,
  type RewriteQueryOptions,
  type ExtractedQueryFilters,
} from "./query-understanding";

// Sparse retrieval — TF-IDF and BM25 (book cap. 15)
export {
  bm25Score,
  buildCorpusStats,
  computeTermFrequencies,
  scoreCandidatesWithBm25,
  tfIdfScore,
  tokenize as tokenizeForSparseRetrieval,
  type Bm25Params,
  type CorpusStats,
  type SparseDocument,
  type TermFrequencies,
} from "./sparse-retrieval";

// Reciprocal Rank Fusion (book cap. 18)
export { reciprocalRankFusion, type RankedItem } from "./fusion";

// Minimal LLM text-completion provider, shared by HyDE/step-back/re-ranking (cap. 19/20)
export {
  OllamaTextProvider,
  type LlmTextProvider,
  type LlmTextRequest,
  type OllamaTextProviderOptions,
} from "./llm-text-provider";

// LLM re-ranking (book cap. 19)
export { rerankWithLlm, type RerankCandidate, type RerankedCandidate } from "./rerank";

// Grounded generation — turns retrieved evidence into an actual LLM answer
export {
  buildGroundedPrompt,
  OllamaChatProvider,
  type GenerationChunk,
  type GenerationProvider,
  type GenerationRequest,
  type GenerationResult,
  type GroundedPrompt,
  type OllamaChatProviderOptions,
} from "./generation";

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
