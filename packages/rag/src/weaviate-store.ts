/**
 * WeaviateVectorStore — a VectorStore implementation backed by Weaviate's
 * REST + GraphQL API (https://weaviate.io/developers/weaviate/api).
 *
 * Insert uses the batch objects REST endpoint; search uses GraphQL
 * (`Get { <Class>(nearVector: ..., where: ...) }`), since vector search
 * with filters is only exposed there. Weaviate requires object IDs to be
 * UUIDs, so our own chunk id is stored as a `chunkId` property instead of
 * the object's `id` — objects are looked up by that property, not by ID.
 *
 * Book cap. 13 namespaces/tenants: when `tenant` is configured, every
 * request (batch insert and GraphQL query) is scoped to that tenant via
 * Weaviate's native multi-tenancy support, assuming the class was created
 * with `multiTenancyConfig.enabled: true` and the tenant already exists.
 *
 * `relationships` (an array of objects) has no natural Weaviate property
 * type here, so it's serialized to a JSON string property and parsed back
 * on read — not filterable via Weaviate `where` clauses.
 */

import type { EmbeddedChunk, EmbeddingVector } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import type {
  VectorMetadataFilter,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/weaviate-store]";
const DEFAULT_TOP_K = 5;
const DEFAULT_TIMEOUT_MS = 5_000;

/** Book cap. 9: fields where an unset/absent value means "no restriction". */
const OPEN_ARRAY_METADATA_FIELDS = new Set(["tags", "permissions"]);

const RESULT_PROPERTIES = [
  "chunkId",
  "documentId",
  "sectionId",
  "startOffset",
  "endOffset",
  "text",
  "documentTitle",
  "modality",
  "sourceType",
  "sectionHeading",
  "page",
  "originalFilename",
  "chunkIndex",
  "sectionChunkIndex",
  "offsetBasis",
  "author",
  "timestamp",
  "tags",
  "permissions",
  "tenantId",
  "relationshipsJson",
  "embeddingProvider",
  "embeddingModel",
  "embeddingDimensions",
  "embeddingNormalized",
  "embeddingSimilarityMetric",
] as const;

export interface WeaviateStoreOptions {
  baseUrl: string;
  className: string;
  apiKey?: string;
  /** Book cap. 13 namespaces/tenants: requires the class to have multi-tenancy enabled. */
  tenant?: string;
  defaultTopK?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  mirrorStore?: VectorStore;
}

interface WeaviateGraphqlObject {
  _additional: { id: string; distance?: number; certainty?: number };
  [key: string]: unknown;
}

export class WeaviateVectorStore implements VectorStore {
  private readonly baseUrl: string;
  private readonly className: string;
  private readonly apiKey: string | undefined;
  private readonly tenant: string | undefined;
  private readonly defaultTopK: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly mirrorStore: VectorStore;

  constructor(options: WeaviateStoreOptions) {
    const baseUrl = options.baseUrl?.trim();
    const className = options.className?.trim();

    if (!baseUrl) {
      throw new Error(`${ERROR_PREFIX} baseUrl must not be empty.`);
    }

    if (!className) {
      throw new Error(`${ERROR_PREFIX} className must not be empty.`);
    }

    this.baseUrl = trimTrailingSlashes(baseUrl);
    this.className = className;
    this.apiKey = options.apiKey;
    this.tenant = options.tenant;
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
      console.warn(`${ERROR_PREFIX} weaviate batch insert failed; using mirror store only.`, error);
    });
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    return this.mirrorStore.search(query);
  }

  async searchAsync(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const fallback = this.mirrorStore.search(query);
    const topK = query.topK ?? this.defaultTopK;

    try {
      const graphqlQuery = buildSearchQuery(this.className, query.embedding, topK, query.filter, this.tenant);
      const envelope = await this.request<{
        data?: { Get?: Record<string, WeaviateGraphqlObject[]> };
        errors?: unknown[];
      }>("POST", "/v1/graphql", { query: graphqlQuery });

      if (envelope.errors && envelope.errors.length > 0) {
        throw new Error(`${ERROR_PREFIX} graphql errors: ${JSON.stringify(envelope.errors)}`);
      }

      const objects = envelope.data?.Get?.[this.className] ?? [];
      const results = objects.map((object) => this.toSearchResult(object));

      return results.length > 0 ? results : fallback;
    } catch (error) {
      console.warn(`${ERROR_PREFIX} weaviate search failed; using mirror store fallback.`, error);
      return fallback;
    }
  }

  clear(): void {
    this.mirrorStore.clear();

    void this.request("DELETE", `/v1/schema/${encodeURIComponent(this.className)}`).catch((error) => {
      console.warn(`${ERROR_PREFIX} weaviate clear failed.`, error);
    });
  }

  private async upsertAsync(chunks: EmbeddedChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    await this.request("POST", "/v1/batch/objects", {
      objects: chunks.map((chunk) => ({
        class: this.className,
        vector: chunk.embedding,
        properties: buildWeaviateProperties(chunk),
        ...(this.tenant ? { tenant: this.tenant } : {}),
      })),
    });
  }

  private async request<T = unknown>(
    method: "POST" | "DELETE",
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
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
          `${ERROR_PREFIX} weaviate request failed (${response.status}): ${responseBody.slice(0, 500)}`
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

  private toSearchResult(object: WeaviateGraphqlObject): VectorSearchResult {
    const distance = object._additional?.distance;
    const certainty = object._additional?.certainty;
    const score = typeof certainty === "number" ? certainty : typeof distance === "number" ? 1 - distance : 0;

    return {
      chunk: propertiesToChunk(object),
      score,
    };
  }
}

