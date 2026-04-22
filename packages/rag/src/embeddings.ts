import type { RetrievalChunk } from "./chunking";

const ERROR_PREFIX = "[rag/embeddings]";
const DEFAULT_DETERMINISTIC_DIMENSIONS = 16;
const DEFAULT_DETERMINISTIC_PROVIDER_NAME = "deterministic-local";

export type EmbeddingVector = number[];

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embedTexts(texts: string[]): Promise<EmbeddingVector[]>;
}

export interface EmbeddedChunk extends RetrievalChunk {
  embedding: EmbeddingVector;
  embeddingMetadata: {
    provider: string;
    dimensions: number;
  };
}

export interface DeterministicEmbeddingProviderOptions {
  name?: string;
  dimensions?: number;
}

export async function embedChunks(
  chunks: RetrievalChunk[],
  provider: EmbeddingProvider
): Promise<EmbeddedChunk[]> {
  validateProvider(provider);

  if (chunks.length === 0) {
    return [];
  }

  const embeddings = await provider.embedTexts(chunks.map((chunk) => chunk.text));
  validateEmbeddings(embeddings, chunks.length, provider);

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index] as EmbeddingVector,
    embeddingMetadata: {
      provider: provider.name,
      dimensions: provider.dimensions,
    },
  }));
}

export class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;

  constructor(options: DeterministicEmbeddingProviderOptions = {}) {
    this.name = options.name ?? DEFAULT_DETERMINISTIC_PROVIDER_NAME;
    this.dimensions = options.dimensions ?? DEFAULT_DETERMINISTIC_DIMENSIONS;

    if (this.name.trim().length === 0) {
      throw new Error(`${ERROR_PREFIX} provider name must not be empty.`);
    }

    validateDimensions(this.dimensions);
  }

  async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
    return texts.map((text) => createDeterministicEmbedding(text, this.dimensions));
  }
}

function validateProvider(provider: EmbeddingProvider): void {
  if (!provider) {
    throw new Error(`${ERROR_PREFIX} provider is required.`);
  }

  if (typeof provider.name !== "string" || provider.name.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} provider name must not be empty.`);
  }

  validateDimensions(provider.dimensions);

  if (typeof provider.embedTexts !== "function") {
    throw new Error(`${ERROR_PREFIX} provider must implement embedTexts(texts).`);
  }
}

function validateDimensions(dimensions: number): void {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error(`${ERROR_PREFIX} dimensions must be a positive integer.`);
  }
}

function validateEmbeddings(
  embeddings: EmbeddingVector[],
  expectedCount: number,
  provider: EmbeddingProvider
): void {
  if (!Array.isArray(embeddings)) {
    throw new Error(`${ERROR_PREFIX} provider must return an array of embeddings.`);
  }

  if (embeddings.length !== expectedCount) {
    throw new Error(
      `${ERROR_PREFIX} provider returned ${embeddings.length} embeddings for ${expectedCount} chunks.`
    );
  }

  embeddings.forEach((embedding, index) => {
    if (!Array.isArray(embedding)) {
      throw new Error(`${ERROR_PREFIX} embedding at index ${index} must be an array.`);
    }

    if (embedding.length !== provider.dimensions) {
      throw new Error(
        `${ERROR_PREFIX} embedding at index ${index} has ${embedding.length} dimensions; expected ${provider.dimensions}.`
      );
    }

    if (embedding.some((value) => !Number.isFinite(value))) {
      throw new Error(`${ERROR_PREFIX} embedding at index ${index} contains a non-finite value.`);
    }
  });
}

function createDeterministicEmbedding(text: string, dimensions: number): EmbeddingVector {
  const vector = Array.from({ length: dimensions }, () => 0);
  const normalizedText = text.normalize("NFKC").toLowerCase();

  if (normalizedText.trim().length === 0) {
    return vector;
  }

  for (let index = 0; index < normalizedText.length; index += 1) {
    const charCode = normalizedText.charCodeAt(index);
    const bucket = (charCode + index * 31) % dimensions;
    const weight = ((charCode % 37) + 1) / 37;

    vector[bucket] += weight;
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(12)));
}
