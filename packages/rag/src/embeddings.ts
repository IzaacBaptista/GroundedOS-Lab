import type { RetrievalChunk } from "./chunking";

const ERROR_PREFIX = "[rag/embeddings]";
const DEFAULT_DETERMINISTIC_DIMENSIONS = 16;
const DEFAULT_DETERMINISTIC_PROVIDER_NAME = "deterministic-local";
const DEFAULT_LOCAL_HASH_DIMENSIONS = 256;
const DEFAULT_LOCAL_HASH_MODEL = "local-hash-v1";
const DEFAULT_LOCAL_HASH_MAX_INPUT_CHARS = 12_000;

export type EmbeddingVector = number[];

export type EmbeddingProviderId = "local-hash" | "api-lexical" | "semantic-placeholder";

export interface EmbeddingModelInfo {
  provider: EmbeddingProviderId;
  model: string;
  dimensions: number;
  normalized: boolean;
  maxInputChars?: number;
}

export interface EmbedTextInput {
  id?: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface EmbedTextResult {
  vector: EmbeddingVector;
  model: EmbeddingModelInfo;
  usage?: {
    inputTokens?: number;
    estimatedChars?: number;
  };
}

export interface SemanticEmbeddingsProvider {
  readonly id: EmbeddingProviderId;
  getModelInfo(): EmbeddingModelInfo;
  embedOne(input: EmbedTextInput): Promise<EmbedTextResult>;
  embedMany(inputs: EmbedTextInput[]): Promise<EmbedTextResult[]>;
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  readonly modelInfo?: EmbeddingModelInfo;
  embedTexts(texts: string[]): Promise<EmbeddingVector[]>;
}

export interface EmbeddedChunk extends RetrievalChunk {
  embedding: EmbeddingVector;
  embeddingMetadata: {
    provider: string;
    dimensions: number;
    model?: string;
    normalized?: boolean;
  };
}

export interface DeterministicEmbeddingProviderOptions {
  name?: string;
  dimensions?: number;
}

export interface LocalHashEmbeddingsProviderOptions {
  dimensions?: number;
  model?: string;
  maxInputChars?: number;
}

export interface EmbeddingProviderRegistry {
  get(providerId: EmbeddingProviderId): SemanticEmbeddingsProvider;
  list(): EmbeddingModelInfo[];
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
      model: provider.modelInfo?.model,
      normalized: provider.modelInfo?.normalized,
    },
  }));
}

export class LocalHashEmbeddingsProvider implements SemanticEmbeddingsProvider {
  readonly id = "local-hash" as const;
  private readonly dimensions: number;
  private readonly model: string;
  private readonly maxInputChars: number;

  constructor(options: LocalHashEmbeddingsProviderOptions = {}) {
    this.dimensions = options.dimensions ?? DEFAULT_LOCAL_HASH_DIMENSIONS;
    this.model = options.model ?? DEFAULT_LOCAL_HASH_MODEL;
    this.maxInputChars = options.maxInputChars ?? DEFAULT_LOCAL_HASH_MAX_INPUT_CHARS;

    validateDimensions(this.dimensions);

    if (this.model.trim().length === 0) {
      throw new Error(`${ERROR_PREFIX} model name must not be empty.`);
    }

    if (!Number.isInteger(this.maxInputChars) || this.maxInputChars <= 0) {
      throw new Error(`${ERROR_PREFIX} maxInputChars must be a positive integer.`);
    }
  }

  getModelInfo(): EmbeddingModelInfo {
    return {
      provider: this.id,
      model: this.model,
      dimensions: this.dimensions,
      normalized: true,
      maxInputChars: this.maxInputChars,
    };
  }

