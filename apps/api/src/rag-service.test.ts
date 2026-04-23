import { mkdtemp, rm } from "fs/promises";
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
