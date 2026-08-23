/**
 * ElasticsearchVectorStore — a VectorStore implementation backed by
 * Elasticsearch's (or OpenSearch's compatible) native `knn` search
 * (https://www.elastic.co/guide/en/elasticsearch/reference/current/knn-search.html).
 *
 * Book cap. 13: this is the "search engine that grew vector search"
 * option — hybrid search (lexical + vector) is its whole reason for
 * being interesting, since BM25 (cap. 15) and kNN live in the same
 * engine. The native `knn` query's own `filter` clause runs *before*
 * the vector search executes, which is exactly the pre-filter behavior
 * the book requires for permissions/tenant filtering (cap. 9/13) — not a
 * post-hoc discard of an already-ranked result set.
 */

import type { EmbeddedChunk, EmbeddingVector } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import type {
  VectorMetadataFilter,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/elasticsearch-store]";
const DEFAULT_TOP_K = 5;
const DEFAULT_TIMEOUT_MS = 5_000;
const EMBEDDING_FIELD = "embedding";

/** Book cap. 9: fields where an unset/absent value means "no restriction". */
const OPEN_ARRAY_METADATA_FIELDS = new Set(["tags", "permissions"]);
/** RetrievalChunk fields stored at the document root (see buildEsDocument). */
const ROOT_FIELDS = new Set(["documentId", "sectionId", "startOffset", "endOffset"]);
const EMBEDDING_METADATA_FIELDS: Record<string, string> = {
  embeddingProvider: "embeddingMetadata.provider",
  embeddingDimensions: "embeddingMetadata.dimensions",
};

export interface ElasticsearchStoreOptions {
  baseUrl: string;
  index: string;
  apiKey?: string;
  defaultTopK?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  mirrorStore?: VectorStore;
}

interface EsHit {
  _id: string;
  _score: number;
  _source: Record<string, unknown>;
}

export class ElasticsearchVectorStore implements VectorStore {
  private readonly baseUrl: string;
  private readonly index: string;
  private readonly apiKey: string | undefined;
  private readonly defaultTopK: number;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly mirrorStore: VectorStore;

  constructor(options: ElasticsearchStoreOptions) {
    const baseUrl = options.baseUrl?.trim();
    const index = options.index?.trim();

    if (!baseUrl) {
      throw new Error(`${ERROR_PREFIX} baseUrl must not be empty.`);
    }

    if (!index) {
      throw new Error(`${ERROR_PREFIX} index must not be empty.`);
    }

    this.baseUrl = trimTrailingSlashes(baseUrl);
    this.index = index;
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
    void this.bulkIndexAsync(chunks).catch((error) => {
      console.warn(`${ERROR_PREFIX} bulk index failed; using mirror store only.`, error);
    });
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    return this.mirrorStore.search(query);
  }

  async searchAsync(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const fallback = this.mirrorStore.search(query);
    const topK = query.topK ?? this.defaultTopK;

    try {
      const envelope = await this.request<{ hits?: { hits?: EsHit[] } }>(
        "POST",
        `/${encodeURIComponent(this.index)}/_search`,
        {
          knn: {
            field: EMBEDDING_FIELD,
            query_vector: query.embedding,
            k: topK,
            num_candidates: Math.max(topK * 10, 50),
            filter: toEsFilter(query.filter),
          },
          _source: { excludes: [EMBEDDING_FIELD] },
        }
      );

      const hits = envelope.hits?.hits ?? [];
      const results = hits.map((hit) => this.toSearchResult(hit));

      return results.length > 0 ? results : fallback;
    } catch (error) {
      console.warn(`${ERROR_PREFIX} search failed; using mirror store fallback.`, error);
      return fallback;
    }
  }

  clear(): void {
    this.mirrorStore.clear();

    void this.request("DELETE", `/${encodeURIComponent(this.index)}`).catch((error) => {
      console.warn(`${ERROR_PREFIX} clear failed.`, error);
    });
  }

  private async bulkIndexAsync(chunks: EmbeddedChunk[]): Promise<void> {
    if (chunks.length === 0) {
      return;
    }

    const lines = chunks.flatMap((chunk) => [
      JSON.stringify({ index: { _index: this.index, _id: chunk.id } }),
      JSON.stringify(buildEsDocument(chunk)),
    ]);

    await this.request("POST", "/_bulk", `${lines.join("\n")}\n`, "application/x-ndjson");
  }

  private async request<T = unknown>(
    method: "POST" | "DELETE",
    path: string,
    body?: unknown,
    contentType = "application/json"
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const serializedBody = body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body);

      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": contentType,
          ...(this.apiKey ? { Authorization: `ApiKey ${this.apiKey}` } : {}),
        },
        ...(serializedBody === undefined ? {} : { body: serializedBody }),
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(
          `${ERROR_PREFIX} request failed (${response.status}): ${responseBody.slice(0, 500)}`
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

  private toSearchResult(hit: EsHit): VectorSearchResult {
    return {
      chunk: sourceToChunk(hit._id, hit._source),
      score: hit._score,
    };
  }
}

function buildEsDocument(chunk: EmbeddedChunk): Record<string, unknown> {
  return {
    [EMBEDDING_FIELD]: chunk.embedding,
    documentId: chunk.documentId,
    sectionId: chunk.sectionId,
    startOffset: chunk.startOffset,
    endOffset: chunk.endOffset,
    text: chunk.text,
    metadata: chunk.metadata,
    embeddingMetadata: chunk.embeddingMetadata,
  };
}

function sourceToChunk(id: string, source: Record<string, unknown>): EmbeddedChunk {
  return {
    id,
    documentId: String(source.documentId ?? ""),
    sectionId: String(source.sectionId ?? ""),
    startOffset: Number(source.startOffset ?? 0),
    endOffset: Number(source.endOffset ?? 0),
    text: String(source.text ?? ""),
    metadata: (source.metadata ?? {}) as EmbeddedChunk["metadata"],
    embeddingMetadata: (source.embeddingMetadata ?? {}) as EmbeddedChunk["embeddingMetadata"],
    embedding: [] as EmbeddingVector,
  };
}

/**
 * Elasticsearch's native `knn.filter` accepts a Query DSL query (or array of
 * queries, implicitly ANDed) evaluated *before* the nearest-neighbor search
 * runs — the pre-filter behavior book cap. 9/13 requires for permissions
 * and tenant scoping.
 */
function toEsFilter(filter: VectorMetadataFilter | undefined): unknown[] | undefined {
  if (!filter) {
    return undefined;
  }

  const clauses = Object.entries(filter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => toEsClause(key, value as string | number | boolean));

  return clauses.length > 0 ? clauses : undefined;
}

function resolveEsFieldPath(key: string): string {
  if (ROOT_FIELDS.has(key)) {
    return key;
  }

  return EMBEDDING_METADATA_FIELDS[key] ?? `metadata.${key}`;
}

function toEsClause(key: string, value: string | number | boolean): unknown {
  const field = resolveEsFieldPath(key);

  if (OPEN_ARRAY_METADATA_FIELDS.has(key)) {
    // Book cap. 9: matches chunks whose array contains the value, OR whose
    // array is unset (no restriction = visible to everyone).
    return {
      bool: {
        should: [{ term: { [field]: value } }, { bool: { must_not: { exists: { field } } } }],
        minimum_should_match: 1,
      },
    };
  }

  return { term: { [field]: value } };
}

function trimTrailingSlashes(value: string): string {
  let index = value.length;
  while (index > 0 && value[index - 1] === "/") {
    index -= 1;
  }

  return value.slice(0, index);
}
