import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";

import {
  ApiRequestError,
  askRag,
  askRagFromFile,
  deletePersistedRagIndex,
  indexRag,
  listPersistedRagIndexes,
} from "./rag-service";

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
    ).rejects.toThrow('embeddingProvider must be "api-lexical", "local-hash" or "ollama".');
  });

  it("uses typed request errors for validation failures", async () => {
    await expect(askRag(undefined as unknown as Parameters<typeof askRag>[0])).rejects
      .toBeInstanceOf(ApiRequestError);
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