  async embedOne(input: EmbedTextInput): Promise<EmbedTextResult> {
    if (!input || typeof input.text !== "string") {
      throw new Error(`${ERROR_PREFIX} embed input text must be a string.`);
    }

    const text = input.text.slice(0, this.maxInputChars);
    const tokens = tokenizeForLocalHash(text);

    return {
      vector: createLocalHashEmbedding(tokens, this.dimensions),
      model: this.getModelInfo(),
      usage: {
        inputTokens: tokens.length,
        estimatedChars: input.text.length,
      },
    };
  }

  async embedMany(inputs: EmbedTextInput[]): Promise<EmbedTextResult[]> {
    if (!Array.isArray(inputs)) {
      throw new Error(`${ERROR_PREFIX} embedMany inputs must be an array.`);
    }

    return await Promise.all(inputs.map((input) => this.embedOne(input)));
  }
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

export function semanticToEmbeddingProvider(
  provider: SemanticEmbeddingsProvider
): EmbeddingProvider {
  if (!provider || typeof provider.getModelInfo !== "function") {
    throw new Error(`${ERROR_PREFIX} semantic provider is required.`);
  }

  const modelInfo = provider.getModelInfo();
  validateModelInfo(modelInfo);

  return {
    name: modelInfo.provider,
    dimensions: modelInfo.dimensions,
    modelInfo,
    async embedTexts(texts: string[]): Promise<EmbeddingVector[]> {
      if (!Array.isArray(texts)) {
        throw new Error(`${ERROR_PREFIX} embedTexts expects an array of strings.`);
      }

      const results = await provider.embedMany(texts.map((text) => ({ text })));

      return results.map((result) => result.vector);
    },
  };
}

export function embeddingProviderToSemantic(
  provider: EmbeddingProvider,
  modelInfo?: Partial<EmbeddingModelInfo>
): SemanticEmbeddingsProvider {
  validateProvider(provider);

  const providerModelInfo = provider.modelInfo;
  const resolvedModelInfo: EmbeddingModelInfo = {
    provider:
      modelInfo?.provider ?? providerModelInfo?.provider ?? toEmbeddingProviderId(provider.name),
    model: modelInfo?.model ?? providerModelInfo?.model ?? provider.name,
    dimensions: modelInfo?.dimensions ?? providerModelInfo?.dimensions ?? provider.dimensions,
    normalized: modelInfo?.normalized ?? providerModelInfo?.normalized ?? false,
    maxInputChars: modelInfo?.maxInputChars ?? providerModelInfo?.maxInputChars,
  };

  validateModelInfo(resolvedModelInfo);

  return {
    id: resolvedModelInfo.provider,
    getModelInfo() {
      return resolvedModelInfo;
    },
    async embedOne(input: EmbedTextInput): Promise<EmbedTextResult> {
      if (!input || typeof input.text !== "string") {
        throw new Error(`${ERROR_PREFIX} embed input text must be a string.`);
      }

      const embeddings = await provider.embedTexts([input.text]);
      const [vector] = embeddings;

      if (!Array.isArray(vector) || vector.length !== resolvedModelInfo.dimensions) {
        throw new Error(
          `${ERROR_PREFIX} provider returned an invalid embedding for one input.`
        );
      }

      return {
        vector,
        model: resolvedModelInfo,
        usage: {
          estimatedChars: input.text.length,
        },
      };
    },
    async embedMany(inputs: EmbedTextInput[]): Promise<EmbedTextResult[]> {
      if (!Array.isArray(inputs)) {
        throw new Error(`${ERROR_PREFIX} embedMany inputs must be an array.`);
      }

      const vectors = await provider.embedTexts(inputs.map((input) => input.text));

      validateEmbeddings(vectors, inputs.length, {
        name: provider.name,
        dimensions: resolvedModelInfo.dimensions,
        embedTexts: provider.embedTexts.bind(provider),
      });

      return vectors.map((vector, index) => ({
        vector,
        model: resolvedModelInfo,
        usage: {
          estimatedChars: inputs[index]?.text.length ?? 0,
        },
      }));
    },
  };
}

export function createEmbeddingProviderRegistry(
  providers: SemanticEmbeddingsProvider[] = [new LocalHashEmbeddingsProvider()]
): EmbeddingProviderRegistry {
  const providersById = new Map<EmbeddingProviderId, SemanticEmbeddingsProvider>();

  for (const provider of providers) {
    if (!provider || typeof provider.getModelInfo !== "function") {
      throw new Error(`${ERROR_PREFIX} semantic provider is required.`);
    }

    if (providersById.has(provider.id)) {
      throw new Error(`${ERROR_PREFIX} duplicate embedding provider "${provider.id}".`);
    }

    validateModelInfo(provider.getModelInfo());
    providersById.set(provider.id, provider);
  }

  return {
    get(providerId: EmbeddingProviderId) {
      const provider = providersById.get(providerId);

      if (!provider) {
        throw new Error(`${ERROR_PREFIX} unknown embedding provider "${providerId}".`);
      }

      return provider;
    },
    list() {
      return Array.from(providersById.values()).map((provider) => provider.getModelInfo());
    },
  };
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

function validateModelInfo(modelInfo: EmbeddingModelInfo): void {
  if (!modelInfo || typeof modelInfo !== "object") {
    throw new Error(`${ERROR_PREFIX} embedding model info is required.`);
  }

  if (!isEmbeddingProviderId(modelInfo.provider)) {
    throw new Error(`${ERROR_PREFIX} embedding model provider is not supported.`);
  }

  if (typeof modelInfo.model !== "string" || modelInfo.model.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} embedding model name must not be empty.`);
  }

  validateDimensions(modelInfo.dimensions);

  if (typeof modelInfo.normalized !== "boolean") {
    throw new Error(`${ERROR_PREFIX} embedding model normalized flag must be boolean.`);
  }

  if (
    modelInfo.maxInputChars !== undefined &&
    (!Number.isInteger(modelInfo.maxInputChars) || modelInfo.maxInputChars <= 0)
  ) {
    throw new Error(`${ERROR_PREFIX} maxInputChars must be a positive integer.`);
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

function createLocalHashEmbedding(tokens: string[], dimensions: number): EmbeddingVector {
  const vector = Array.from({ length: dimensions }, () => 0);

  if (tokens.length === 0) {
    return vector;
  }

  for (const feature of createLocalHashFeatures(tokens)) {
    const hash = hashString(feature.value);
    const bucket = hash % dimensions;
    const sign = hashString(`sign:${feature.value}`) % 2 === 0 ? 1 : -1;

    vector[bucket] += feature.weight * sign;
  }

  return normalizeVector(vector);
}

function createLocalHashFeatures(tokens: string[]): Array<{ value: string; weight: number }> {
  const features = tokens.map((token) => ({
    value: `token:${token}`,
    weight: 1,
  }));

  for (let index = 0; index < tokens.length - 1; index += 1) {
    features.push({
      value: `bigram:${tokens[index]}:${tokens[index + 1]}`,
      weight: 0.75,
    });
  }

  return features;
}

function tokenizeForLocalHash(text: string): string[] {
  return (text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .map(stemLocalHashToken)
    .filter((token) => token.length > 0);
}

function stemLocalHashToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.length > 4 && token.endsWith("es")) {
    return token.slice(0, -2);
  }

  if (token.length > 3 && token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function normalizeVector(vector: EmbeddingVector): EmbeddingVector {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0)
  );

  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(12)));
}

function hashString(value: string): number {
  let hash = 2_166_136_261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return hash >>> 0;
}

function toEmbeddingProviderId(providerName: string): EmbeddingProviderId {
  return isEmbeddingProviderId(providerName) ? providerName : "semantic-placeholder";
}

function isEmbeddingProviderId(value: string): value is EmbeddingProviderId {
  return value === "local-hash" || value === "api-lexical" || value === "semantic-placeholder";
}
