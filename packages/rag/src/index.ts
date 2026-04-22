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
  embedChunks,
  type DeterministicEmbeddingProviderOptions,
  type EmbeddedChunk,
  type EmbeddingProvider,
  type EmbeddingVector,
} from "./embeddings";
