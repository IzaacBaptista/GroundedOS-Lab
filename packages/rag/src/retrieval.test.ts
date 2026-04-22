import { describe, expect, it } from "vitest";
import { ingest } from "@groundedos/etl";

import type { EmbeddingProvider, EmbeddingVector } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import {
  buildRetrievalIndex,
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
  });
});
