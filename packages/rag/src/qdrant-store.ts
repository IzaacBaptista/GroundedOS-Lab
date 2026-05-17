import type { EmbeddedChunk, EmbeddingVector } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import type {
  VectorMetadataFilter,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/qdrant-store]";
const DEFAULT_TOP_K = 5;
const DEFAULT_TIMEOUT_MS = 5_000;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface QdrantSearchPoint {
  id: string | number;
  score: number;
  payload?: Record<string, JsonValue>;
}

interface QdrantResultEnvelope<T> {
  status: string;
  result: T;
}

export interface QdrantStoreOptions {
  baseUrl: string;
  collectionName: string;
  apiKey?: string;
  defaultTopK?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  mirrorStore?: VectorStore;
}

export class QdrantVectorStore implements VectorStore {
  private readonly baseUrl: string;
  private readonly collectionName: string;
  private readonly apiKey?: string;
  private readonly defaultTopK: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly mirrorStore: VectorStore;
  private dimensions?: number;
  private collectionInitialized = false;

  constructor(options: QdrantStoreOptions) {
    const baseUrl = options.baseUrl?.trim();
    const collectionName = options.collectionName?.trim();

    if (!baseUrl) {
      throw new Error(`${ERROR_PREFIX} baseUrl must not be empty.`);
    }

    if (!collectionName) {
      throw new Error(`${ERROR_PREFIX} collectionName must not be empty.`);
    }

    this.baseUrl = trimTrailingSlashes(baseUrl);
    this.collectionName = collectionName;
    this.apiKey = options.apiKey;
    this.defaultTopK = options.defaultTopK ?? DEFAULT_TOP_K;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.mirrorStore = options.mirrorStore ?? new InMemoryVectorStore();
  }

  get size(): number {
    return this.mirrorStore.size;
  }

  insert(chunks: EmbeddedChunk[]): void {
    this.mirrorStore.insert(chunks);
    void this.upsertAsync(chunks).catch((error) => {
      console.warn(`${ERROR_PREFIX} qdrant upsert failed; using mirror store only.`, error);
    });
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    return this.mirrorStore.search(query);
  }

  async searchAsync(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const fallback = this.mirrorStore.search(query);
    const topK = query.topK ?? this.defaultTopK;

    try {
      await this.ensureCollection(query.embedding.length);
      const envelope = await this.request<QdrantResultEnvelope<QdrantSearchPoint[]>>(
        "POST",
        `/collections/${encodeURIComponent(this.collectionName)}/points/search`,
        {
          vector: query.embedding,
          limit: topK,
          with_payload: true,
          filter: this.toQdrantFilter(query.filter),
        }
      );

      if (!Array.isArray(envelope.result)) {
        return fallback;
      }

      const results = envelope.result
        .map((point) => this.toSearchResult(point))
        .filter((result): result is VectorSearchResult => result !== null);

      return results.length > 0 ? results : fallback;
    } catch (error) {
      console.warn(`${ERROR_PREFIX} qdrant search failed; using mirror store fallback.`, error);
      return fallback;
    }
  }

  clear(): void {
    this.mirrorStore.clear();
    this.collectionInitialized = false;

    void this.request("DELETE", `/collections/${encodeURIComponent(this.collectionName)}`).catch(
      (error) => {
        console.warn(`${ERROR_PREFIX} qdrant clear failed.`, error);
      }
    );
  }

  private async upsertAsync(chunks: EmbeddedChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    await this.ensureCollection(chunks[0]?.embedding.length ?? 0);
    await this.request("PUT", `/collections/${encodeURIComponent(this.collectionName)}/points`, {
      points: chunks.map((chunk) => ({
        id: chunk.id,
        vector: chunk.embedding,
        payload: buildChunkPayload(chunk),
      })),
    });
  }

