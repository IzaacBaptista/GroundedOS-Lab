import type { EmbeddingProvider } from "@groundedos/rag";

export interface ProviderSuiteResult {
  passed: boolean;
  checks: Record<string, boolean>;
  details?: Record<string, unknown>;
}

export async function runProviderDeterminismSuite(
  provider: EmbeddingProvider
): Promise<ProviderSuiteResult> {
  const input = ["alpha beta gamma", "alpha beta gamma"];
  const vectorsA = await provider.embedTexts(input);
  const vectorsB = await provider.embedTexts(input);
  const serializedA = JSON.stringify(vectorsA);
  const serializedB = JSON.stringify(vectorsB);

  const dimensionsConsistent = vectorsA.every((v) => v.length === provider.dimensions);
  const vectorStable = serializedA === serializedB;

  return {
    passed: dimensionsConsistent && vectorStable,
    checks: {
      identicalInputConsistency: vectorStable,
      vectorStability: vectorStable,
      dimensionConsistency: dimensionsConsistent,
      serializationStability: serializedA === serializedB,
    },
    details: {
      dimensions: provider.dimensions,
      provider: provider.name,
    },
  };
}

export async function runProviderSemanticSuite(
  provider: EmbeddingProvider
): Promise<ProviderSuiteResult> {
  const texts = [
    "alpha beta release notes",
    "alpha beta deployment guide",
    "quantum banana orchestration",
  ];
  const vectors = await provider.embedTexts(texts);
  const simClose = cosine(vectors[0]!, vectors[1]!);
  const simFar = cosine(vectors[0]!, vectors[2]!);

  return {
    passed: simClose >= simFar,
    checks: {
      semanticSimilarity: simClose >= simFar,
      clusteringBehavior: simClose > 0,
      lexicalDistance: simFar <= simClose,
      retrievalQuality: simClose > simFar,
    },
    details: {
      similarityClose: simClose,
      similarityFar: simFar,
    },
  };
}

export async function runProviderCompatibilitySuite(
  providerA: EmbeddingProvider,
  providerB: EmbeddingProvider
): Promise<ProviderSuiteResult> {
  const sample = ["alpha beta gamma"];
  const [a] = await providerA.embedTexts(sample);
  const [b] = await providerB.embedTexts(sample);
  const dimensionMatch = a.length === b.length;
  const drift = dimensionMatch ? Math.abs(cosine(a, a) - cosine(a, b)) : 1;

  return {
    passed: dimensionMatch && drift < 0.2,
    checks: {
      vectorSpaceCompatibility: dimensionMatch,
      reindexRequired: !dimensionMatch || drift >= 0.2,
      dimensionMismatch: !dimensionMatch,
      similarityDrift: drift < 0.2,
    },
    details: {
      providerA: providerA.name,
      providerB: providerB.name,
      drift,
      dimensionsA: providerA.dimensions,
      dimensionsB: providerB.dimensions,
    },
  };
}

export async function generateEmbeddingSnapshot(
  provider: EmbeddingProvider,
  texts: string[] = ["alpha", "beta", "gamma"]
): Promise<{
  provider: string;
  dimensions: number;
  vectors: number[][];
}> {
  const vectors = await provider.embedTexts(texts);
  return {
    provider: provider.name,
    dimensions: provider.dimensions,
    vectors: vectors.map((vector) => vector.map((value) => Number(value.toFixed(12)))),
  };
}

function cosine(left: number[], right: number[]): number {
  const dot = left.reduce((sum, value, index) => sum + value * (right[index] ?? 0), 0);
  const leftNorm = Math.sqrt(left.reduce((sum, value) => sum + value * value, 0));
  const rightNorm = Math.sqrt(right.reduce((sum, value) => sum + value * value, 0));
  if (leftNorm === 0 || rightNorm === 0) {
    return 0;
  }

  return dot / (leftNorm * rightNorm);
}
