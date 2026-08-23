import { describe, expect, it, vi } from "vitest";
import type { EmbeddedChunk } from "./embeddings";
import { PgvectorVectorStore, type PgClient } from "./pgvector-store";

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

function createFakeClient(rows: unknown[] = []): { client: PgClient; queries: Array<{ sql: string; params?: unknown[] }> } {
  const queries: Array<{ sql: string; params?: unknown[] }> = [];
  const client: PgClient = {
    async query(sql: string, params?: unknown[]) {
      queries.push({ sql, params });
      return { rows: rows as never[] };
    },
    async end() {},
  };
  return { client, queries };
}

describe("PgvectorVectorStore.searchAsync filter building (book cap. 13)", () => {
  it("filters top-level RetrievalChunk fields as real columns", async () => {
    const { client, queries } = createFakeClient();
    const store = new PgvectorVectorStore(client, {} as never);

    await store.searchAsync({
      embedding: [1, 0],
      filter: { documentId: "doc-1", sectionId: "section-1" },
    });

    const searchQuery = queries[0]!;
    expect(searchQuery.sql).toContain("document_id = $3");
    expect(searchQuery.sql).toContain("section_id = $4");
    expect(searchQuery.params).toEqual(["[1,0]", 5, "doc-1", "section-1"]);
  });

  it("filters metadata JSONB fields (e.g. tenantId, modality) instead of assuming a real column", async () => {
    const { client, queries } = createFakeClient();
    const store = new PgvectorVectorStore(client, {} as never);

    await store.searchAsync({
      embedding: [1, 0],
      filter: { tenantId: "tenant-a", modality: "text" },
    });

    const searchQuery = queries[0]!;
    expect(searchQuery.sql).not.toContain("tenant_id");
    expect(searchQuery.sql).toContain("metadata->'tenantId'");
    expect(searchQuery.sql).toContain("metadata->'modality'");
  });

  it("treats array-valued metadata fields as contains-or-open, matching InMemoryVectorStore (book cap. 9)", async () => {
    const { client, queries } = createFakeClient();
    const store = new PgvectorVectorStore(client, {} as never);

    await store.searchAsync({
      embedding: [1, 0],
      filter: { permissions: "role:qa" },
    });

    const searchQuery = queries[0]!;
    expect(searchQuery.sql).toContain("jsonb_typeof(metadata->'permissions')");
    expect(searchQuery.sql).toContain("jsonb_array_length(metadata->'permissions') = 0");
    expect(searchQuery.params).toContain("role:qa");
  });

  it("rejects filter keys that aren't safe identifiers", async () => {
    const { client } = createFakeClient();
    const store = new PgvectorVectorStore(client, {} as never);

    await expect(
      store.searchAsync({
        embedding: [1, 0],
        filter: { "tenantId; DROP TABLE rag_chunks;--": "x" },
      })
    ).rejects.toThrow(/invalid filter key/i);
  });

  it("still returns mapped chunk results end-to-end", async () => {
    const { client } = createFakeClient([
      {
        id: "chunk-1",
        document_id: "doc-1",
        section_id: "section-1",
        start_offset: 0,
        end_offset: 10,
        text: "chunk text",
        metadata: { documentTitle: "doc", modality: "text" },
        embedding_metadata: { provider: "test", dimensions: 2 },
        cosine_distance: 0.98,
      },
    ]);
    const store = new PgvectorVectorStore(client, {} as never);

    const results = await store.searchAsync({ embedding: [1, 0] });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("chunk-1");
    expect(results[0]?.score).toBeCloseTo(0.98);
  });
});
