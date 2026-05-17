import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, describe, expect, it } from "vitest";

import {
  ApiRequestError,
  askRag,
  askRagFromFile,
  deletePersistedRagIndex,
  getRagSessionMemory,
  getRagTradeoffMetrics,
  indexRag,
  listPersistedRagIndexes,
  resetRagRuntimeStateForTests,
} from "./rag-service";

beforeEach(async () => {
  await resetRagRuntimeStateForTests();
});

describe("askRag", () => {
  it("answers a grounded question against inline text", async () => {
    const output = await askRag({
      type: "text",
      content:
        "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      query: "What explains vector search?",
      title: "Inline API Test",
      documentId: "api-test-doc",
      topK: 1,
    });

    expect(output.document).toMatchObject({
      documentId: "api-test-doc",
      title: "Inline API Test",
      modality: "text",
    });
    expect(output.answer).toMatchObject({
      grounded: true,
      citations: [
        {
          chunkId: "api-test-doc:section-2:chunk-1",
          documentId: "api-test-doc",
          sectionId: "section-2",
        },
      ],
    });
    expect(output.answer.text).toContain("Beta retrieval notes explain vector search.");
    expect(output.index).toMatchObject({
      chunkCount: 2,
      embeddingProvider: "api-lexical",
      embeddingDimensions: 64,
      embeddingModel: {
        provider: "api-lexical",
        model: "api-lexical-v1",
        dimensions: 64,
        normalized: true,
      },
    });
    expect(output.devMode.results[0]?.chunkId).toBe("api-test-doc:section-2:chunk-1");
    expect(output.devMode.processedQuery?.intent).toBe("factual");
    expect(output.devMode.workflowContext?.steps["process-query"]?.status).toBe("success");
    expect(output.devMode.hybrid?.mode).toBe("hybrid");
    expect(output.devMode.hybrid?.candidateCount).toBeGreaterThanOrEqual(1);
    expect(output.devMode.hybrid?.candidates.length).toBeGreaterThanOrEqual(1);
    expect(output.devMode.hybrid?.candidates[0]).toMatchObject({
      denseScore: expect.any(Number),
      sparseScore: expect.any(Number),
      combinedScore: expect.any(Number),
    });
    expect(output.devMode.reranking).toMatchObject({
      applied: true,
      returnedCount: 1,
    });
    expect(output.devMode.reranking?.candidateCount).toBeGreaterThanOrEqual(1);
    expect(output.devMode.reranking?.candidates?.[0]).toMatchObject({
      beforeRank: expect.any(Number),
      afterRank: expect.any(Number),
      hybridScore: expect.any(Number),
      lexicalOverlapScore: expect.any(Number),
      finalScore: expect.any(Number),
    });
    expect(output.devMode.workflowContext?.steps["rerank-chunks"]?.status).toBe("success");
    expect(output.devMode.stageMetrics).toBeDefined();
    expect(output.devMode.stageMetrics?.map((stage) => stage.stage)).toEqual([
      "process-query",
      "retrieve-chunks",
      "rerank-chunks",
    ]);
    expect(output.devMode.stageMetrics?.every((stage) => stage.inputTokens >= 0)).toBe(true);
    expect(output.devMode.stageMetrics?.every((stage) => stage.durationMs >= 0)).toBe(true);
    expect(output.devMode.retrievalSpans?.map((span) => span.stage)).toEqual([
      "retrieve-chunks",
      "rerank-chunks",
    ]);
    expect(output.devMode.retrievalSpans?.every((span) => span.chunkCount >= 0)).toBe(true);
    expect(output.devMode.retrievalSpans?.every((span) => span.latencyMs >= 0)).toBe(true);
    expect(output.devMode.retrievalSpans?.[0]?.score.max).toBeGreaterThanOrEqual(
      output.devMode.retrievalSpans?.[0]?.score.min ?? 0
    );
    expect(output.devMode.cache?.hit).toBe(false);
    expect(output.devMode.cost?.withinBudget).toBe(true);
    expect(output.devMode.cost?.breakdown.some((item) => item.stage === "reranking")).toBe(true);
    expect(output.devMode.evals?.taxonomy?.category).toBe("LOW_CONFIDENCE");
    expect(output.devMode.evals?.confidence?.confidenceLevel).toBeDefined();
    expect(output.devMode.retrievalDiagnostics).toMatchObject({
      retrievalMetadata: {
        retrievalMode: "hybrid",
      },
    });
    expect(output.devMode.replay?.snapshot.query).toBe("What explains vector search?");
    expect(output.devMode.replay?.command).toContain("npm run rag:replay");
  });

  it("returns a semantic cache hit on repeated equivalent requests", async () => {
    const request = {
      type: "text" as const,
      content: "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      query: "What explains vector search?",
      title: "Cache API Test",
      documentId: "api-cache-doc",
      topK: 1,
    };

    const first = await askRag(request);
    const second = await askRag(request);

    expect(first.devMode.cache?.hit).toBe(false);
    expect(second.devMode.cache?.hit).toBe(true);
    expect(second.devMode.cache?.hits).toBeGreaterThanOrEqual(1);
  });

  it("records trade-off metrics for dashboard aggregation", async () => {
    await askRag({
      type: "text",
      content: "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      query: "What explains vector search?",
      title: "Metrics API Test",
      documentId: "api-metrics-doc",
      topK: 1,
    });

    const metrics = getRagTradeoffMetrics();

    expect(metrics.totals.requests).toBe(1);
    expect(metrics.providers[0]?.provider).toBe("api-lexical");
    expect(metrics.recent[0]?.requestId).toBeTruthy();
  });

  it("stores and recalls session memory when sessionId is provided", async () => {
    const first = await askRag({
      type: "text",
      content: "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      query: "What explains vector search?",
      title: "Memory API Test",
      documentId: "api-memory-doc",
      topK: 1,
      sessionId: "session-memory-1",
    });

    expect(first.devMode.memory?.stored).toBe(true);

    const second = await askRag({
      type: "text",
      content: "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      query: "What explains vector search?",
      title: "Memory API Test",
      documentId: "api-memory-doc",
      topK: 1,
      sessionId: "session-memory-1",
    });

    expect(second.devMode.memory?.recalled).toBeGreaterThanOrEqual(1);

    const memory = await getRagSessionMemory("session-memory-1");
    expect(memory.count).toBeGreaterThanOrEqual(2);
  });

  it("rejects invalid request payloads", async () => {
    await expect(askRag({ type: "pdf", content: "x", query: "x" })).rejects.toThrow(
      'JSON API currently supports only type "text"'
    );
    await expect(askRag({ type: "text", content: "", query: "x" })).rejects.toThrow(
      "content must be a non-empty string."
    );
    await expect(askRag({ type: "text", content: "x", query: "" })).rejects.toThrow(
      "query must be a non-empty string."
    );
    await expect(
      askRag({ type: "text", content: "x", query: "x", topK: 0 })
    ).rejects.toThrow("topK must be a positive integer.");
    await expect(
      askRag({
        type: "text",
        content: "x",
        query: "x",
        embeddingProvider: "semantic-placeholder" as unknown as "api-lexical",
      })
    ).rejects.toThrow(
      'embeddingProvider must be "api-lexical", "local-hash", "ollama" or "openai".'
    );
  });

  it("uses typed request errors for validation failures", async () => {
    await expect(askRag(undefined as unknown as Parameters<typeof askRag>[0])).rejects
      .toBeInstanceOf(ApiRequestError);
  });

  it("classifies missing evidence as not found", async () => {
    const output = await askRag({
      type: "text",
      content: "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      query: "What does the GPU cluster autoscaler do?",
      title: "Missing Evidence Test",
      documentId: "missing-evidence-doc",
      topK: 1,
    });

    expect(output.devMode.evals?.taxonomy?.category).toBe("NOT_FOUND");
    expect(output.devMode.evals?.confidence?.confidenceLevel).toMatch(/LOW|UNRELIABLE/);
  });
});

