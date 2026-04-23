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
  buildRetrievalIndex,
  createRetrievalDevOutput,
  retrieveForDevMode,
  retrieveFromIndex,
  type BuildRetrievalIndexOptions,
  type RetrievalDevModeOutput,
  type RetrievalDevModeResult,
  type RetrievalIndex,
  type RetrievalResult,
  type RetrieveFromIndexOptions,
} from "./retrieval";
