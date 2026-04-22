import { describe, expect, it } from "vitest";

import type { EmbeddedChunk } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";

function createEmbeddedChunk(
  overrides: Partial<EmbeddedChunk> = {}
): EmbeddedChunk {
  const embedding = overrides.embedding ?? [1, 0];

  return {
    id: "doc-1:section-1:chunk-1",
    documentId: "doc-1",
    sectionId: "section-1",
    text: "Vector store test chunk.",
    startOffset: 0,
    endOffset: 24,
    metadata: {
      documentTitle: "Vector Store Test",
      modality: "text",
      sourceType: "manual",
      chunkIndex: 1,
      sectionChunkIndex: 1,
      offsetBasis: "document",
    },
    embedding,
    embeddingMetadata: {
      provider: "test-provider",
      dimensions: embedding.length,
    },
    ...overrides,
  };
}

describe("InMemoryVectorStore", () => {
  it("inserts embedded chunks and returns nearest results by cosine similarity", () => {
    const store = new InMemoryVectorStore();
    const chunks = [
      createEmbeddedChunk({
        id: "chunk-a",
        embedding: [1, 0],
      }),
      createEmbeddedChunk({
        id: "chunk-b",
        embedding: [0, 1],
      }),
      createEmbeddedChunk({
        id: "chunk-c",
        embedding: [0.8, 0.2],
      }),
    ];

    store.insert(chunks);
    const results = store.search({ embedding: [1, 0], topK: 2 });

    expect(store.size).toBe(3);
    expect(results.map((result) => result.chunk.id)).toEqual(["chunk-a", "chunk-c"]);
    expect(results[0]?.score).toBeCloseTo(1);
    expect(results[1]?.score).toBeGreaterThan(0);
    expect(results[1]?.score).toBeLessThan(results[0]?.score ?? 0);
  });

  it("filters results by searchable metadata", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "text-chunk",
        embedding: [1, 0],
        metadata: {
          documentTitle: "Text Document",
          modality: "text",
          sourceType: "manual",
          chunkIndex: 1,
          sectionChunkIndex: 1,
          offsetBasis: "document",
        },
      }),
      createEmbeddedChunk({
        id: "pdf-chunk",
        documentId: "doc-pdf",
        sectionId: "page-2",
        embedding: [0.9, 0.1],
        metadata: {
          documentTitle: "PDF Document",
          modality: "pdf",
          sectionHeading: "Page 2",
          page: 2,
          sourceType: "upload",
          originalFilename: "sample.pdf",
          chunkIndex: 2,
          sectionChunkIndex: 1,
          offsetBasis: "document",
        },
      }),
    ]);

    const results = store.search({
      embedding: [1, 0],
      filter: {
        modality: "pdf",
        page: 2,
        originalFilename: "sample.pdf",
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("pdf-chunk");
  });

  it("replaces existing chunks with the same id", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "same-id",
        text: "Original",
        embedding: [1, 0],
      }),
    ]);
    store.insert([
      createEmbeddedChunk({
        id: "same-id",
        text: "Replacement",
        embedding: [0, 1],
      }),
    ]);

    const results = store.search({ embedding: [0, 1], topK: 1 });

    expect(store.size).toBe(1);
    expect(results[0]?.chunk.text).toBe("Replacement");
  });

  it("returns an empty result set for an empty store or unmatched filters", () => {
    const store = new InMemoryVectorStore();

    expect(store.search({ embedding: [1, 0] })).toEqual([]);

    store.insert([createEmbeddedChunk()]);

    expect(
      store.search({
        embedding: [1, 0],
        filter: { documentId: "missing" },
      })
    ).toEqual([]);
  });

  it("clears stored chunks and resets dimensions", () => {
    const store = new InMemoryVectorStore();

    store.insert([createEmbeddedChunk({ embedding: [1, 0] })]);
    store.clear();
    store.insert([createEmbeddedChunk({ embedding: [1, 0, 0] })]);

    expect(store.size).toBe(1);
    expect(store.search({ embedding: [1, 0, 0] })).toHaveLength(1);
  });

  it("rejects invalid inserts and search queries", () => {
    const store = new InMemoryVectorStore();

    expect(() => store.insert(undefined as unknown as EmbeddedChunk[])).toThrow(
      "[rag/vector-store] insert expects an array of embedded chunks."
    );
    expect(() => store.insert([createEmbeddedChunk({ id: "" })])).toThrow(
      "[rag/vector-store] chunk id must not be empty."
    );
    expect(() => store.insert([createEmbeddedChunk({ embedding: [] })])).toThrow(
      '[rag/vector-store] embedding for chunk "doc-1:section-1:chunk-1" must be a non-empty vector.'
    );
    expect(() =>
      store.insert([createEmbeddedChunk({ embedding: [1, Number.NaN] })])
    ).toThrow(
      '[rag/vector-store] embedding for chunk "doc-1:section-1:chunk-1" contains a non-finite value.'
    );
    expect(() =>
      store.search(undefined as unknown as Parameters<InMemoryVectorStore["search"]>[0])
    ).toThrow("[rag/vector-store] search query is required.");
    expect(() => store.search({ embedding: [1, 0], topK: 0 })).toThrow(
      "[rag/vector-store] topK must be a positive integer."
    );
  });

  it("rejects mixed embedding dimensions", () => {
    const store = new InMemoryVectorStore();

    store.insert([createEmbeddedChunk({ embedding: [1, 0] })]);

    expect(() =>
      store.insert([
        createEmbeddedChunk({
          id: "wrong-dimensions",
          embedding: [1, 0, 0],
        }),
      ])
    ).toThrow(
      '[rag/vector-store] chunk "wrong-dimensions" embedding has 3 dimensions; expected 2.'
    );
    expect(() => store.search({ embedding: [1, 0, 0] })).toThrow(
      "[rag/vector-store] query embedding has 3 dimensions; expected 2."
    );
  });

  it("does not partially insert invalid batches", () => {
    const store = new InMemoryVectorStore();

    expect(() =>
      store.insert([
        createEmbeddedChunk({ id: "valid-in-batch", embedding: [1, 0] }),
        createEmbeddedChunk({ id: "invalid-in-batch", embedding: [1, 0, 0] }),
      ])
    ).toThrow(
      '[rag/vector-store] chunk "invalid-in-batch" embedding has 3 dimensions; expected 2.'
    );

    expect(store.size).toBe(0);
    expect(store.search({ embedding: [1, 0] })).toEqual([]);
  });

  it("rejects chunks whose embedding metadata dimensions do not match the vector", () => {
    const store = new InMemoryVectorStore();

    expect(() =>
      store.insert([
        createEmbeddedChunk({
          embedding: [1, 0],
          embeddingMetadata: {
            provider: "test-provider",
            dimensions: 3,
          },
        }),
      ])
    ).toThrow(
      '[rag/vector-store] chunk "doc-1:section-1:chunk-1" embedding has 2 dimensions; expected 3.'
    );
  });
});
