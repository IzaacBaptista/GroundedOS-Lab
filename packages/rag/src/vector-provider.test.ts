import { describe, expect, it, vi } from "vitest";
import { InMemoryVectorStore } from "./vector-store";
import {
  InMemoryProvider,
  PgVectorProvider,
  QdrantProvider,
  createDualWriteStore,
} from "./vector-provider";

describe("vector providers", () => {
  it("creates in-memory stores for the explicit memory provider", async () => {
    const provider = new InMemoryProvider();
    const store = await provider.createStore();

    expect(store).toBeInstanceOf(InMemoryVectorStore);
  });

  it("falls back to in-memory when qdrant options are incomplete", async () => {
    const provider = new QdrantProvider({ collectionName: "" });
    const store = await provider.createStore();

    expect(store).toBeInstanceOf(InMemoryVectorStore);
  });

  it("supports dual-write composition using provider abstractions", async () => {
    const store = await createDualWriteStore({
      primary: new InMemoryProvider(),
      secondary: new InMemoryProvider(),
    });

    const chunk = {
      id: "chunk-1",
      documentId: "doc-1",
      sectionId: "section-1",
      startOffset: 0,
      endOffset: 10,
      text: "alpha",
      metadata: {
        documentTitle: "Doc",
        modality: "text" as const,
        sourceType: "manual" as const,
        chunkIndex: 0,
        sectionChunkIndex: 0,
        offsetBasis: "document" as const,
      },
      embeddingMetadata: {
        provider: "local-hash",
        model: "local-hash-v1",
        dimensions: 2,
      },
      embedding: [1, 0],
    };

    store.insert([chunk]);

    const results = store.search({ embedding: [1, 0], topK: 1 });
    expect(results[0]?.chunk.id).toBe("chunk-1");
  });

  it("delegates pgvector store creation through provider", async () => {
    const connect = vi.fn(async () => ({
      query: vi.fn(async () => ({ rows: [] })),
      end: vi.fn(async () => undefined),
    }));

    const provider = new PgVectorProvider({ connect });
    await provider.createStore();

    expect(connect).toHaveBeenCalledTimes(1);
  });
});