  private async ensureCollection(dimensions: number): Promise<void> {
    if (!Number.isInteger(dimensions) || dimensions <= 0) {
      throw new Error(`${ERROR_PREFIX} dimensions must be a positive integer.`);
    }

    if (this.dimensions !== undefined && this.dimensions !== dimensions) {
      throw new Error(
        `${ERROR_PREFIX} dimension mismatch. Existing collection has ${this.dimensions}, received ${dimensions}.`
      );
    }

    if (this.collectionInitialized) {
      return;
    }

    await this.request("PUT", `/collections/${encodeURIComponent(this.collectionName)}`, {
      vectors: {
        size: dimensions,
        distance: "Cosine",
      },
    });

    this.dimensions = dimensions;
    this.collectionInitialized = true;
  }

  private async request<T = unknown>(
    method: "PUT" | "POST" | "DELETE",
    path: string,
    body?: unknown
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(this.apiKey ? { "api-key": this.apiKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
          `${ERROR_PREFIX} qdrant request failed (${response.status}): ${responseBody.slice(0, 500)}`
        );
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private toSearchResult(point: QdrantSearchPoint): VectorSearchResult | null {
    if (!Number.isFinite(point.score)) {
      return null;
    }

    const id = typeof point.id === "string" ? point.id : String(point.id);
    const payload = point.payload ?? {};
    const chunk = this.toChunk(id, payload);

    return {
      chunk,
      score: point.score,
    };
  }

  private toChunk(id: string, payload: Record<string, JsonValue>): EmbeddedChunk {
    const metadata = toRecord(payload.metadata);
    const embeddingMetadata = toRecord(payload.embeddingMetadata);
    const embedding = toNumberArray(payload.embedding);

    return {
      id,
      documentId: toString(payload.documentId),
      sectionId: toString(payload.sectionId),
      startOffset: toNumber(payload.startOffset),
      endOffset: toNumber(payload.endOffset),
      text: toString(payload.text),
      metadata: {
        documentTitle: toString(metadata.documentTitle),
        modality: toString(metadata.modality) as EmbeddedChunk["metadata"]["modality"],
        sourceType: toString(metadata.sourceType) as EmbeddedChunk["metadata"]["sourceType"],
        sectionHeading: optionalString(metadata.sectionHeading),
        page: optionalNumber(metadata.page),
        originalFilename: optionalString(metadata.originalFilename),
        chunkIndex: toNumber(metadata.chunkIndex),
        sectionChunkIndex: toNumber(metadata.sectionChunkIndex),
        offsetBasis:
          (optionalString(metadata.offsetBasis) as EmbeddedChunk["metadata"]["offsetBasis"]) ??
          "document",
      },
      embeddingMetadata: {
        provider: toString(embeddingMetadata.provider),
        model: optionalString(embeddingMetadata.model),
        dimensions: toNumber(embeddingMetadata.dimensions),
        normalized:
          typeof embeddingMetadata.normalized === "boolean"
            ? embeddingMetadata.normalized
            : undefined,
      },
      embedding,
    };
  }

  private toQdrantFilter(filter: VectorMetadataFilter | undefined): Record<string, unknown> | undefined {
    if (!filter) {
      return undefined;
    }

    const must = Object.entries(filter)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({
        key,
        match: {
          value,
        },
      }));

    return must.length > 0 ? { must } : undefined;
  }
}

function buildChunkPayload(chunk: EmbeddedChunk): Record<string, JsonValue> {
  return {
    documentId: chunk.documentId,
    sectionId: chunk.sectionId,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    text: chunk.text,
    metadata: chunk.metadata as unknown as Record<string, JsonValue>,
    embeddingMetadata: chunk.embeddingMetadata as unknown as Record<string, JsonValue>,
    embedding: chunk.embedding,
  };
}

function toRecord(value: JsonValue | undefined): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, JsonValue>;
}

function toString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toNumber(value: JsonValue | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toNumberArray(value: JsonValue | undefined): EmbeddingVector {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function trimTrailingSlashes(value: string): string {
  let index = value.length;
  while (index > 0 && value[index - 1] === "/") {
    index -= 1;
  }

  return value.slice(0, index);
}
