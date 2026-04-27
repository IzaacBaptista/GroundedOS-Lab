import { describe, expect, it } from "vitest";

import type { RetrievalChunk } from "./chunking";
import {
  DeterministicEmbeddingProvider,
  LocalHashEmbeddingsProvider,
  OpenAIEmbeddingsProvider,
  OllamaEmbeddingsProvider,
  createEmbeddingProviderRegistry,
  embedChunks,
  semanticToEmbeddingProvider,
  type EmbeddingProvider,
  type EmbeddingProviderId,
  type EmbeddingVector,
} from "./embeddings";

function createChunk(overrides: Partial<RetrievalChunk> = {}): RetrievalChunk {
  return {
    id: "doc-1:section-1:chunk-1",
    documentId: "doc-1",
    sectionId: "section-1",
    text: "Grounded retrieval needs stable embeddings.",
    startOffset: 0,
    endOffset: 42,
    metadata: {
      documentTitle: "Embedding Test",
      modality: "text",
      sourceType: "manual",
      chunkIndex: 1,
      sectionChunkIndex: 1,
      offsetBasis: "document",
    },
    ...overrides,
  };
}

describe("DeterministicEmbeddingProvider", () => {
  it("generates the same vector for the same text", async () => {
    const provider = new DeterministicEmbeddingProvider({ dimensions: 8 });

    const [first] = await provider.embedTexts(["repeatable text"]);
    const [second] = await provider.embedTexts(["repeatable text"]);

    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
  });

  it("uses a stable configurable vector dimension", async () => {
    const provider = new DeterministicEmbeddingProvider({ dimensions: 12 });
    const vectors = await provider.embedTexts(["alpha", "beta"]);

    expect(provider.name).toBe("deterministic-local");
    expect(vectors).toHaveLength(2);
    expect(vectors.every((vector) => vector.length === 12)).toBe(true);
  });

  it("rejects invalid provider options", () => {
    expect(() => new DeterministicEmbeddingProvider({ dimensions: 0 })).toThrow(
      "[rag/embeddings] dimensions must be a positive integer."
    );
    expect(() => new DeterministicEmbeddingProvider({ dimensions: 1.5 })).toThrow(
      "[rag/embeddings] dimensions must be a positive integer."
    );
    expect(() => new DeterministicEmbeddingProvider({ name: "   " })).toThrow(
      "[rag/embeddings] provider name must not be empty."
    );
  });
});

describe("LocalHashEmbeddingsProvider", () => {
  it("generates the same vector for the same text", async () => {
    const provider = new LocalHashEmbeddingsProvider({ dimensions: 32 });

    const first = await provider.embedOne({ text: "Repeatable retrieval text" });
    const second = await provider.embedOne({ text: "Repeatable retrieval text" });

    expect(first.vector).toEqual(second.vector);
    expect(first.model).toMatchObject({
      provider: "local-hash",
      model: "local-hash-v1",
      dimensions: 32,
      normalized: true,
    });
  });

  it("uses fixed dimensions", async () => {
    const provider = new LocalHashEmbeddingsProvider({ dimensions: 64 });
    const results = await provider.embedMany([
      { text: "alpha retrieval" },
      { text: "beta retrieval" },
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.vector.length === 64)).toBe(true);
  });

  it("normalizes non-empty vectors", async () => {
    const provider = new LocalHashEmbeddingsProvider({ dimensions: 32 });
    const result = await provider.embedOne({ text: "retrieval vectors are normalized" });

    expect(vectorMagnitude(result.vector)).toBeCloseTo(1, 10);
  });

  it("scores related text higher than clearly unrelated text", async () => {
    const provider = new LocalHashEmbeddingsProvider({ dimensions: 256 });
    const [query, related, unrelated] = await provider.embedMany([
      { text: "vector search retrieval" },
      { text: "retrieval uses vector search" },
      { text: "banana recipe kitchen" },
    ]);

    expect(cosineSimilarity(query?.vector ?? [], related?.vector ?? [])).toBeGreaterThan(
      cosineSimilarity(query?.vector ?? [], unrelated?.vector ?? [])
    );
  });

  it("adapts semantic providers to the legacy EmbeddingProvider interface", async () => {
    const semanticProvider = new LocalHashEmbeddingsProvider({ dimensions: 16 });
    const provider = semanticToEmbeddingProvider(semanticProvider);
    const embedded = await embedChunks([createChunk()], provider);

    expect(provider.name).toBe("local-hash");
    expect(provider.dimensions).toBe(16);
    expect(embedded[0]?.embeddingMetadata).toMatchObject({
      provider: "local-hash",
      dimensions: 16,
      model: "local-hash-v1",
      normalized: true,
    });
  });
});

