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

  it("book cap. 16: minScore excludes chunks below the cutoff, even if that returns fewer than topK", () => {
    const store = new InMemoryVectorStore();
    store.insert([
      createEmbeddedChunk({ id: "chunk-close", embedding: [1, 0] }),
      createEmbeddedChunk({ id: "chunk-far", embedding: [0, 1] }),
    ]);

    const results = store.search({ embedding: [1, 0], topK: 2, minScore: 0.5 });

    expect(results.map((result) => result.chunk.id)).toEqual(["chunk-close"]);
  });

  it("book cap. 16: minScore of 0 keeps everything topK already would (no-op boundary)", () => {
    const store = new InMemoryVectorStore();
    store.insert([
      createEmbeddedChunk({ id: "chunk-close", embedding: [1, 0] }),
      createEmbeddedChunk({ id: "chunk-far", embedding: [0, 1] }),
    ]);

    const results = store.search({ embedding: [1, 0], topK: 2, minScore: 0 });

    expect(results).toHaveLength(2);
  });

  it("rejects a non-finite minScore", () => {
    const store = new InMemoryVectorStore();
    store.insert([createEmbeddedChunk()]);

    expect(() => store.search({ embedding: [1, 0], minScore: NaN })).toThrow(
      "minScore must be a finite number"
    );
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

  it("ranks by dot product when the stored embeddings declare that metric (book cap. 11)", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "short-vector",
        embedding: [1, 0],
        embeddingMetadata: {
          provider: "test-provider",
          dimensions: 2,
          similarityMetric: "dotProduct",
        },
      }),
      createEmbeddedChunk({
        id: "long-vector-same-direction",
        embedding: [3, 0],
        embeddingMetadata: {
          provider: "test-provider",
          dimensions: 2,
          similarityMetric: "dotProduct",
        },
      }),
    ]);

    const results = store.search({ embedding: [1, 0] });

    // Dot product is magnitude-sensitive: the longer vector in the same
    // direction scores higher, unlike cosine (which would tie at 1.0).
    expect(results.map((result) => result.chunk.id)).toEqual([
      "long-vector-same-direction",
      "short-vector",
    ]);
    expect(results[0]?.score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("ranks by euclidean distance (closer = higher score) when the stored embeddings declare that metric", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "far",
        embedding: [10, 10],
        embeddingMetadata: {
          provider: "test-provider",
          dimensions: 2,
          similarityMetric: "euclidean",
        },
      }),
      createEmbeddedChunk({
        id: "near",
        embedding: [1, 1],
        embeddingMetadata: {
          provider: "test-provider",
          dimensions: 2,
          similarityMetric: "euclidean",
        },
      }),
    ]);

    const results = store.search({ embedding: [1, 1] });

    expect(results.map((result) => result.chunk.id)).toEqual(["near", "far"]);
  });

  it("rejects inserting chunks with a similarity metric that conflicts with what's already stored", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "cosine-chunk",
        embedding: [1, 0],
        embeddingMetadata: {
          provider: "test-provider",
          dimensions: 2,
          similarityMetric: "cosine",
        },
      }),
    ]);

    expect(() =>
      store.insert([
        createEmbeddedChunk({
          id: "dot-chunk",
          embedding: [0, 1],
          embeddingMetadata: {
            provider: "test-provider",
            dimensions: 2,
            similarityMetric: "dotProduct",
          },
        }),
      ])
    ).toThrow(/similarity metric/i);
  });

  it("filters by tags: chunk's tags array must include the requested tag", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "hr-chunk",
        embedding: [1, 0],
        metadata: {
          documentTitle: "HR Policy",
          modality: "text",
          sourceType: "upload",
          chunkIndex: 1,
          sectionChunkIndex: 1,
          offsetBasis: "document",
          tags: ["hr", "policy"],
        },
      }),
      createEmbeddedChunk({
        id: "eng-chunk",
        embedding: [0.9, 0.1],
        metadata: {
          documentTitle: "Engineering Runbook",
          modality: "text",
          sourceType: "upload",
          chunkIndex: 1,
          sectionChunkIndex: 1,
          offsetBasis: "document",
          tags: ["engineering"],
        },
      }),
    ]);

    const results = store.search({ embedding: [1, 0], filter: { tags: "hr" } });

    expect(results.map((result) => result.chunk.id)).toEqual(["hr-chunk"]);
  });

  it("filters by permissions as a pre-retrieval security check: unrestricted chunks stay visible, restricted ones require a matching role", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "public-chunk",
        embedding: [1, 0],
        metadata: {
          documentTitle: "Public Doc",
          modality: "text",
          sourceType: "upload",
          chunkIndex: 1,
          sectionChunkIndex: 1,
          offsetBasis: "document",
        },
      }),
      createEmbeddedChunk({
        id: "restricted-chunk",
        embedding: [0.95, 0.05],
        metadata: {
          documentTitle: "Restricted Doc",
          modality: "text",
          sourceType: "upload",
          chunkIndex: 1,
          sectionChunkIndex: 1,
          offsetBasis: "document",
          permissions: ["role:finance"],
        },
      }),
    ]);

    const asAnonymous = store.search({
      embedding: [1, 0],
      filter: { permissions: "role:finance" },
    });
    expect(asAnonymous.map((result) => result.chunk.id).sort()).toEqual([
      "public-chunk",
      "restricted-chunk",
    ]);

    const asOutsider = store.search({
      embedding: [1, 0],
      filter: { permissions: "role:sales" },
    });
    expect(asOutsider.map((result) => result.chunk.id)).toEqual(["public-chunk"]);
  });

  it("filters by tenantId as an exact match", () => {
    const store = new InMemoryVectorStore();

    store.insert([
      createEmbeddedChunk({
        id: "tenant-a-chunk",
        embedding: [1, 0],
        metadata: {
          documentTitle: "Tenant A Doc",
          modality: "text",
          sourceType: "upload",
          chunkIndex: 1,
          sectionChunkIndex: 1,
          offsetBasis: "document",
          tenantId: "tenant-a",
        },
      }),
      createEmbeddedChunk({
        id: "tenant-b-chunk",
        embedding: [0.9, 0.1],
        metadata: {
          documentTitle: "Tenant B Doc",
          modality: "text",
          sourceType: "upload",
          chunkIndex: 1,
          sectionChunkIndex: 1,
          offsetBasis: "document",
          tenantId: "tenant-b",
        },
      }),
    ]);

    const results = store.search({
      embedding: [1, 0],
      filter: { tenantId: "tenant-b" },
    });

    expect(results.map((result) => result.chunk.id)).toEqual(["tenant-b-chunk"]);
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
