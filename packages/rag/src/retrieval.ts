import type { DocumentModality, NormalizedDocument } from "@groundedos/core";

import {
  chunkDocument,
  type ChunkDocumentOptions,
  type ChunkOffsetBasis,
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

export interface RetrievalDevModeOutput {
  query: string;
  resultCount: number;
  results: RetrievalDevModeResult[];
}

export interface RetrievalDevModeResult {
  rank: number;
  chunkId: string;
  documentId: string;
  sectionId: string;
  score: number;
  text: string;
  source: {
    documentTitle: string;
    modality: DocumentModality;
    sourceType: NormalizedDocument["lineage"]["sourceType"];
    originalFilename?: string;
    sectionHeading?: string;
    page?: number;
  };
  offsets: {
    startOffset: number;
    endOffset: number;
    offsetBasis: ChunkOffsetBasis;
  };
  embedding: {
    provider: string;
    dimensions: number;
    model?: string;
    normalized?: boolean;
  };
}

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

export async function retrieveForDevMode(
  index: RetrievalIndex,
  query: string,
  options: RetrieveFromIndexOptions = {}
): Promise<RetrievalDevModeOutput> {
  const results = await retrieveFromIndex(index, query, options);

  return createRetrievalDevOutput(query, results);
}

export function createRetrievalDevOutput(
  query: string,
  results: RetrievalResult[]
): RetrievalDevModeOutput {
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} query must not be empty.`);
  }

  if (!Array.isArray(results)) {
    throw new Error(`${ERROR_PREFIX} retrieval results must be an array.`);
  }

  return {
    query: query.trim(),
    resultCount: results.length,
    results: results.map((result, index) => ({
      rank: index + 1,
      chunkId: result.chunk.id,
      documentId: result.chunk.documentId,
      sectionId: result.chunk.sectionId,
      score: result.score,
      text: result.chunk.text,
      source: {
        documentTitle: result.chunk.metadata.documentTitle,
        modality: result.chunk.metadata.modality,
        sourceType: result.chunk.metadata.sourceType,
        originalFilename: result.chunk.metadata.originalFilename,
        sectionHeading: result.chunk.metadata.sectionHeading,
        page: result.chunk.metadata.page,
      },
      offsets: {
        startOffset: result.chunk.startOffset,
        endOffset: result.chunk.endOffset,
        offsetBasis: result.chunk.metadata.offsetBasis,
      },
      embedding: {
        provider: result.chunk.embeddingMetadata.provider,
        dimensions: result.chunk.embeddingMetadata.dimensions,
        model: result.chunk.embeddingMetadata.model,
        normalized: result.chunk.embeddingMetadata.normalized,
      },
    })),
  };
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