describe("askRagFromFile", () => {
  it("answers a grounded question against a local uploaded file", async () => {
    const output = await askRagFromFile({
      type: "text",
      filePath: "datasets/samples/phase-0-smoke.txt",
      originalFilename: "phase-0-smoke.txt",
      query: "What does this command verify?",
      documentId: "api-file-test",
      topK: 1,
    });

    expect(output.document).toMatchObject({
      documentId: "api-file-test",
      title: "phase-0-smoke.txt",
      modality: "text",
      originalFilename: "phase-0-smoke.txt",
    });
    expect(output.answer.grounded).toBe(true);
    expect(output.answer.text).toContain("This command verifies that the ETL dispatcher");
    expect(output.devMode.results[0]?.chunkId).toBe("api-file-test:section-2:chunk-1");
  });
});

describe("persisted RAG indexes", () => {
  it("indexes inline text and answers later by documentId", async () => {
    const indexDir = await createTempIndexDir();

    try {
      const indexed = await indexRag({
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "Persisted API Test",
        documentId: "persisted-api-test",
        indexDir,
      });

      expect(indexed).toMatchObject({
        document: {
          documentId: "persisted-api-test",
          title: "Persisted API Test",
          modality: "text",
        },
        index: {
          chunkCount: 2,
          embeddingProvider: "api-lexical",
          embeddingDimensions: 64,
        },
        storage: {
          persisted: true,
        },
      });
      expect(indexed.storage.indexPath).toContain("groundedos-api-index-test-");

      const output = await askRag({
        documentId: "persisted-api-test",
        query: "What explains vector search?",
        topK: 1,
        indexDir,
      });

      expect(output.storage).toMatchObject({
        persisted: true,
      });
      expect(output.answer.grounded).toBe(true);
      expect(output.answer.text).toContain("Beta retrieval notes explain vector search.");
      expect(output.devMode.results[0]?.chunkId).toBe(
        "persisted-api-test:section-2:chunk-1"
      );
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  });

  it("indexes with local-hash and answers later using the persisted provider", async () => {
    const indexDir = await createTempIndexDir();

    try {
      const indexed = await indexRag({
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "Local Hash API Test",
        documentId: "local-hash-api-test",
        embeddingProvider: "local-hash",
        indexDir,
      });

      expect(indexed.index).toMatchObject({
        chunkCount: 2,
        embeddingProvider: "local-hash",
        embeddingDimensions: 256,
        embeddingModel: {
          provider: "local-hash",
          model: "local-hash-v1",
          dimensions: 256,
          normalized: true,
        },
      });

      const output = await askRag({
        documentId: "local-hash-api-test",
        query: "What explains vector search?",
        topK: 1,
        embeddingProvider: "api-lexical",
        indexDir,
      });

      expect(output.index).toMatchObject({
        embeddingProvider: "local-hash",
        embeddingDimensions: 256,
      });
      expect(output.answer.grounded).toBe(true);
      expect(output.answer.text).toContain("Beta retrieval notes explain vector search.");

      const listed = await listPersistedRagIndexes(indexDir);

      expect(listed.indexes[0]?.index).toMatchObject({
        embeddingProvider: "local-hash",
        embeddingModel: {
          provider: "local-hash",
          model: "local-hash-v1",
        },
      });
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  });

  it("continues to read older api-lexical indexes without embeddingModel", async () => {
    const indexDir = await createTempIndexDir();

    try {
      const indexed = await indexRag({
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "Legacy API Test",
        documentId: "legacy-api-test",
        indexDir,
      });
      const raw = JSON.parse(await readFile(indexed.storage.indexPath, "utf-8")) as {
        index: {
          embeddingModel?: unknown;
        };
      };

      delete raw.index.embeddingModel;
      await writeFile(indexed.storage.indexPath, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");

      const output = await askRag({
        documentId: "legacy-api-test",
        query: "What explains vector search?",
        topK: 1,
        indexDir,
      });

      expect(output.index).toMatchObject({
        embeddingProvider: "api-lexical",
        embeddingDimensions: 64,
        embeddingModel: {
          provider: "api-lexical",
          model: "api-lexical-v1",
        },
      });
      expect(output.answer.grounded).toBe(true);
      expect(output.answer.text).toContain("Beta retrieval notes explain vector search.");
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  });

  it("can index and ask with the Ollama provider when configured", async () => {
    const originalFetch = globalThis.fetch;
    const indexDir = await createTempIndexDir();

    globalThis.fetch = createFakeOllamaFetch();

    try {
      const indexed = await indexRag({
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "Ollama API Test",
        documentId: "ollama-api-test",
        embeddingProvider: "ollama",
        indexDir,
      });

      expect(indexed.index).toMatchObject({
        chunkCount: 2,
        embeddingProvider: "ollama",
        embeddingDimensions: 768,
        embeddingModel: {
          provider: "ollama",
          model: "embeddinggemma",
          dimensions: 768,
          normalized: true,
        },
      });

      const output = await askRag({
        documentId: "ollama-api-test",
        query: "What explains vector search?",
        topK: 1,
        embeddingProvider: "api-lexical",
        indexDir,
      });

      expect(output.index).toMatchObject({
        embeddingProvider: "ollama",
        embeddingDimensions: 768,
      });
      expect(output.answer.grounded).toBe(true);
      expect(output.answer.text).toContain("Beta retrieval notes explain vector search.");
    } finally {
      globalThis.fetch = originalFetch;
      await rm(indexDir, { recursive: true, force: true });
    }
  });

  it("can index and ask with the OpenAI provider when configured", async () => {
    const originalFetch = globalThis.fetch;
    const originalApiKey = process.env.OPENAI_API_KEY;
    const indexDir = await createTempIndexDir();

    globalThis.fetch = createFakeOpenAiFetch();
    process.env.OPENAI_API_KEY = "test-openai-key";

    try {
      const indexed = await indexRag({
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "OpenAI API Test",
        documentId: "openai-api-test",
        embeddingProvider: "openai",
        indexDir,
      });

      expect(indexed.index).toMatchObject({
        chunkCount: 2,
        embeddingProvider: "openai",
        embeddingDimensions: 1536,
        embeddingModel: {
          provider: "openai",
          model: "text-embedding-3-small",
          dimensions: 1536,
          normalized: true,
        },
      });

      const output = await askRag({
        documentId: "openai-api-test",
        query: "What explains vector search?",
        topK: 1,
        embeddingProvider: "api-lexical",
        indexDir,
      });

      expect(output.index).toMatchObject({
        embeddingProvider: "openai",
        embeddingDimensions: 1536,
      });
      expect(output.answer.grounded).toBe(true);
      expect(output.answer.text).toContain("Beta retrieval notes explain vector search.");
    } finally {
      globalThis.fetch = originalFetch;
      if (originalApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
      await rm(indexDir, { recursive: true, force: true });
    }
  });

  it("lists and deletes persisted indexes", async () => {
    const indexDir = await createTempIndexDir();

    try {
      await indexRag({
        type: "text",
        content:
          "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
        title: "Listed API Test",
        documentId: "listed-api-test",
        indexDir,
      });

      const listed = await listPersistedRagIndexes(indexDir);

      expect(listed.count).toBe(1);
      expect(listed.indexes[0]).toMatchObject({
        document: {
          documentId: "listed-api-test",
          title: "Listed API Test",
        },
        index: {
          chunkCount: 2,
        },
        storage: {
          persisted: true,
        },
      });

      const deleted = await deletePersistedRagIndex("listed-api-test", indexDir);

      expect(deleted).toMatchObject({
        deleted: true,
        index: {
          document: {
            documentId: "listed-api-test",
          },
        },
      });
      await expect(
        askRag({
          documentId: "listed-api-test",
          query: "What explains vector search?",
          indexDir,
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(listPersistedRagIndexes(indexDir)).resolves.toEqual({
        count: 0,
        indexes: [],
      });
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  });

  it("returns a typed not found error for missing persisted indexes", async () => {
    const indexDir = await createTempIndexDir();

    try {
      await expect(
        askRag({
          documentId: "missing-index",
          query: "What is indexed?",
          indexDir,
        })
      ).rejects.toMatchObject({
        statusCode: 404,
        message: 'No persisted RAG index found for documentId "missing-index".',
      });
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  });

  it("isolates persisted retrieval by tenant and user ownership", async () => {
    const indexDir = await createTempIndexDir();

    try {
      await indexRag({
        type: "text",
        content: "Tenant A private document.",
        title: "Tenant A",
        documentId: "tenant-a-doc",
        indexDir,
        ownerId: "user-a",
        tenantId: "tenant-a",
      });

      await expect(
        askRag({
          documentId: "tenant-a-doc",
          query: "What is private?",
          indexDir,
          ownerId: "user-a",
          tenantId: "tenant-b",
        })
      ).rejects.toMatchObject({
        statusCode: 404,
      });

      await expect(
        listPersistedRagIndexes(indexDir, "user-a", "tenant-b")
      ).resolves.toMatchObject({
        count: 0,
      });
    } finally {
      await rm(indexDir, { recursive: true, force: true });
    }
  });
});

async function createTempIndexDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "groundedos-api-index-test-"));
}

function createFakeOllamaFetch(): typeof fetch {
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      input?: string | string[];
      dimensions?: number;
    };
    const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
    const dimensions = body.dimensions ?? 768;

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          model: "embeddinggemma",
          embeddings: inputs.map((input) => createFakeOllamaVector(input, dimensions)),
        };
      },
    } as Response;
  }) as typeof fetch;
}

function createFakeOllamaVector(input: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const normalized = input.toLowerCase();

  if (normalized.includes("vector") || normalized.includes("retrieval")) {
    vector[0] = 1;
    return vector;
  }

  vector[1] = 1;
  return vector;
}

function createFakeOpenAiFetch(): typeof fetch {
  return (async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as {
      input?: string | string[];
      dimensions?: number;
    };
    const inputs = Array.isArray(body.input) ? body.input : [body.input ?? ""];
    const dimensions = body.dimensions ?? 1536;

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          object: "list",
          data: inputs.map((input, index) => ({
            object: "embedding",
            index,
            embedding: createFakeOllamaVector(input, dimensions),
          })),
          model: "text-embedding-3-small",
          usage: {
            prompt_tokens: 12,
            total_tokens: 12,
          },
        };
      },
    } as Response;
  }) as typeof fetch;
}
