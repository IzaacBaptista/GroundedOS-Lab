import { describe, expect, it, vi } from "vitest";
import type { EmbeddedChunk } from "./embeddings";
import { WeaviateVectorStore } from "./weaviate-store";

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

const NULL_STORE = { insert: () => {}, search: () => [], clear: () => {}, size: 0 };

describe("WeaviateVectorStore", () => {
  it("validates required constructor options", () => {
    expect(() => new WeaviateVectorStore({ baseUrl: "", className: "Chunk" })).toThrow(
      "[rag/weaviate-store] baseUrl must not be empty."
    );
    expect(() => new WeaviateVectorStore({ baseUrl: "http://localhost:8080", className: "" })).toThrow(
      "[rag/weaviate-store] className must not be empty."
    );
  });

  it("book cap. 13: scopes batch insert and GraphQL query to the configured tenant", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ data: { Get: { Chunk: [] } } }));
    const store = new WeaviateVectorStore({
      baseUrl: "http://localhost:8080",
      className: "Chunk",
      tenant: "tenant-a",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    store.insert([createEmbeddedChunk()]);
    await Promise.resolve();
    await store.searchAsync({ embedding: [1, 0] });

    const batchBody = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    const queryBody = JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body));

    expect(batchBody.objects[0].tenant).toBe("tenant-a");
    expect(queryBody.query).toContain('tenant: "tenant-a"');
  });

  it("book cap. 9: builds an Or/ContainsAny/IsNull where clause for permissions", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ data: { Get: { Chunk: [] } } }));
    const store = new WeaviateVectorStore({
      baseUrl: "http://localhost:8080",
      className: "Chunk",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    await store.searchAsync({ embedding: [1, 0], filter: { permissions: "role:qa" } });

    const queryBody = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));

    expect(queryBody.query).toContain("ContainsAny");
    expect(queryBody.query).toContain('valueTextArray: ["role:qa"]');
    expect(queryBody.query).toContain("IsNull");
  });

  it("maps a GraphQL object back to an EmbeddedChunk", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          Get: {
            Chunk: [
              {
                chunkId: "chunk-1",
                documentId: "doc-1",
                sectionId: "section-1",
                startOffset: 0,
                endOffset: 10,
                text: "chunk text",
                documentTitle: "doc",
                modality: "text",
                sourceType: "manual",
                chunkIndex: 1,
                sectionChunkIndex: 1,
                offsetBasis: "document",
                embeddingProvider: "test",
                embeddingDimensions: 2,
                _additional: { id: "uuid-1", distance: 0.1 },
              },
            ],
          },
        },
      })
    );
    const store = new WeaviateVectorStore({
      baseUrl: "http://localhost:8080",
      className: "Chunk",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    const results = await store.searchAsync({ embedding: [1, 0] });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("chunk-1");
    expect(results[0]?.chunk.text).toBe("chunk text");
    expect(results[0]?.score).toBeCloseTo(0.9);
  });
});
