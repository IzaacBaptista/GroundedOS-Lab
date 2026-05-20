import { describe, expect, it } from "vitest";
import { makeRagTestCase } from "./index";

describe("rag harness helpers", () => {
  it("creates RAG test cases with defaults", () => {
    const testCase = makeRagTestCase();

    expect(testCase).toEqual({
      type: "text",
      content: "Alpha setup notes.\n\nBeta retrieval notes explain vector search.",
      query: "What explains vector search?",
      title: "RAG Harness Test",
      documentId: "rag-test-doc",
      topK: 1,
    });
  });

  it("creates RAG test cases with overrides", () => {
    const testCase = makeRagTestCase({
      content: "Custom content",
      query: "Custom query",
      title: "Custom title",
      documentId: "custom-doc",
      topK: 3,
    });

    expect(testCase).toEqual({
      type: "text",
      content: "Custom content",
      query: "Custom query",
      title: "Custom title",
      documentId: "custom-doc",
      topK: 3,
    });
  });
});
