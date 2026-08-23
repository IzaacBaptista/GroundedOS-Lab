/**
 * PineconeVectorStore — a VectorStore implementation backed by Pinecone's
 * REST API (https://docs.pinecone.io/reference/api/data-plane).
 *
 * Book cap. 13: Pinecone is fully managed — there is no bootstrap/schema
 * step here beyond having an index already created with the right
 * dimensionality and metric. `namespace` maps directly onto Pinecone's own
 * namespace concept, which is exactly the "namespaces/tenants" isolation
 * primitive the chapter describes: vectors in one namespace are invisible
 * to queries scoped to another, inside the same physical index.
 *
 * Pinecone metadata only supports flat scalar/string-array values (no
 * nested objects) — `relationships` (an array of objects) is therefore
 * serialized to a JSON string field and parsed back on read; it is not
 * filterable via Pinecone metadata filters.
 */

import type { EmbeddedChunk, EmbeddingVector } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import type {
  VectorMetadataFilter,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/pinecone-store]";
const DEFAULT_TOP_K = 5;
const DEFAULT_TIMEOUT_MS = 5_000;

/** Book cap. 9: fields where an unset/absent value means "no restriction". */
const OPEN_ARRAY_METADATA_FIELDS = new Set(["tags", "permissions"]);

type PineconeMetadataValue = string | number | boolean | string[];

export interface PineconeStoreOptions {
  /** Index host, e.g. "https://my-index-abc123.svc.us-east1-gcp.pinecone.io". */
  baseUrl: string;
  apiKey: string;
  /** Book cap. 13 namespaces/tenants: isolates vectors within the same index. */
  namespace?: string;
  defaultTopK?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  mirrorStore?: VectorStore;
}

interface PineconeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export class PineconeVectorStore implements VectorStore {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly namespace: string | undefined;
  private readonly defaultTopK: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly mirrorStore: VectorStore;

  constructor(options: PineconeStoreOptions) {
    const baseUrl = options.baseUrl?.trim();
    const apiKey = options.apiKey?.trim();

    if (!baseUrl) {
      throw new Error(`${ERROR_PREFIX} baseUrl must not be empty.`);
    }

    if (!apiKey) {
      throw new Error(`${ERROR_PREFIX} apiKey must not be empty.`);
    }

    this.baseUrl = trimTrailingSlashes(baseUrl);
    this.apiKey = apiKey;
    this.namespace = options.namespace;
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
      console.warn(`${ERROR_PREFIX} pinecone upsert failed; using mirror store only.`, error);
    });
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    return this.mirrorStore.search(query);
  }

  async searchAsync(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const fallback = this.mirrorStore.search(query);
    const topK = query.topK ?? this.defaultTopK;

    try {
      const envelope = await this.request<{ matches?: PineconeMatch[] }>("/query", {
        vector: query.embedding,
        topK,
        includeMetadata: true,
        includeValues: false,
        filter: toPineconeFilter(query.filter),
        ...(this.namespace ? { namespace: this.namespace } : {}),
      });

      const matches = Array.isArray(envelope.matches) ? envelope.matches : [];
      const results = matches
        .map((match) => this.toSearchResult(match))
        .filter((result): result is VectorSearchResult => result !== null);

      return results.length > 0 ? results : fallback;
    } catch (error) {
      console.warn(`${ERROR_PREFIX} pinecone search failed; using mirror store fallback.`, error);
      return fallback;
    }
  }

  clear(): void {
    this.mirrorStore.clear();

    void this.request("/vectors/delete", {
      deleteAll: true,
      ...(this.namespace ? { namespace: this.namespace } : {}),
    }).catch((error) => {
      console.warn(`${ERROR_PREFIX} pinecone clear failed.`, error);
    });
  }

  private async upsertAsync(chunks: EmbeddedChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    await this.request("/vectors/upsert", {
      vectors: chunks.map((chunk) => ({
        id: chunk.id,
        values: chunk.embedding,
        metadata: buildPineconeMetadata(chunk),
      })),
      ...(this.namespace ? { namespace: this.namespace } : {}),
    });
  }

  private async request<T = unknown>(path: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Api-Key": this.apiKey,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
          `${ERROR_PREFIX} pinecone request failed (${response.status}): ${responseBody.slice(0, 500)}`
        );
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  private toSearchResult(match: PineconeMatch): VectorSearchResult | null {
    if (!Number.isFinite(match.score)) {
      return null;
    }

    return {
      chunk: metadataToChunk(match.id, match.metadata ?? {}),
      score: match.score,
    };
  }
}