function buildWeaviateProperties(chunk: EmbeddedChunk): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    chunkId: chunk.id,
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

  setIfDefined(properties, "sectionHeading", chunk.metadata.sectionHeading);
  setIfDefined(properties, "page", chunk.metadata.page);
  setIfDefined(properties, "originalFilename", chunk.metadata.originalFilename);
  setIfDefined(properties, "author", chunk.metadata.author);
  setIfDefined(properties, "timestamp", chunk.metadata.timestamp);
  setIfDefined(properties, "tags", chunk.metadata.tags);
  setIfDefined(properties, "permissions", chunk.metadata.permissions);
  setIfDefined(properties, "tenantId", chunk.metadata.tenantId);
  setIfDefined(properties, "embeddingModel", chunk.embeddingMetadata.model);
  setIfDefined(properties, "embeddingNormalized", chunk.embeddingMetadata.normalized);
  setIfDefined(properties, "embeddingSimilarityMetric", chunk.embeddingMetadata.similarityMetric);

  if (chunk.metadata.relationships) {
    properties.relationshipsJson = JSON.stringify(chunk.metadata.relationships);
  }

  return properties;
}

function setIfDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function propertiesToChunk(object: WeaviateGraphqlObject): EmbeddedChunk {
  const p = object as Record<string, unknown>;

  return {
    id: String(p.chunkId ?? object._additional?.id ?? ""),
    documentId: String(p.documentId ?? ""),
    sectionId: String(p.sectionId ?? ""),
    startOffset: Number(p.startOffset ?? 0),
    endOffset: Number(p.endOffset ?? 0),
    text: String(p.text ?? ""),
    metadata: {
      documentTitle: String(p.documentTitle ?? ""),
      modality: p.modality as EmbeddedChunk["metadata"]["modality"],
      sourceType: p.sourceType as EmbeddedChunk["metadata"]["sourceType"],
      sectionHeading: p.sectionHeading as string | undefined,
      page: p.page as number | undefined,
      originalFilename: p.originalFilename as string | undefined,
      chunkIndex: Number(p.chunkIndex ?? 0),
      sectionChunkIndex: Number(p.sectionChunkIndex ?? 0),
      offsetBasis: (p.offsetBasis as EmbeddedChunk["metadata"]["offsetBasis"]) ?? "document",
      author: p.author as string | undefined,
      timestamp: p.timestamp as string | undefined,
      tags: p.tags as string[] | undefined,
      permissions: p.permissions as string[] | undefined,
      tenantId: p.tenantId as string | undefined,
      relationships:
        typeof p.relationshipsJson === "string" ? JSON.parse(p.relationshipsJson) : undefined,
    },
    embeddingMetadata: {
      provider: String(p.embeddingProvider ?? ""),
      dimensions: Number(p.embeddingDimensions ?? 0),
      model: p.embeddingModel as string | undefined,
      normalized: p.embeddingNormalized as boolean | undefined,
      similarityMetric: p.embeddingSimilarityMetric as
        | EmbeddedChunk["embeddingMetadata"]["similarityMetric"]
        | undefined,
    },
    embedding: [] as EmbeddingVector,
  };
}

function buildSearchQuery(
  className: string,
  vector: EmbeddingVector,
  topK: number,
  filter: VectorMetadataFilter | undefined,
  tenant: string | undefined
): string {
  const whereClause = toWeaviateWhere(filter);
  const fields = RESULT_PROPERTIES.join(" ");
  const args = [
    `nearVector: {vector: [${vector.join(",")}]}`,
    `limit: ${topK}`,
    tenant ? `tenant: "${escapeGraphqlString(tenant)}"` : undefined,
    whereClause ? `where: ${whereClause}` : undefined,
  ]
    .filter(Boolean)
    .join(", ");

  return `{ Get { ${className}(${args}) { ${fields} _additional { id distance } } } }`;
}

function toWeaviateWhere(filter: VectorMetadataFilter | undefined): string | undefined {
  if (!filter) {
    return undefined;
  }

  const operands = Object.entries(filter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => toWeaviateOperand(key, value as string | number | boolean));

  if (operands.length === 0) {
    return undefined;
  }

  return operands.length === 1 ? operands[0]! : `{operator: And, operands: [${operands.join(", ")}]}`;
}

function toWeaviateOperand(key: string, value: string | number | boolean): string {
  if (OPEN_ARRAY_METADATA_FIELDS.has(key)) {
    // Book cap. 9: matches chunks whose array contains the value, OR whose
    // array is unset (no restriction = visible to everyone).
    return `{operator: Or, operands: [
      {path: ["${key}"], operator: ContainsAny, valueTextArray: ["${escapeGraphqlString(String(value))}"]},
      {path: ["${key}"], operator: IsNull, valueBoolean: true}
    ]}`;
  }

  return `{path: ["${key}"], ${valueField(value)}}`;
}

function valueField(value: string | number | boolean): string {
  if (typeof value === "number") {
    return `operator: Equal, valueNumber: ${value}`;
  }

  if (typeof value === "boolean") {
    return `operator: Equal, valueBoolean: ${value}`;
  }

  return `operator: Equal, valueText: "${escapeGraphqlString(value)}"`;
}

function escapeGraphqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function trimTrailingSlashes(value: string): string {
  let index = value.length;
  while (index > 0 && value[index - 1] === "/") {
    index -= 1;
  }

  return value.slice(0, index);
}
