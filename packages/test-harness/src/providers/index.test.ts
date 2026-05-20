import { describe, expect, it } from "vitest";
import type { EmbeddingProvider } from "@groundedos/rag";
import {
  assertDeterministicEmbedding,
  assertEmbeddingVector,
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
});