function buildPineconeMetadata(chunk: EmbeddedChunk): Record<string, PineconeMetadataValue> {
  const metadata: Record<string, PineconeMetadataValue> = {
    documentId: chunk.documentId,
    sectionId: chunk.sectionId,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    text: chunk.text,
    documentTitle: chunk.metadata.documentTitle,
    modality: chunk.metadata.modality,
    sourceType: chunk.metadata.sourceType,
    chunkIndex: chunk.metadata.chunkIndex,
    sectionChunkIndex: chunk.metadata.sectionChunkIndex,
    offsetBasis: chunk.metadata.offsetBasis,
    embeddingProvider: chunk.embeddingMetadata.provider,
    embeddingDimensions: chunk.embeddingMetadata.dimensions,
  };

  setIfDefined(metadata, "sectionHeading", chunk.metadata.sectionHeading);
  setIfDefined(metadata, "page", chunk.metadata.page);
  setIfDefined(metadata, "originalFilename", chunk.metadata.originalFilename);
  setIfDefined(metadata, "author", chunk.metadata.author);
  setIfDefined(metadata, "timestamp", chunk.metadata.timestamp);
  setIfDefined(metadata, "tags", chunk.metadata.tags);
  setIfDefined(metadata, "permissions", chunk.metadata.permissions);
  setIfDefined(metadata, "tenantId", chunk.metadata.tenantId);
  setIfDefined(metadata, "embeddingModel", chunk.embeddingMetadata.model);
  setIfDefined(metadata, "embeddingNormalized", chunk.embeddingMetadata.normalized);
  setIfDefined(metadata, "embeddingSimilarityMetric", chunk.embeddingMetadata.similarityMetric);

  if (chunk.metadata.relationships) {
    metadata.relationshipsJson = JSON.stringify(chunk.metadata.relationships);
  }

  return metadata;
}

function setIfDefined(
  target: Record<string, PineconeMetadataValue>,
  key: string,
  value: PineconeMetadataValue | undefined
): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function metadataToChunk(id: string, metadata: Record<string, unknown>): EmbeddedChunk {
  return {
    id,
    documentId: String(metadata.documentId ?? ""),
    sectionId: String(metadata.sectionId ?? ""),
    startOffset: Number(metadata.startOffset ?? 0),
    endOffset: Number(metadata.endOffset ?? 0),
    text: String(metadata.text ?? ""),
    metadata: {
      documentTitle: String(metadata.documentTitle ?? ""),
      modality: metadata.modality as EmbeddedChunk["metadata"]["modality"],
      sourceType: metadata.sourceType as EmbeddedChunk["metadata"]["sourceType"],
      sectionHeading: metadata.sectionHeading as string | undefined,
      page: metadata.page as number | undefined,
      originalFilename: metadata.originalFilename as string | undefined,
      chunkIndex: Number(metadata.chunkIndex ?? 0),
      sectionChunkIndex: Number(metadata.sectionChunkIndex ?? 0),
      offsetBasis: (metadata.offsetBasis as EmbeddedChunk["metadata"]["offsetBasis"]) ?? "document",
      author: metadata.author as string | undefined,
      timestamp: metadata.timestamp as string | undefined,
      tags: metadata.tags as string[] | undefined,
      permissions: metadata.permissions as string[] | undefined,
      tenantId: metadata.tenantId as string | undefined,
      relationships: typeof metadata.relationshipsJson === "string"
        ? JSON.parse(metadata.relationshipsJson)
        : undefined,
    },
    embeddingMetadata: {
      provider: String(metadata.embeddingProvider ?? ""),
      dimensions: Number(metadata.embeddingDimensions ?? 0),
      model: metadata.embeddingModel as string | undefined,
      normalized: metadata.embeddingNormalized as boolean | undefined,
      similarityMetric: metadata.embeddingSimilarityMetric as
        | EmbeddedChunk["embeddingMetadata"]["similarityMetric"]
        | undefined,
    },
    embedding: [] as EmbeddingVector, // not returned by Pinecone unless includeValues is set
  };
}

function toPineconeFilter(filter: VectorMetadataFilter | undefined): Record<string, unknown> | undefined {
  if (!filter) {
    return undefined;
  }

  const clauses: Record<string, unknown>[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) {
      continue;
    }

    if (OPEN_ARRAY_METADATA_FIELDS.has(key)) {
      // Book cap. 9: matches chunks whose array contains the value, OR
      // whose array is unset (no restriction = visible to everyone).
      clauses.push({
        $or: [{ [key]: { $in: [value] } }, { [key]: { $exists: false } }],
      });
      continue;
    }

    clauses.push({ [key]: { $eq: value } });
  }

  if (clauses.length === 0) {
    return undefined;
  }

  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function trimTrailingSlashes(value: string): string {
  let index = value.length;
  while (index > 0 && value[index - 1] === "/") {
    index -= 1;
  }

  return value.slice(0, index);
}
