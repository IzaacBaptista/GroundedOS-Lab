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

  it("book cap. 13: filters on metadata fields target the nested payload.metadata path, not the payload root", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: true }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: [] }));

    const store = new QdrantVectorStore({
      baseUrl: "http://localhost:6333",
      collectionName: "rag_chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: { insert: () => {}, search: () => [], clear: () => {}, size: 0 },
    });

    await store.searchAsync({
      embedding: [0, 1],
      topK: 1,
      filter: { tenantId: "tenant-a", modality: "text" },
    });

    const searchCall = fetchImpl.mock.calls[1];
    const body = JSON.parse(String(searchCall[1].body));

    expect(body.filter.must).toEqual(
      expect.arrayContaining([
        { key: "metadata.tenantId", match: { value: "tenant-a" } },
        { key: "metadata.modality", match: { value: "text" } },
      ])
    );
  });

  it("book cap. 13: permissions/tags filters also match chunks where the field is unset (open-by-default, matching InMemoryVectorStore)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: true }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: [] }));

    const store = new QdrantVectorStore({
      baseUrl: "http://localhost:6333",
      collectionName: "rag_chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: { insert: () => {}, search: () => [], clear: () => {}, size: 0 },
    });

    await store.searchAsync({
      embedding: [0, 1],
      topK: 1,
      filter: { permissions: "role:qa" },
    });

    const searchCall = fetchImpl.mock.calls[1];
    const body = JSON.parse(String(searchCall[1].body));

    expect(body.filter.must).toEqual([
      {
        should: [
          { key: "metadata.permissions", match: { value: "role:qa" } },
          { is_empty: { key: "metadata.permissions" } },
        ],
      },
    ]);
  });

  it("book cap. 11/14: creates the collection with the distance matching the declared similarity metric and HNSW build config", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: true }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: { points: [] } }));

    const store = new QdrantVectorStore({
      baseUrl: "http://localhost:6333",
      collectionName: "rag_chunks",
      similarityMetric: "dotProduct",
      hnswM: 32,
      hnswEfConstruct: 200,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await store.searchAsync({ embedding: [0, 1] });

    const createCall = fetchImpl.mock.calls[0]!;
    const body = JSON.parse(String(createCall[1].body));

    expect(body.vectors.distance).toBe("Dot");
    expect(body.hnsw_config).toEqual({ m: 32, ef_construct: 200 });
  });

  it("book cap. 14: passes hnsw_ef and exact as query-time recall/latency params", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: true }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok", result: [] }));

    const store = new QdrantVectorStore({
      baseUrl: "http://localhost:6333",
      collectionName: "rag_chunks",
      hnswEf: 256,
      exact: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await store.searchAsync({ embedding: [0, 1] });

    const searchCall = fetchImpl.mock.calls[1]!;
    const body = JSON.parse(String(searchCall[1].body));

    expect(body.params).toEqual({ hnsw_ef: 256, exact: true });
  });
});
