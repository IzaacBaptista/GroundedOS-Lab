import type { EmbeddedChunk } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import type { VectorSearchQuery, VectorSearchResult, VectorStore } from "./vector-store";

const ERROR_PREFIX = "[rag/vector-backend]";

export type VectorBackend = "memory" | "pgvector" | "qdrant";

export function resolveVectorBackend(env: NodeJS.ProcessEnv = process.env): VectorBackend {
  const backend = env.VECTOR_BACKEND?.toLowerCase().trim();
  if (backend === "pgvector" || backend === "qdrant") {
    return backend;
  }

  return "memory";
}

export function isVectorDualWriteEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.VECTOR_DUAL_WRITE?.toLowerCase().trim();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export class DualWriteVectorStore implements VectorStore {
  constructor(
    private readonly primaryStore: VectorStore,
    private readonly secondaryStore: VectorStore
  ) {}

  get size(): number {
    return this.primaryStore.size;
  }

  insert(chunks: EmbeddedChunk[]): void {
    this.primaryStore.insert(chunks);

    try {
      this.secondaryStore.insert(chunks);
    } catch (error) {
      console.warn(
        `${ERROR_PREFIX} secondary insert failed; continuing with primary store only.`,
        error
      );
    }
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    return this.primaryStore.search(query);
  }

  clear(): void {
    this.primaryStore.clear();

    try {
      this.secondaryStore.clear();
    } catch (error) {
      console.warn(
        `${ERROR_PREFIX} secondary clear failed; continuing with primary store only.`,
        error
      );
    }
  }
}

export function createVectorStoreForDualWrite(
  primaryStore: VectorStore,
  secondaryStore: VectorStore | undefined
): VectorStore {
  if (!secondaryStore) {
    return primaryStore;
  }

  return new DualWriteVectorStore(primaryStore, secondaryStore);
}

export function createDefaultVectorStore(): VectorStore {
  return new InMemoryVectorStore();
}
