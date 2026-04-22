import type { NormalizedDocument } from "@groundedos/core";

import {
  chunkDocument,
  type ChunkDocumentOptions,
} from "./chunking";
import {
  DeterministicEmbeddingProvider,
  embedChunks,
  type EmbeddedChunk,
  type EmbeddingProvider,
  type EmbeddingVector,
} from "./embeddings";
import {
  InMemoryVectorStore,
  type VectorMetadataFilter,
  type VectorSearchResult,
  type VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/retrieval]";

export interface BuildRetrievalIndexOptions {
  chunkOptions?: ChunkDocumentOptions;
  embeddingProvider?: EmbeddingProvider;
  store?: VectorStore;
}

export interface RetrievalIndex {
  embeddingProvider: EmbeddingProvider;
  store: VectorStore;
  embeddedChunks: EmbeddedChunk[];
}

export interface RetrieveFromIndexOptions {
  topK?: number;
  filter?: VectorMetadataFilter;
}

export type RetrievalResult = VectorSearchResult;

export async function buildRetrievalIndex(
  document: NormalizedDocument,
  options: BuildRetrievalIndexOptions = {}
): Promise<RetrievalIndex> {
  if (!document) {
    throw new Error(`${ERROR_PREFIX} document is required.`);
  }

  const embeddingProvider =
    options.embeddingProvider ?? new DeterministicEmbeddingProvider();
  const store = options.store ?? new InMemoryVectorStore();
  const chunks = chunkDocument(document, options.chunkOptions);
  const embeddedChunks = await embedChunks(chunks, embeddingProvider);

  store.insert(embeddedChunks);

  return {
    embeddingProvider,
    store,
    embeddedChunks,
  };
}

export async function retrieveFromIndex(
  index: RetrievalIndex,
  query: string,
  options: RetrieveFromIndexOptions = {}
): Promise<RetrievalResult[]> {
  validateRetrievalIndex(index);

  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} query must not be empty.`);
  }

  const queryEmbedding = await embedQuery(query, index.embeddingProvider);

  return index.store.search({
    embedding: queryEmbedding,
    topK: options.topK,
    filter: options.filter,
  });
}

function validateRetrievalIndex(index: RetrievalIndex): void {
  if (!index) {
    throw new Error(`${ERROR_PREFIX} retrieval index is required.`);
  }

  if (!index.embeddingProvider || typeof index.embeddingProvider.embedTexts !== "function") {
    throw new Error(`${ERROR_PREFIX} retrieval index must include an embedding provider.`);
  }

  if (!index.store || typeof index.store.search !== "function") {
    throw new Error(`${ERROR_PREFIX} retrieval index must include a searchable store.`);
  }
}

async function embedQuery(
  query: string,
  provider: EmbeddingProvider
): Promise<EmbeddingVector> {
  const embeddings = await provider.embedTexts([query]);

  if (!Array.isArray(embeddings) || embeddings.length !== 1) {
    throw new Error(`${ERROR_PREFIX} provider must return exactly one query embedding.`);
  }

  const [embedding] = embeddings;

  if (!Array.isArray(embedding) || embedding.length !== provider.dimensions) {
    throw new Error(
      `${ERROR_PREFIX} query embedding must have ${provider.dimensions} dimensions.`
    );
  }

  if (embedding.some((value) => !Number.isFinite(value))) {
    throw new Error(`${ERROR_PREFIX} query embedding contains a non-finite value.`);
  }

  return embedding;
}
