import { describe, expect, it, vi } from "vitest";
import type { EmbeddedChunk } from "./embeddings";
import { PgvectorVectorStore, createVectorStore, type PgClient } from "./pgvector-store";

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
        similarity_score: 0.98,
      },
    ]);
    const store = new PgvectorVectorStore(client, {} as never);

    const results = await store.searchAsync({ embedding: [1, 0] });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.id).toBe("chunk-1");
    expect(results[0]?.score).toBeCloseTo(0.98);
  });
});

describe("PgvectorVectorStore ANN index (book cap. 14)", () => {
  it("builds an ivfflat index with the operator class matching the declared similarity metric", async () => {
    const { client, queries } = createFakeClient();

    await createVectorStore({ connect: async () => client, similarityMetric: "dotProduct" });

    const indexQuery = queries.find((q) => q.sql.includes("CREATE INDEX"))!;
    expect(indexQuery.sql).toContain("USING ivfflat (embedding vector_ip_ops)");
    expect(indexQuery.sql).toContain("lists = 100");
  });

  it("builds an hnsw index with configured m/ef_construction when indexType is hnsw", async () => {
    const { client, queries } = createFakeClient();

    await createVectorStore({
      connect: async () => client,
      indexType: "hnsw",
      hnswM: 32,
      hnswEfConstruction: 128,
    });

    const indexQuery = queries.find((q) => q.sql.includes("CREATE INDEX"))!;
    expect(indexQuery.sql).toContain("USING hnsw (embedding vector_cosine_ops)");
    expect(indexQuery.sql).toContain("m = 32");
    expect(indexQuery.sql).toContain("ef_construction = 128");
  });

  it("uses the operator matching the declared metric when scoring and ordering results", async () => {
    const { client, queries } = createFakeClient();
    const store = new PgvectorVectorStore(client, { similarityMetric: "euclidean" } as never);

    await store.searchAsync({ embedding: [1, 0] });

    const searchQuery = queries[0]!;
    expect(searchQuery.sql).toContain("embedding <-> $1::vector");
    expect(searchQuery.sql).toContain("1 / (1 + (embedding <-> $1::vector))");
    expect(searchQuery.sql).not.toContain("<=>");
  });

  it("sets ivfflat.probes before searching when configured (recall/latency knob)", async () => {
    const { client, queries } = createFakeClient();
    const store = new PgvectorVectorStore(client, { probes: 10 } as never);

    await store.searchAsync({ embedding: [1, 0] });

    expect(queries[0]!.sql).toBe("SET ivfflat.probes = 10");
    expect(queries[1]!.sql).toContain("SELECT");
  });

  it("sets hnsw.ef_search before searching when indexType is hnsw and configured", async () => {
    const { client, queries } = createFakeClient();
    const store = new PgvectorVectorStore(client, {
      indexType: "hnsw",
      hnswEfSearch: 200,
    } as never);

    await store.searchAsync({ embedding: [1, 0] });

    expect(queries[0]!.sql).toBe("SET hnsw.ef_search = 200");
  });

  it("reindexAnn() rebuilds the index without blocking concurrent access", async () => {
    const { client, queries } = createFakeClient();
    const store = new PgvectorVectorStore(client, { tableName: "custom_chunks" } as never);

    await store.reindexAnn();

    expect(queries[0]!.sql).toBe("REINDEX INDEX CONCURRENTLY custom_chunks_embedding_idx");
  });
});
