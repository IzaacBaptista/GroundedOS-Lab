import type { EmbeddedChunk, EmbeddingVector, SimilarityMetric } from "./embeddings";

const ERROR_PREFIX = "[rag/vector-store]";
const DEFAULT_TOP_K = 5;

export type VectorMetadataFilter = Record<
  string,
  string | number | boolean | undefined
>;

export interface VectorSearchQuery {
  embedding: EmbeddingVector;
  topK?: number;
  filter?: VectorMetadataFilter;
  /**
   * Book cap. 16: a minimum-similarity cutoff. Unlike `topK` (always
   * returns up to k results, however weak), `minScore` excludes chunks
   * whose score falls below it — fewer than `topK` results (even zero) if
   * the corpus doesn't have anything similar enough.
   */
  minScore?: number;
}

export interface VectorSearchResult {
  chunk: EmbeddedChunk;
  score: number;
}

export interface VectorStore {
  readonly size: number;
  insert(chunks: EmbeddedChunk[]): void;
  search(query: VectorSearchQuery): VectorSearchResult[];
  clear(): void;
}

export class InMemoryVectorStore implements VectorStore {
  private readonly chunksById = new Map<string, EmbeddedChunk>();
  private dimensions?: number;
  private metric?: SimilarityMetric;

  get size(): number {
    return this.chunksById.size;
  }

  insert(chunks: EmbeddedChunk[]): void {
    if (!Array.isArray(chunks)) {
      throw new Error(`${ERROR_PREFIX} insert expects an array of embedded chunks.`);
    }

    let nextDimensions = this.dimensions;
    let nextMetric = this.metric;

    for (const chunk of chunks) {
      nextDimensions = this.validateChunk(chunk, nextDimensions);
      nextMetric = this.validateMetric(chunk, nextMetric);
    }

    this.dimensions = nextDimensions;
    this.metric = nextMetric;

    for (const chunk of chunks) {
      this.chunksById.set(chunk.id, chunk);
    }
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    if (!query) {
      throw new Error(`${ERROR_PREFIX} search query is required.`);
    }

    const topK = query.topK ?? DEFAULT_TOP_K;
    validateVector(query.embedding, "query embedding");
    validateTopK(topK);

    if (query.minScore !== undefined && !Number.isFinite(query.minScore)) {
      throw new Error(`${ERROR_PREFIX} minScore must be a finite number.`);
    }

    if (this.dimensions !== undefined && query.embedding.length !== this.dimensions) {
      throw new Error(
        `${ERROR_PREFIX} query embedding has ${query.embedding.length} dimensions; expected ${this.dimensions}.`
      );
    }

    const scoreFn = scoreFunctionFor(this.metric ?? "cosine");

    return Array.from(this.chunksById.values())
      .filter((chunk) => matchesFilter(chunk, query.filter))
      .map((chunk) => ({
        chunk,
        score: scoreFn(query.embedding, chunk.embedding),
      }))
      .filter((result) => query.minScore === undefined || result.score >= query.minScore)
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        return left.chunk.id.localeCompare(right.chunk.id);
      })
      .slice(0, topK);
  }

  clear(): void {
    this.chunksById.clear();
    this.dimensions = undefined;
  }

  private validateChunk(
    chunk: EmbeddedChunk,
    expectedDimensions: number | undefined
  ): number {
    if (!chunk || typeof chunk.id !== "string" || chunk.id.trim().length === 0) {
      throw new Error(`${ERROR_PREFIX} chunk id must not be empty.`);
    }

    validateVector(chunk.embedding, `embedding for chunk "${chunk.id}"`);

    if (chunk.embedding.length !== chunk.embeddingMetadata.dimensions) {
      throw new Error(
        `${ERROR_PREFIX} chunk "${chunk.id}" embedding has ${chunk.embedding.length} dimensions; expected ${chunk.embeddingMetadata.dimensions}.`
      );
    }

    if (expectedDimensions === undefined) {
      return chunk.embedding.length;
    }

    if (chunk.embedding.length !== expectedDimensions) {
      throw new Error(
        `${ERROR_PREFIX} chunk "${chunk.id}" embedding has ${chunk.embedding.length} dimensions; expected ${expectedDimensions}.`
      );
    }

    return expectedDimensions;
  }

  private validateMetric(
    chunk: EmbeddedChunk,
    expectedMetric: SimilarityMetric | undefined
  ): SimilarityMetric {
    const chunkMetric = chunk.embeddingMetadata.similarityMetric ?? "cosine";

    if (expectedMetric !== undefined && chunkMetric !== expectedMetric) {
      throw new Error(
        `${ERROR_PREFIX} chunk "${chunk.id}" declares similarity metric "${chunkMetric}"; ` +
          `store already holds embeddings using "${expectedMetric}". Mixing metrics in one store ` +
          `produces meaningless scores — use separate stores per metric.`
      );
    }

    return chunkMetric;
  }
}

