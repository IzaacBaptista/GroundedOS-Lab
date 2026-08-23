import { describe, expect, it, vi } from "vitest";
import type { EmbeddedChunk } from "./embeddings";
import { ElasticsearchVectorStore } from "./elasticsearch-store";

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

describe("ElasticsearchVectorStore", () => {
  it("validates required constructor options", () => {
    expect(() => new ElasticsearchVectorStore({ baseUrl: "", index: "chunks" })).toThrow(
      "[rag/elasticsearch-store] baseUrl must not be empty."
    );
    expect(() => new ElasticsearchVectorStore({ baseUrl: "http://localhost:9200", index: "" })).toThrow(
      "[rag/elasticsearch-store] index must not be empty."
    );
  });

  it("bulk-indexes with NDJSON action/document pairs", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ items: [] }));
    const store = new ElasticsearchVectorStore({
      baseUrl: "http://localhost:9200",
      index: "chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    store.insert([createEmbeddedChunk()]);
    await Promise.resolve();

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain("/_bulk");
    expect((init!.headers as Record<string, string>)["Content-Type"]).toBe("application/x-ndjson");
    const lines = String(init!.body).trim().split("\n");
    expect(JSON.parse(lines[0])).toEqual({ index: { _index: "chunks", _id: "chunk-1" } });
    expect(JSON.parse(lines[1]).documentId).toBe("doc-1");
  });

  it("book cap. 9/13: knn.filter applies before the vector search runs, with contains-or-open semantics for permissions", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ hits: { hits: [] } }));
    const store = new ElasticsearchVectorStore({
      baseUrl: "http://localhost:9200",
      index: "chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    await store.searchAsync({
      embedding: [1, 0],
      filter: { documentId: "doc-1", tenantId: "tenant-a", permissions: "role:qa" },
    });

    const body = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));

    expect(body.knn.filter).toEqual([
      { term: { documentId: "doc-1" } },
      { term: { "metadata.tenantId": "tenant-a" } },
      {
        bool: {
          should: [
            { term: { "metadata.permissions": "role:qa" } },
            { bool: { must_not: { exists: { field: "metadata.permissions" } } } },
          ],
          minimum_should_match: 1,
        },
      },
    ]);
  });

  it("maps a hit back to an EmbeddedChunk", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        hits: {
          hits: [
            {
              _id: "chunk-1",
              _score: 0.93,
              _source: {
                documentId: "doc-1",
                sectionId: "section-1",
                startOffset: 0,
                endOffset: 10,
                text: "chunk text",
                metadata: { documentTitle: "doc", modality: "text" },
                embeddingMetadata: { provider: "test", dimensions: 2 },
              },
            },
          ],
        },
      })
    );
    const store = new ElasticsearchVectorStore({
      baseUrl: "http://localhost:9200",
      index: "chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    const results = await store.searchAsync({ embedding: [1, 0] });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("chunk-1");
    expect(results[0]?.chunk.text).toBe("chunk text");
    expect(results[0]?.score).toBeCloseTo(0.93);
  });

  it("book cap. 14: derives num_candidates from topK by default, but honors an explicit override", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ hits: { hits: [] } })
    );
    const defaultStore = new ElasticsearchVectorStore({
      baseUrl: "http://localhost:9200",
      index: "chunks",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    await defaultStore.searchAsync({ embedding: [1, 0], topK: 20 });
    const defaultBody = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(defaultBody.knn.num_candidates).toBe(200);

    const tunedStore = new ElasticsearchVectorStore({
      baseUrl: "http://localhost:9200",
      index: "chunks",
      numCandidates: 500,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    await tunedStore.searchAsync({ embedding: [1, 0], topK: 20 });
    const tunedBody = JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body));
    expect(tunedBody.knn.num_candidates).toBe(500);
  });
});
