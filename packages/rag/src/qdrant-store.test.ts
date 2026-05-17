import { describe, expect, it, vi } from "vitest";
import type { EmbeddedChunk } from "./embeddings";
import { QdrantVectorStore } from "./qdrant-store";

function createEmbeddedChunk(overrides: Partial<EmbeddedChunk> = {}): EmbeddedChunk {
  const embedding = overrides.embedding ?? [1, 0];
  return {
    id: "chunk-1",
    documentId: "doc-1",
    sectionId: "section-1",
    text: "chunk text",
    startOffset: 0,
    endOffset: 10,
    metadata: {
      documentTitle: "doc",
      modality: "text",
      sourceType: "manual",
      chunkIndex: 1,
      sectionChunkIndex: 1,
      offsetBasis: "document",
    },
    embeddingMetadata: {
      provider: "test",
      dimensions: embedding.length,
    },
    embedding,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("QdrantVectorStore", () => {
  it("validates required constructor options", () => {
    expect(() =>
      new QdrantVectorStore({
        baseUrl: "",
        collectionName: "collection",
      })
    ).toThrow("[rag/qdrant-store] baseUrl must not be empty.");

    expect(() =>
      new QdrantVectorStore({
        baseUrl: "http://localhost:6333",
        collectionName: "",
      })
    ).toThrow("[rag/qdrant-store] collectionName must not be empty.");
  });

  it("keeps synchronous retrieval compatibility via mirror store", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ status: "ok", result: {} as unknown }));
    const store = new QdrantVectorStore({
      baseUrl: "http://localhost:6333",
      collectionName: "rag_chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const chunk = createEmbeddedChunk();

    store.insert([chunk]);

    const syncResults = store.search({ embedding: [1, 0], topK: 1 });
    expect(syncResults[0]?.chunk.id).toBe("chunk-1");
    expect(store.size).toBe(1);

    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalled();
  });

  it("uses qdrant searchAsync when available and maps payload back to chunk shape", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: true }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "ok",
          result: [
            {
              id: "chunk-remote",
              score: 0.91,
              payload: {
                documentId: "doc-1",
                sectionId: "section-1",
                startOffset: 1,
                endOffset: 12,
                text: "remote chunk",
                metadata: {
                  documentTitle: "doc",
                  modality: "text",
                  sourceType: "manual",
                  chunkIndex: 1,
                  sectionChunkIndex: 1,
                  offsetBasis: "document",
                },
                embeddingMetadata: {
                  provider: "test",
                  dimensions: 2,
                },
                embedding: [0.2, 0.8],
              },
            },
          ],
        })
      );

    const store = new QdrantVectorStore({
      baseUrl: "http://localhost:6333",
      collectionName: "rag_chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const results = await store.searchAsync({ embedding: [0, 1], topK: 1 });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("chunk-remote");
    expect(results[0]?.chunk.text).toBe("remote chunk");
    expect(results[0]?.score).toBeCloseTo(0.91);
  });
});