function validateVector(vector: EmbeddingVector, label: string): void {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`${ERROR_PREFIX} ${label} must be a non-empty vector.`);
  }

  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`${ERROR_PREFIX} ${label} contains a non-finite value.`);
  }
}

function validateTopK(topK: number): void {
  if (!Number.isInteger(topK) || topK <= 0) {
    throw new Error(`${ERROR_PREFIX} topK must be a positive integer.`);
  }
}

function cosineSimilarity(left: EmbeddingVector, right: EmbeddingVector): number {
  let dotProduct = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    dotProduct += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

/**
 * Book cap. 11: dot product is magnitude-sensitive, unlike cosine — a
 * longer vector in the same direction scores higher.
 */
function dotProductScore(left: EmbeddingVector, right: EmbeddingVector): number {
  let dotProduct = 0;

  for (let index = 0; index < left.length; index += 1) {
    dotProduct += (left[index] ?? 0) * (right[index] ?? 0);
  }

  return dotProduct;
}

/**
 * Book cap. 11: Euclidean distance is smaller for more similar vectors —
 * the opposite direction of cosine/dot product. Transformed into a score
 * (higher = more similar) via `1 / (1 + distance)` so every metric shares
 * the same "higher score wins" sort used by `search()`; the transform is
 * monotonic, so ranking is identical to sorting by raw distance ascending.
 */
function euclideanScore(left: EmbeddingVector, right: EmbeddingVector): number {
  let sumSquaredDiff = 0;

  for (let index = 0; index < left.length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    sumSquaredDiff += diff * diff;
  }

  return 1 / (1 + Math.sqrt(sumSquaredDiff));
}

function scoreFunctionFor(
  metric: SimilarityMetric
): (left: EmbeddingVector, right: EmbeddingVector) => number {
  switch (metric) {
    case "dotProduct":
      return dotProductScore;
    case "euclidean":
      return euclideanScore;
    case "cosine":
    default:
      return cosineSimilarity;
  }
}

function matchesFilter(
  chunk: EmbeddedChunk,
  filter: VectorMetadataFilter | undefined
): boolean {
  if (!filter) {
    return true;
  }

  const searchable = buildSearchableMetadata(chunk);

  return Object.entries(filter).every(([key, expectedValue]) => {
    if (expectedValue === undefined) {
      return true;
    }

    const actual = searchable[key];

    if (Array.isArray(actual)) {
      // Cap. 9: `tags`/`permissions` are arrays on the chunk. An empty or
      // unset array (e.g. `permissions`) means "no restriction" — visible
      // to any filter value, matching the book's principle that filtering
      // must run before ranking, not as a post-hoc discard.
      return (
        actual.length === 0 ||
        (typeof expectedValue === "string" && actual.includes(expectedValue))
      );
    }

    return actual === expectedValue;
  });
}

function buildSearchableMetadata(
  chunk: EmbeddedChunk
): Record<string, string | number | boolean | string[] | undefined> {
  return {
    id: chunk.id,
    documentId: chunk.documentId,
    sectionId: chunk.sectionId,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    documentTitle: chunk.metadata.documentTitle,
    modality: chunk.metadata.modality,
    sectionHeading: chunk.metadata.sectionHeading,
    page: chunk.metadata.page,
    sourceType: chunk.metadata.sourceType,
    originalFilename: chunk.metadata.originalFilename,
    chunkIndex: chunk.metadata.chunkIndex,
    sectionChunkIndex: chunk.metadata.sectionChunkIndex,
    offsetBasis: chunk.metadata.offsetBasis,
    author: chunk.metadata.author,
    timestamp: chunk.metadata.timestamp,
    tags: chunk.metadata.tags ?? [],
    permissions: chunk.metadata.permissions ?? [],
    tenantId: chunk.metadata.tenantId,
    embeddingProvider: chunk.embeddingMetadata.provider,
    embeddingDimensions: chunk.embeddingMetadata.dimensions,
  };
}
