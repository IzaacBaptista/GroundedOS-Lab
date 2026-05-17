import { describe, expect, it } from "vitest";
import type { EmbeddedChunk } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import {
  createVectorStoreForDualWrite,
  isVectorDualWriteEnabled,
  resolveVectorBackend,
} from "./vector-backend";

function createChunk(id: string): EmbeddedChunk {
  return {
    id,
    documentId: "doc-1",
    sectionId: "section-1",
    text: "text",
    startOffset: 0,
    endOffset: 4,
    metadata: {
      documentTitle: "doc",
      modality: "text",
      sourceType: "manual",
      chunkIndex: 1,
      sectionChunkIndex: 1,
      offsetBasis: "document",
    },
    embedding: [1, 0],
    embeddingMetadata: {
      provider: "test",
      dimensions: 2,
    },
  };
}

describe("vector-backend helpers", () => {
  it("resolves supported backends and defaults unknown values to memory", () => {
    expect(resolveVectorBackend({ VECTOR_BACKEND: "qdrant" } as NodeJS.ProcessEnv)).toBe("qdrant");
    expect(resolveVectorBackend({ VECTOR_BACKEND: "pgvector" } as NodeJS.ProcessEnv)).toBe(
      "pgvector"
    );
    expect(resolveVectorBackend({ VECTOR_BACKEND: "other" } as NodeJS.ProcessEnv)).toBe("memory");
  });

  it("parses dual-write flag", () => {
    expect(isVectorDualWriteEnabled({ VECTOR_DUAL_WRITE: "true" } as NodeJS.ProcessEnv)).toBe(
      true
    );
    expect(isVectorDualWriteEnabled({ VECTOR_DUAL_WRITE: "1" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isVectorDualWriteEnabled({ VECTOR_DUAL_WRITE: "false" } as NodeJS.ProcessEnv)).toBe(
      false
    );
  });

  it("writes to both stores when dual-write is enabled", () => {
    const primary = new InMemoryVectorStore();
    const secondary = new InMemoryVectorStore();
    const store = createVectorStoreForDualWrite(primary, secondary);

    store.insert([createChunk("chunk-a")]);

    expect(primary.size).toBe(1);
    expect(secondary.size).toBe(1);
    expect(store.search({ embedding: [1, 0], topK: 1 })[0]?.chunk.id).toBe("chunk-a");
  });
});
