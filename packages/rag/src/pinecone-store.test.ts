import { describe, expect, it, vi } from "vitest";
import type { EmbeddedChunk } from "./embeddings";
import { PineconeVectorStore } from "./pinecone-store";

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

describe("PineconeVectorStore", () => {
  it("validates required constructor options", () => {
    expect(() => new PineconeVectorStore({ baseUrl: "", apiKey: "x" })).toThrow(
      "[rag/pinecone-store] baseUrl must not be empty."
    );
    expect(() => new PineconeVectorStore({ baseUrl: "https://idx.pinecone.io", apiKey: "" })).toThrow(
      "[rag/pinecone-store] apiKey must not be empty."
    );
  });

  it("book cap. 13: passes namespace through on upsert and query", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ matches: [] }));
    const store = new PineconeVectorStore({
      baseUrl: "https://idx.pinecone.io",
      apiKey: "key",
      namespace: "tenant-a",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    store.insert([createEmbeddedChunk()]);
    await Promise.resolve();
    await store.searchAsync({ embedding: [1, 0] });

    const upsertBody = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));
    const queryBody = JSON.parse(String(fetchImpl.mock.calls[1]![1]!.body));

    expect(upsertBody.namespace).toBe("tenant-a");
    expect(queryBody.namespace).toBe("tenant-a");
  });

  it("book cap. 9: permissions filter matches contained value OR unset field", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ matches: [] }));
    const store = new PineconeVectorStore({
      baseUrl: "https://idx.pinecone.io",
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    await store.searchAsync({ embedding: [1, 0], filter: { tenantId: "tenant-a", permissions: "role:qa" } });

    const queryBody = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body));

    expect(queryBody.filter).toEqual({
      $and: [
        { tenantId: { $eq: "tenant-a" } },
        { $or: [{ permissions: { $in: ["role:qa"] } }, { permissions: { $exists: false } }] },
      ],
    });
  });

  it("maps a Pinecone match back to an EmbeddedChunk", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        matches: [
          {
            id: "chunk-1",
            score: 0.87,
            metadata: {
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
              tags: ["hr"],
            },
          },
        ],
      })
    );
    const store = new PineconeVectorStore({
      baseUrl: "https://idx.pinecone.io",
      apiKey: "key",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      mirrorStore: NULL_STORE,
    });

    const results = await store.searchAsync({ embedding: [1, 0] });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("chunk-1");
    expect(results[0]?.chunk.text).toBe("chunk text");
    expect(results[0]?.chunk.metadata.tags).toEqual(["hr"]);
    expect(results[0]?.score).toBeCloseTo(0.87);
  });
});
