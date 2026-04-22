import { describe, expect, it } from "vitest";

import { ApiRequestError, askRag, askRagFromFile } from "./rag-service";

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