describe("OllamaEmbeddingsProvider", () => {
  it("posts batch inputs to Ollama and returns vectors with model metadata", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new OllamaEmbeddingsProvider({
      baseUrl: "http://localhost:11434/",
      model: "embeddinggemma",
      dimensions: 3,
      fetchFn: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });

        return createJsonResponse({
          model: "embeddinggemma",
          embeddings: [
            [1, 0, 0],
            [0, 1, 0],
          ],
        });
      },
    });

    const results = await provider.embedMany([
      { text: "first retrieval text" },
      { text: "second retrieval text" },
    ]);

    expect(requests).toEqual([
      {
        url: "http://localhost:11434/api/embed",
        body: {
          model: "embeddinggemma",
          input: ["first retrieval text", "second retrieval text"],
          truncate: true,
          dimensions: 3,
        },
      },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      vector: [1, 0, 0],
      model: {
        provider: "ollama",
        model: "embeddinggemma",
        dimensions: 3,
        normalized: true,
      },
    });
  });

  it("rejects Ollama HTTP errors with a clear message", async () => {
    const provider = new OllamaEmbeddingsProvider({
      dimensions: 3,
      fetchFn: async () => createTextResponse(404, "model not found"),
    });

    await expect(provider.embedOne({ text: "hello" })).rejects.toThrow(
      "[rag/embeddings] ollama embed request failed with status 404: model not found"
    );
  });

  it("rejects Ollama embeddings with unexpected dimensions", async () => {
    const provider = new OllamaEmbeddingsProvider({
      dimensions: 3,
      fetchFn: async () =>
        createJsonResponse({
          embeddings: [[1, 0]],
        }),
    });

    await expect(provider.embedOne({ text: "hello" })).rejects.toThrow(
      "[rag/embeddings] ollama embedding at index 0 has 2 dimensions; expected 3."
    );
  });
});

describe("OpenAIEmbeddingsProvider", () => {
  it("posts batch inputs to OpenAI and returns vectors with model metadata", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const provider = new OpenAIEmbeddingsProvider({
      apiKey: "test-key",
      baseUrl: "https://api.openai.com/v1/",
      model: "text-embedding-3-small",
      dimensions: 3,
      fetchFn: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });

        return createJsonResponse({
          object: "list",
          data: [
            {
              object: "embedding",
              index: 0,
              embedding: [1, 0, 0],
            },
            {
              object: "embedding",
              index: 1,
              embedding: [0, 1, 0],
            },
          ],
          model: "text-embedding-3-small",
          usage: {
            prompt_tokens: 12,
            total_tokens: 12,
          },
        });
      },
    });

    const results = await provider.embedMany([
      { text: "first retrieval text" },
      { text: "second retrieval text" },
    ]);

    expect(requests).toEqual([
      {
        url: "https://api.openai.com/v1/embeddings",
        body: {
          model: "text-embedding-3-small",
          input: ["first retrieval text", "second retrieval text"],
          dimensions: 3,
          encoding_format: "float",
        },
      },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      vector: [1, 0, 0],
      model: {
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 3,
        normalized: true,
      },
      usage: {
        inputTokens: 12,
      },
    });
  });

  it("rejects OpenAI HTTP errors with a clear message", async () => {
    const provider = new OpenAIEmbeddingsProvider({
      apiKey: "test-key",
      dimensions: 3,
      fetchFn: async () => createTextResponse(401, "invalid api key"),
    });

    await expect(provider.embedOne({ text: "hello" })).rejects.toThrow(
      "[rag/embeddings] openai embed request failed with status 401: invalid api key"
    );
  });

  it("rejects OpenAI embeddings with unexpected dimensions", async () => {
    const provider = new OpenAIEmbeddingsProvider({
      apiKey: "test-key",
      dimensions: 3,
      fetchFn: async () =>
        createJsonResponse({
          data: [
            {
              object: "embedding",
              index: 0,
              embedding: [1, 0],
            },
          ],
        }),
    });

    await expect(provider.embedOne({ text: "hello" })).rejects.toThrow(
      "[rag/embeddings] openai embedding at index 0 has 2 dimensions; expected 3."
    );
  });
});

