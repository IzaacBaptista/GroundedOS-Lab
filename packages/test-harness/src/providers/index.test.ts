import { describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "@groundedos/rag";
import {
  assertDeterministicEmbedding,
  assertEmbeddingVector,
  makeProviderTestCase,
  runProviderCompatibilitySuite,
} from "./index";

const provider: EmbeddingProvider = {
  name: "test-provider",
  dimensions: 3,
  async embedTexts(texts) {
    return texts.map((text) => [text.length, 1, 0]);
  },
};

describe("provider harness helpers", () => {
  it("validates embedding vectors", () => {
    expect(() => assertEmbeddingVector([1, 2, 3], { expectedDimensions: 3 })).not.toThrow();
    expect(() => assertEmbeddingVector([1, Number.NaN], { expectedDimensions: 2 })).toThrow();
  });

  it("asserts deterministic embeddings", async () => {
    await expect(assertDeterministicEmbedding(provider, "alpha")).resolves.toEqual([5, 1, 0]);
  });

  it("runs compatibility suite with deterministic checks", async () => {
    const result = await runProviderCompatibilitySuite(provider);
    expect(result.passed).toBe(true);
    expect(result.checks.metadataValid).toBe(true);
    expect(result.checks.deterministic).toBe(true);
  });

  it("creates provider test case with defaults", () => {
    const testCase = makeProviderTestCase(provider);
    expect(testCase.caseId).toBe("provider-case:test-provider");
    expect(testCase.sampleTexts).toEqual(["alpha beta gamma"]);
    expect(testCase.expectedDimensions).toBe(3);
    expect(testCase.providerA).toBe(provider);
    expect(testCase.providerB).toBeUndefined();
  });

  it("creates provider test case with overrides", () => {
    const providerB: EmbeddingProvider = {
      name: "second-provider",
      dimensions: 3,
      async embedTexts(texts) {
        return texts.map((text) => [text.length, 0, 1]);
      },
    };
    const testCase = makeProviderTestCase(provider, {
      caseId: "custom-case",
      sampleTexts: ["hello", "world"],
      expectedDimensions: 99,
      providerB,
    });
    expect(testCase.caseId).toBe("custom-case");
    expect(testCase.sampleTexts).toEqual(["hello", "world"]);
    expect(testCase.expectedDimensions).toBe(99);
    expect(testCase.providerB).toBe(providerB);
  });
});
