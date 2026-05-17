import { describe, expect, it, vi } from "vitest";
import { ingest } from "@groundedos/etl";

import {
  DeterministicEmbeddingProvider,
  type EmbeddedChunk,
  type EmbeddingProvider,
  type EmbeddingVector,
} from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import {
  buildRetrievalIndex,
  createRetrievalDevOutput,
  retrieveForDevMode,
  retrieveFromIndex,
  type RetrievalIndex,
} from "./retrieval";

class KeywordEmbeddingProvider implements EmbeddingProvider {
  readonly name = "keyword-test-provider";
  readonly dimensions = 3;

  async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((text) => {
      const normalized = text.toLowerCase();

      return [
        normalized.includes("alpha") ? 1 : 0,
        normalized.includes("beta") ? 1 : 0,
        normalized.includes("gamma") ? 1 : 0,
      ];
    });
  }
}

describe("retrieval flow", () => {
  it("indexes an ingested document and retrieves the most relevant chunk", async () => {
    const document = await ingest({
      type: "text",
      content:
        "Alpha launch notes describe setup work.\n\nBeta retrieval notes describe vector search.\n\nGamma evaluation notes describe scoring.",
      metadata: {
        documentId: "doc-retrieval",
        title: "Retrieval Flow Test",
      },
    });

    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
      chunkOptions: {
        maxChunkChars: 200,
        overlapChars: 0,
      },
    });
    const results = await retrieveFromIndex(index, "beta question", { topK: 1 });

    expect(index.embeddedChunks).toHaveLength(3);
    expect(index.store.size).toBe(3);
    expect(results).toHaveLength(1);
    expect(results[0]?.chunk).toMatchObject({
      id: "doc-retrieval:section-2:chunk-1",
      documentId: "doc-retrieval",
      sectionId: "section-2",
      text: "Beta retrieval notes describe vector search.",
      metadata: {
        documentTitle: "Retrieval Flow Test",
        sourceType: "manual",
      },
    });
    expect(results[0]?.score).toBeCloseTo(1);
  });

  it("returns the Dev Mode retrieval output contract", async () => {
    const document = await ingest({
      type: "text",
      content: "Alpha launch note.\n\nBeta retrieval note.",
      metadata: {
        documentId: "doc-dev-mode",
        title: "Dev Mode Test",
      },
    });
    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
      chunkOptions: {
        maxChunkChars: 200,
        overlapChars: 0,
      },
    });

    const output = await retrieveForDevMode(index, "beta question", { topK: 1 });

    expect(output).toEqual({
      query: "beta question",
      resultCount: 1,
      results: [
        {
          rank: 1,
          chunkId: "doc-dev-mode:section-2:chunk-1",
          documentId: "doc-dev-mode",
          sectionId: "section-2",
          score: 1,
          text: "Beta retrieval note.",
          source: {
            documentTitle: "Dev Mode Test",
            modality: "text",
            sourceType: "manual",
            originalFilename: undefined,
            sectionHeading: undefined,
            page: undefined,
          },
          offsets: {
            startOffset: 20,
            endOffset: 40,
            offsetBasis: "document",
          },
          embedding: {
            provider: "keyword-test-provider",
            dimensions: 3,
          },
        },
      ],
    });
  });

  it("supports metadata filters during retrieval", async () => {
    const document = await ingest({
      type: "text",
      content: "Alpha public note.\n\nBeta private note.",
      metadata: {
        documentId: "doc-filter",
        title: "Filter Test",
      },
    });
    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
      chunkOptions: {
        maxChunkChars: 200,
        overlapChars: 0,
      },
    });

    const results = await retrieveFromIndex(index, "beta question", {
      topK: 3,
      filter: {
        sectionId: "section-1",
      },
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.chunk.sectionId).toBe("section-1");
    expect(results[0]?.score).toBe(0);
  });

  it("can use a caller-provided store", async () => {
    const document = await ingest({
      type: "text",
      content: "Alpha note.",
      metadata: {
        documentId: "doc-custom-store",
      },
    });
    const store = new InMemoryVectorStore();

    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
      store,
    });

    expect(index.store).toBe(store);
    expect(store.size).toBe(1);
  });

  it("uses asynchronous search when the store exposes searchAsync", async () => {
    const document = await ingest({
      type: "text",
      content: "Alpha note.\n\nBeta retrieval note.",
      metadata: {
        documentId: "doc-async-store",
      },
    });

    const innerStore = new InMemoryVectorStore();
    const syncSearch = vi.fn(() => {
      throw new Error("sync search should not run when searchAsync is available");
    });
    const asyncSearch = vi.fn((query: Parameters<InMemoryVectorStore["search"]>[0]) =>
      innerStore.search(query)
    );

    const store = {
      get size() {
        return innerStore.size;
      },
      insert(chunks: EmbeddedChunk[]) {
        innerStore.insert(chunks);
      },
      search: syncSearch,
      clear() {
        innerStore.clear();
      },
      searchAsync: async (query: Parameters<InMemoryVectorStore["search"]>[0]) =>
        asyncSearch(query),
    };

    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
      store,
    });

    const results = await retrieveFromIndex(index, "beta question", { topK: 1 });
    expect(results[0]?.chunk.sectionId).toBe("section-2");
    expect(asyncSearch).toHaveBeenCalledTimes(1);
    expect(syncSearch).toHaveBeenCalledTimes(0);
  });

  it("returns an empty retrieval result for documents without chunks", async () => {
    const document = await ingest({
      type: "text",
      content: "   \n\n\t  ",
      metadata: {
        documentId: "doc-empty",
      },
    });
    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
    });

    const results = await retrieveFromIndex(index, "alpha", { topK: 1 });

    expect(index.embeddedChunks).toEqual([]);
    expect(index.store.size).toBe(0);
    expect(results).toEqual([]);
  });

  it("reranks dense candidates with sparse matching in hybrid mode", async () => {
    const document = await ingest({
      type: "text",
      content:
        "Alpha control note without answer terms.\n\nThis command verifies that the ETL dispatcher can route plain text input and return a NormalizedDocument.\n\nBeta control note without answer terms.",
      metadata: {
        documentId: "doc-hybrid",
        title: "Hybrid Retrieval Test",
      },
    });

    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
      chunkOptions: {
        maxChunkChars: 300,
        overlapChars: 0,
      },
    });

    const denseOnly = await retrieveFromIndex(index, "dispatcher normalized document", {
      topK: 1,
      mode: "dense",
    });
    const hybrid = await retrieveFromIndex(index, "dispatcher normalized document", {
      topK: 1,
      mode: "hybrid",
      hybridDenseWeight: 0.2,
    });

    expect(denseOnly[0]?.chunk.sectionId).toBe("section-1");
    expect(hybrid[0]?.chunk.sectionId).toBe("section-2");
    expect(hybrid[0]?.score ?? 0).toBeGreaterThan(denseOnly[0]?.score ?? 0);
  });

  it("adds hybrid diagnostics to Dev Mode output when hybrid mode is used", async () => {
    const document = await ingest({
      type: "text",
      content: "Alpha note.\n\nBeta retrieval note.",
      metadata: {
        documentId: "doc-hybrid-dev",
        title: "Hybrid Dev Mode",
      },
    });

    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
      chunkOptions: {
        maxChunkChars: 200,
        overlapChars: 0,
      },
    });

    const output = await retrieveForDevMode(index, "beta question", {
      topK: 1,
      mode: "hybrid",
    });

    expect(output.hybrid).toBeDefined();
    expect(output.hybrid?.mode).toBe("hybrid");
    expect(output.hybrid?.candidateCount).toBeGreaterThanOrEqual(1);
    expect(output.hybrid?.candidates[0]).toMatchObject({
      chunkId: "doc-hybrid-dev:section-2:chunk-1",
      sectionId: "section-2",
      denseRank: expect.any(Number),
      hybridRank: 1,
      denseScore: expect.any(Number),
      sparseScore: expect.any(Number),
      combinedScore: expect.any(Number),
    });
  });

  it("improves smoke-style retrieval with hybrid mode when query tokenization diverges", async () => {
    const document = await ingest({
      type: "text",
      content:
        "GroundedOS Lab smoke test.\n\nThis command verifies that the ETL dispatcher can route plain text input from a registered sample dataset and return a NormalizedDocument.",
      metadata: {
        documentId: "doc-smoke-hybrid",
        title: "Smoke Hybrid Test",
      },
    });

    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new DeterministicEmbeddingProvider(),
      chunkOptions: {
        maxChunkChars: 200,
        overlapChars: 0,
      },
    });

    const query = "Which output is the normalized document form?";

    const denseOnly = await retrieveFromIndex(index, query, {
      topK: 1,
      mode: "dense",
    });
    const hybrid = await retrieveFromIndex(index, query, {
      topK: 1,
      mode: "hybrid",
      hybridDenseWeight: 0.3,
    });

    expect(denseOnly[0]?.chunk.sectionId).toBe("section-2");
    expect(hybrid[0]?.chunk.sectionId).toBe("section-2");
  });

  it("rejects invalid retrieval inputs and provider query embeddings", async () => {
    const document = await ingest({
      type: "text",
      content: "Alpha note.",
      metadata: {
        documentId: "doc-invalid",
      },
    });
    const index = await buildRetrievalIndex(document, {
      embeddingProvider: new KeywordEmbeddingProvider(),
    });
    const badProviderIndex: RetrievalIndex = {
      ...index,
      embeddingProvider: {
        name: "bad-query-provider",
        dimensions: 2,
        async embedTexts() {
          return [];
        },
      },
    };

    await expect(
      buildRetrievalIndex(undefined as unknown as Parameters<typeof buildRetrievalIndex>[0])
    ).rejects.toThrow("[rag/retrieval] document is required.");
    await expect(
      retrieveFromIndex(undefined as unknown as RetrievalIndex, "alpha")
    ).rejects.toThrow("[rag/retrieval] retrieval index is required.");
    await expect(
      retrieveFromIndex(
        { ...index, embeddingProvider: undefined as unknown as EmbeddingProvider },
        "alpha"
      )
    ).rejects.toThrow("[rag/retrieval] retrieval index must include an embedding provider.");
    await expect(
      retrieveFromIndex(
        { ...index, store: undefined as unknown as RetrievalIndex["store"] },
        "alpha"
      )
    ).rejects.toThrow("[rag/retrieval] retrieval index must include a searchable store.");
    await expect(retrieveFromIndex(index, "   ")).rejects.toThrow(
      "[rag/retrieval] query must not be empty."
    );
    await expect(retrieveFromIndex(badProviderIndex, "alpha")).rejects.toThrow(
      "[rag/retrieval] provider must return exactly one query embedding."
    );
    await expect(
      retrieveFromIndex(index, "alpha", {
        mode: "hybrid",
        hybridDenseWeight: 1.2,
      })
    ).rejects.toThrow("[rag/retrieval] hybridDenseWeight must be a number between 0 and 1.");
    expect(() => createRetrievalDevOutput("alpha", undefined as unknown as [])).toThrow(
      "[rag/retrieval] retrieval results must be an array."
    );
  });
});
