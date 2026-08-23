import type { EmbeddedChunk } from "./embeddings";
import { ElasticsearchVectorStore, type ElasticsearchStoreOptions } from "./elasticsearch-store";
import { createVectorStore, type PgvectorStoreOptions } from "./pgvector-store";
import { PineconeVectorStore, type PineconeStoreOptions } from "./pinecone-store";
import { QdrantVectorStore, type QdrantStoreOptions } from "./qdrant-store";
import { WeaviateVectorStore, type WeaviateStoreOptions } from "./weaviate-store";
import { createVectorStoreForDualWrite } from "./vector-backend";
import { InMemoryVectorStore } from "./vector-store";
import type { VectorSearchQuery, VectorSearchResult, VectorStore } from "./vector-store";

const ERROR_PREFIX = "[rag/vector-provider]";

export interface VectorCollection {
  readonly name: string;
  insert(chunks: EmbeddedChunk[]): void;
  search(query: VectorSearchQuery): VectorSearchResult[];
  clear(): void;
}

export interface VectorIndexManager {
  ensureCollection(collectionName: string, dimensions: number): Promise<void>;
  dropCollection(collectionName: string): Promise<void>;
}

export interface EmbeddingStorageAdapter {
  toPayload(chunk: EmbeddedChunk): Record<string, unknown>;
  fromPayload(id: string, payload: Record<string, unknown>): EmbeddedChunk;
}

export interface VectorStoreProvider {
  readonly providerId: "memory" | "pgvector" | "qdrant" | "pinecone" | "weaviate" | "elasticsearch";
  createStore(): Promise<VectorStore>;
}

export class VectorStoreCollection implements VectorCollection {
  constructor(
    public readonly name: string,
    private readonly store: VectorStore
  ) {}

  insert(chunks: EmbeddedChunk[]): void {
    this.store.insert(chunks);
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    return this.store.search(query);
  }

  clear(): void {
    this.store.clear();
  }
}

export class NoopVectorIndexManager implements VectorIndexManager {
  async ensureCollection(collectionName: string, dimensions: number): Promise<void> {
    if (!collectionName.trim()) {
      throw new Error(`${ERROR_PREFIX} collectionName must not be empty.`);
    }
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error(`${ERROR_PREFIX} dimensions must be a positive integer.`);
    }
  }

  async dropCollection(collectionName: string): Promise<void> {
    if (!collectionName.trim()) {
      throw new Error(`${ERROR_PREFIX} collectionName must not be empty.`);
    }
  }
}

export class IdentityEmbeddingStorageAdapter implements EmbeddingStorageAdapter {
  toPayload(chunk: EmbeddedChunk): Record<string, unknown> {
    return {
      ...chunk,
      metadata: { ...chunk.metadata },
      embeddingMetadata: { ...chunk.embeddingMetadata },
      embedding: [...chunk.embedding],
    };
  }

  fromPayload(id: string, payload: Record<string, unknown>): EmbeddedChunk {
    return {
      id,
      documentId: String(payload.documentId ?? ""),
      sectionId: String(payload.sectionId ?? ""),
      startOffset: Number(payload.startOffset ?? 0),
      endOffset: Number(payload.endOffset ?? 0),
      text: String(payload.text ?? ""),
      metadata: (payload.metadata ?? {}) as EmbeddedChunk["metadata"],
      embeddingMetadata: (payload.embeddingMetadata ?? {}) as EmbeddedChunk["embeddingMetadata"],
      embedding: Array.isArray(payload.embedding)
        ? payload.embedding.filter((value): value is number => typeof value === "number")
        : [],
    };
  }
}

export class PgVectorProvider implements VectorStoreProvider {
  readonly providerId = "pgvector" as const;

  constructor(private readonly options: PgvectorStoreOptions) {}

  async createStore(): Promise<VectorStore> {
    return createVectorStore(this.options);
  }
}

export class QdrantProvider implements VectorStoreProvider {
  readonly providerId = "qdrant" as const;

  constructor(private readonly options: Partial<QdrantStoreOptions>) {}

  async createStore(): Promise<VectorStore> {
    const baseUrl = this.options.baseUrl?.trim();
    const collectionName = this.options.collectionName?.trim();

    if (!baseUrl || !collectionName) {
      console.warn(
        `${ERROR_PREFIX} qdrant provider is not fully configured; falling back to in-memory store.`
      );
      return new InMemoryVectorStore();
    }

    return new QdrantVectorStore({
      ...this.options,
      baseUrl,
      collectionName,
    } as QdrantStoreOptions);
  }
}

export class PineconeProvider implements VectorStoreProvider {
  readonly providerId = "pinecone" as const;

  constructor(private readonly options: Partial<PineconeStoreOptions>) {}

  async createStore(): Promise<VectorStore> {
    const baseUrl = this.options.baseUrl?.trim();
    const apiKey = this.options.apiKey?.trim();

    if (!baseUrl || !apiKey) {
      console.warn(
        `${ERROR_PREFIX} pinecone provider is not fully configured; falling back to in-memory store.`
      );
      return new InMemoryVectorStore();
    }

    return new PineconeVectorStore({ ...this.options, baseUrl, apiKey } as PineconeStoreOptions);
  }
}

export class WeaviateProvider implements VectorStoreProvider {
  readonly providerId = "weaviate" as const;

  constructor(private readonly options: Partial<WeaviateStoreOptions>) {}

  async createStore(): Promise<VectorStore> {
    const baseUrl = this.options.baseUrl?.trim();
    const className = this.options.className?.trim();

    if (!baseUrl || !className) {
      console.warn(
        `${ERROR_PREFIX} weaviate provider is not fully configured; falling back to in-memory store.`
      );
      return new InMemoryVectorStore();
    }

    return new WeaviateVectorStore({ ...this.options, baseUrl, className } as WeaviateStoreOptions);
  }
}

export class ElasticsearchProvider implements VectorStoreProvider {
  readonly providerId = "elasticsearch" as const;

  constructor(private readonly options: Partial<ElasticsearchStoreOptions>) {}

  async createStore(): Promise<VectorStore> {
    const baseUrl = this.options.baseUrl?.trim();
    const index = this.options.index?.trim();

    if (!baseUrl || !index) {
      console.warn(
        `${ERROR_PREFIX} elasticsearch provider is not fully configured; falling back to in-memory store.`
      );
      return new InMemoryVectorStore();
    }

    return new ElasticsearchVectorStore({ ...this.options, baseUrl, index } as ElasticsearchStoreOptions);
  }
}

export class InMemoryProvider implements VectorStoreProvider {
  readonly providerId = "memory" as const;

  async createStore(): Promise<VectorStore> {
    return new InMemoryVectorStore();
  }
}

export async function createDualWriteStore(options: {
  primary: VectorStoreProvider;
  secondary?: VectorStoreProvider;
}): Promise<VectorStore> {
  const primaryStore = await options.primary.createStore();
  const secondaryStore = options.secondary ? await options.secondary.createStore() : undefined;

  return createVectorStoreForDualWrite(primaryStore, secondaryStore);
}