describe("EmbeddingProviderRegistry", () => {
  it("returns known providers and rejects unknown providers", () => {
    const registry = createEmbeddingProviderRegistry([
      new LocalHashEmbeddingsProvider({ dimensions: 16 }),
      new OllamaEmbeddingsProvider({
        dimensions: 3,
        fetchFn: async () => createJsonResponse({ embeddings: [] }),
      }),
    ]);

    expect(registry.get("local-hash").getModelInfo()).toMatchObject({
      provider: "local-hash",
      dimensions: 16,
    });
    expect(registry.get("ollama").getModelInfo()).toMatchObject({
      provider: "ollama",
      dimensions: 3,
    });
    expect(registry.list()).toHaveLength(2);
    expect(() => registry.get("missing" as EmbeddingProviderId)).toThrow(
      '[rag/embeddings] unknown embedding provider "missing".'
    );
  });
});

describe("embedChunks", () => {
  it("embeds chunks while preserving IDs and metadata", async () => {
    const chunks = [
      createChunk(),
      createChunk({
        id: "doc-1:section-2:chunk-1",
        sectionId: "section-2",
        text: "Second chunk.",
        metadata: {
          documentTitle: "Embedding Test",
          modality: "text",
          sourceType: "manual",
          chunkIndex: 2,
          sectionChunkIndex: 1,
          offsetBasis: "document",
        },
      }),
    ];
    const embedded = await embedChunks(
      chunks,
      new DeterministicEmbeddingProvider({ dimensions: 8 })
    );

    expect(embedded).toHaveLength(2);
    expect(embedded[0]).toMatchObject({
      id: chunks[0]?.id,
      documentId: chunks[0]?.documentId,
      sectionId: chunks[0]?.sectionId,
      text: chunks[0]?.text,
      metadata: chunks[0]?.metadata,
      embeddingMetadata: {
        provider: "deterministic-local",
        dimensions: 8,
      },
    });
    expect(embedded[0]?.embedding).toHaveLength(8);
    expect(embedded[1]?.metadata.chunkIndex).toBe(2);
  });

  it("returns an empty result for an empty chunk list", async () => {
    const embedded = await embedChunks(
      [],
      new DeterministicEmbeddingProvider({ dimensions: 8 })
    );

    expect(embedded).toEqual([]);
  });

  it("rejects missing or incomplete providers", async () => {
    await expect(
      embedChunks([createChunk()], undefined as unknown as EmbeddingProvider)
    ).rejects.toThrow("[rag/embeddings] provider is required.");

    await expect(
      embedChunks([createChunk()], {
        name: "incomplete",
        dimensions: 2,
      } as unknown as EmbeddingProvider)
    ).rejects.toThrow("[rag/embeddings] provider must implement embedTexts(texts).");
  });

  it("rejects providers that return the wrong number of embeddings", async () => {
    const provider: EmbeddingProvider = {
      name: "bad-count",
      dimensions: 2,
      async embedTexts() {
        return [[1, 0]];
      },
    };

    await expect(embedChunks([createChunk(), createChunk()], provider)).rejects.toThrow(
      "[rag/embeddings] provider returned 1 embeddings for 2 chunks."
    );
  });

  it("rejects embeddings with invalid dimensions or values", async () => {
    const wrongDimensionsProvider: EmbeddingProvider = {
      name: "bad-dimensions",
      dimensions: 3,
      async embedTexts() {
        return [[1, 0]];
      },
    };
    const nonFiniteProvider: EmbeddingProvider = {
      name: "bad-values",
      dimensions: 2,
      async embedTexts() {
        return [[1, Number.NaN]];
      },
    };

    await expect(embedChunks([createChunk()], wrongDimensionsProvider)).rejects.toThrow(
      "[rag/embeddings] embedding at index 0 has 2 dimensions; expected 3."
    );
    await expect(embedChunks([createChunk()], nonFiniteProvider)).rejects.toThrow(
      "[rag/embeddings] embedding at index 0 contains a non-finite value."
    );
  });
});

function vectorMagnitude(vector: EmbeddingVector): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function cosineSimilarity(left: EmbeddingVector, right: EmbeddingVector): number {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function createJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  } as Response;
}

function createTextResponse(status: number, body: string): Response {
  return {
    ok: false,
    status,
    async text() {
      return body;
    },
  } as Response;
}
