/**
 * PgvectorVectorStore — a VectorStore implementation backed by PostgreSQL
 * with the pgvector extension.
 *
 * Falls back gracefully to the in-memory store when:
 *   - VECTOR_BACKEND env var is not set to "pgvector"
 *   - The pg connection is unavailable at construction time
 *   - Any individual operation fails (soft fallback during search)
 *
 * SQL bootstrap (run once in migration or on first connect):
 *   CREATE EXTENSION IF NOT EXISTS vector;
 *   CREATE TABLE IF NOT EXISTS rag_chunks (
 *     id           TEXT PRIMARY KEY,
 *     document_id  TEXT NOT NULL,
 *     section_id   TEXT,
 *     start_offset INTEGER NOT NULL DEFAULT 0,
 *     end_offset   INTEGER NOT NULL DEFAULT 0,
 *     text         TEXT NOT NULL,
 *     metadata     JSONB NOT NULL DEFAULT '{}',
 *     embedding_metadata JSONB NOT NULL DEFAULT '{}',
 *     embedding    vector(<dimensions>)
 *   );
 *   CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx
 *     ON rag_chunks USING ivfflat (embedding vector_cosine_ops)
 *     WITH (lists = 100);
 */

import type { EmbeddedChunk, SimilarityMetric } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import type {
  VectorMetadataFilter,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/pgvector-store]";

/**
 * Book cap. 11/14: pgvector requires the index's operator class to match
 * the distance operator used at query time, and both must match the
 * metric the embedding model was actually trained/evaluated on (ADR-024)
 * — using cosine ops/operator for a dotProduct-optimized model is a
 * silent correctness bug, not an error.
 */
const METRIC_OPERATOR: Record<SimilarityMetric, { opclass: string; operator: string }> = {
  cosine: { opclass: "vector_cosine_ops", operator: "<=>" },
  euclidean: { opclass: "vector_l2_ops", operator: "<->" },
  dotProduct: { opclass: "vector_ip_ops", operator: "<#>" },
};

/**
 * Converts the raw pgvector operator result into a score where higher is
 * always more similar, matching InMemoryVectorStore's convention (ADR-024):
 * cosine/dotProduct already return a similarity-like value once adjusted;
 * pgvector's `<#>` is a *negative* inner product, and `<->` is a plain
 * Euclidean distance, both requiring their own transform.
 */
function scoreExpression(metric: SimilarityMetric, operatorExpr: string): string {
  switch (metric) {
    case "euclidean":
      return `1 / (1 + (${operatorExpr}))`;
    case "dotProduct":
      return `-(${operatorExpr})`;
    case "cosine":
    default:
      return `1 - (${operatorExpr})`;
  }
}

const POSITIVE_INTEGER = (value: number, label: string): number => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${ERROR_PREFIX} ${label} must be a positive integer.`);
  }
  return value;
};

/** RetrievalChunk fields backed by a real table column (see bootstrapSchema). */
const ROOT_COLUMNS: Record<string, string> = {
  documentId: "document_id",
  sectionId: "section_id",
  startOffset: "start_offset",
  endOffset: "end_offset",
};
/** EmbeddedChunk.embeddingMetadata fields, stored in the embedding_metadata JSONB column. */
const EMBEDDING_METADATA_FIELDS: Record<string, string> = {
  embeddingProvider: "provider",
  embeddingDimensions: "dimensions",
};
const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Book cap. 13/9: builds one WHERE clause per filter key. Fields that live
 * in the `metadata` JSONB column (everything not a real column or embedding
 * metadata field — e.g. tenantId, permissions, tags, modality) are matched
 * generically: if the stored value is a JSON array, the filter matches when
 * the array contains the requested value OR the array is empty/absent (no
 * restriction = visible to everyone, mirroring InMemoryVectorStore's
 * permissions/tags semantics); otherwise it's an exact match.
 */
function buildFilterClause(
  key: string,
  value: string | number | boolean,
  paramIndex: number
): { clause: string; param: unknown } {
  if (!SAFE_IDENTIFIER.test(key)) {
    throw new Error(`${ERROR_PREFIX} invalid filter key "${key}".`);
  }

  if (ROOT_COLUMNS[key]) {
    return { clause: `${ROOT_COLUMNS[key]} = $${paramIndex}`, param: value };
  }

  if (EMBEDDING_METADATA_FIELDS[key]) {
    const field = EMBEDDING_METADATA_FIELDS[key];
    return {
      clause: `embedding_metadata->>'${field}' = $${paramIndex}::text`,
      param: String(value),
    };
  }

  return {
    clause: `(
      (jsonb_typeof(metadata->'${key}') = 'array' AND (
        jsonb_array_length(metadata->'${key}') = 0 OR metadata->'${key}' ? $${paramIndex}::text
      ))
      OR (jsonb_typeof(metadata->'${key}') IS DISTINCT FROM 'array' AND metadata->>'${key}' = $${paramIndex}::text)
    )`,
    param: String(value),
  };
}

export interface PgClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>;
  end(): Promise<void>;
}

export interface PgvectorStoreOptions {
  /** Factory that returns a connected pg client. */
  connect(): Promise<PgClient>;
  /** Table name (default: rag_chunks). */
  tableName?: string;
  /** Embedding dimensions — must match the vector column size (default: 1536). */
  dimensions?: number;
  /** Number of results returned per search when topK is not specified (default: 5). */
  defaultTopK?: number;
  /**
   * Book cap. 11: must match the metric the embedding model declares
   * (ADR-024) — determines the index's operator class and the operator
   * used at query time (default: "cosine").
   */
  similarityMetric?: SimilarityMetric;
  /**
   * Book cap. 14: ANN index structure. ivfflat is pgvector's original
   * index type (cheaper to build, needs `lists`/`probes` tuning); hnsw
   * (pgvector >= 0.5) generally gives better recall/latency without
   * needing a training pass, at higher build cost (default: "ivfflat").
   */
  indexType?: "ivfflat" | "hnsw";
  /** ivfflat: number of lists to partition vectors into at build time (default: 100). */
  ivfflatLists?: number;
  /**
   * ivfflat: number of lists probed per query — the book's recall/latency
   * knob for this index type. Higher = better recall, slower. Unset uses
   * pgvector's own session default.
   */
  probes?: number;
  /** hnsw: max connections per graph layer at build time (default: 16). */
  hnswM?: number;
  /** hnsw: candidate list size during graph construction (default: 64). */
  hnswEfConstruction?: number;
  /**
   * hnsw: candidate list size searched per query — the book's recall/latency
   * knob for this index type. Higher = better recall, slower. Unset uses
   * pgvector's own session default.
   */
  hnswEfSearch?: number;
}

const DEFAULT_IVFFLAT_LISTS = 100;
const DEFAULT_HNSW_M = 16;
const DEFAULT_HNSW_EF_CONSTRUCTION = 64;

/**
 * Build a PgvectorVectorStore.
 *
 * Returns an InMemoryVectorStore if the connection fails so that dev/test
 * environments without a running Postgres instance continue to work.
 */
export async function createVectorStore(
  options: PgvectorStoreOptions
): Promise<VectorStore> {
  try {
    const client = await options.connect();
    await bootstrapSchema(client, options.tableName ?? "rag_chunks", options.dimensions ?? 1536, options);
    return new PgvectorVectorStore(client, options);
  } catch (err) {
    console.warn(
      `${ERROR_PREFIX} pgvector connection failed; falling back to in-memory store:`,
      err
    );
    return new InMemoryVectorStore();
  }
}

async function bootstrapSchema(
  client: PgClient,
  table: string,
  dimensions: number,
  options: PgvectorStoreOptions
): Promise<void> {
  const metric = options.similarityMetric ?? "cosine";
  const indexType = options.indexType ?? "ivfflat";
  const { opclass } = METRIC_OPERATOR[metric];

  await client.query("CREATE EXTENSION IF NOT EXISTS vector");
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id                 TEXT PRIMARY KEY,
      document_id        TEXT NOT NULL,
      section_id         TEXT,
      start_offset       INTEGER NOT NULL DEFAULT 0,
      end_offset         INTEGER NOT NULL DEFAULT 0,
      text               TEXT NOT NULL,
      metadata           JSONB NOT NULL DEFAULT '{}',
      embedding_metadata JSONB NOT NULL DEFAULT '{}',
      embedding          vector(${dimensions})
    )
  `);

  if (indexType === "hnsw") {
    const m = POSITIVE_INTEGER(options.hnswM ?? DEFAULT_HNSW_M, "hnswM");
    const efConstruction = POSITIVE_INTEGER(
      options.hnswEfConstruction ?? DEFAULT_HNSW_EF_CONSTRUCTION,
      "hnswEfConstruction"
    );

    await client.query(`
      CREATE INDEX IF NOT EXISTS ${table}_embedding_idx
        ON ${table} USING hnsw (embedding ${opclass})
        WITH (m = ${m}, ef_construction = ${efConstruction})
    `);
    return;
  }

  const lists = POSITIVE_INTEGER(options.ivfflatLists ?? DEFAULT_IVFFLAT_LISTS, "ivfflatLists");

  await client.query(`
    CREATE INDEX IF NOT EXISTS ${table}_embedding_idx
      ON ${table} USING ivfflat (embedding ${opclass})
      WITH (lists = ${lists})
  `);
}

export class PgvectorVectorStore implements VectorStore {
  private readonly client: PgClient;
  private readonly table: string;
  private readonly defaultTopK: number;
  private readonly metric: SimilarityMetric;
  private readonly indexType: "ivfflat" | "hnsw";
  private readonly probes: number | undefined;
  private readonly hnswEfSearch: number | undefined;
  private _size = 0;

  constructor(client: PgClient, options: PgvectorStoreOptions) {
    this.client = client;
    this.table = options.tableName ?? "rag_chunks";
    this.defaultTopK = options.defaultTopK ?? 5;
    this.metric = options.similarityMetric ?? "cosine";
    this.indexType = options.indexType ?? "ivfflat";
    this.probes = options.probes;
    this.hnswEfSearch = options.hnswEfSearch;
  }

  get size(): number {
    return this._size;
  }

  insert(chunks: EmbeddedChunk[]): void {
    // Kick off async upsert; caller does not await inserts synchronously to
    // match the synchronous VectorStore interface.
    this.insertAsync(chunks).catch((err) => {
      console.error(`${ERROR_PREFIX} background upsert failed:`, err);
    });
  }

  async insertAsync(chunks: EmbeddedChunk[]): Promise<void> {
    await this._upsertAsync(chunks);
    this._size += chunks.length;
  }

  private async _upsertAsync(chunks: EmbeddedChunk[]): Promise<void> {
    for (const chunk of chunks) {
      const embeddingLiteral = `[${chunk.embedding.join(",")}]`;
      await this.client.query(
        `INSERT INTO ${this.table}
           (id, document_id, section_id, start_offset, end_offset, text,
            metadata, embedding_metadata, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::vector)
         ON CONFLICT (id) DO UPDATE SET
           embedding          = EXCLUDED.embedding,
           metadata           = EXCLUDED.metadata,
           embedding_metadata = EXCLUDED.embedding_metadata`,
        [
          chunk.id,
          chunk.documentId,
          chunk.sectionId ?? null,
          chunk.startOffset,
          chunk.endOffset,
          chunk.text,
          JSON.stringify(chunk.metadata),
          JSON.stringify(chunk.embeddingMetadata),
          embeddingLiteral,
        ]
      );
    }
  }

  search(query: VectorSearchQuery): VectorSearchResult[] {
    throw new Error(
      `${ERROR_PREFIX} .search() is async for pgvector — use searchAsync() instead.`
    );
  }

  async searchAsync(query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const topK = query.topK ?? this.defaultTopK;
    const embeddingLiteral = `[${query.embedding.join(",")}]`;

    const filterClauses: string[] = [];
    const params: unknown[] = [embeddingLiteral, topK];

    if (query.filter) {
      let idx = params.length + 1;
      for (const [key, value] of Object.entries(query.filter)) {
        if (value === undefined) continue;
        const { clause, param } = buildFilterClause(key, value, idx);
        filterClauses.push(clause);
        params.push(param);
        idx++;
      }
    }

    const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : "";

    // Book cap. 14: recall/latency is tunable per query via the ANN index's
    // own session parameters, not fixed once at index-build time.
    if (this.indexType === "ivfflat" && this.probes !== undefined) {
      await this.client.query(`SET ivfflat.probes = ${POSITIVE_INTEGER(this.probes, "probes")}`);
    } else if (this.indexType === "hnsw" && this.hnswEfSearch !== undefined) {
      await this.client.query(
        `SET hnsw.ef_search = ${POSITIVE_INTEGER(this.hnswEfSearch, "hnswEfSearch")}`
      );
    }

    type Row = {
      id: string;
      document_id: string;
      section_id: string | null;
      start_offset: number;
      end_offset: number;
      text: string;
      metadata: Record<string, unknown>;
      embedding_metadata: Record<string, unknown>;
      similarity_score: number;
    };

    const { operator } = METRIC_OPERATOR[this.metric];
    const operatorExpr = `embedding ${operator} $1::vector`;

    const { rows } = await this.client.query<Row>(
      `SELECT
         id, document_id, section_id, start_offset, end_offset, text,
         metadata, embedding_metadata,
         ${scoreExpression(this.metric, operatorExpr)} AS similarity_score
       FROM ${this.table}
       ${where}
       ORDER BY ${operatorExpr}
       LIMIT $2`,
      params
    );

    return rows.map((row) => ({
      chunk: {
        id: row.id,
        documentId: row.document_id,
        sectionId: row.section_id ?? "",
        startOffset: row.start_offset,
        endOffset: row.end_offset,
        text: row.text,
        metadata: row.metadata as unknown as EmbeddedChunk["metadata"],
        embeddingMetadata: row.embedding_metadata as unknown as EmbeddedChunk["embeddingMetadata"],
        embedding: [], // embeddings are stored in PG; not re-hydrated for perf
      },
      score: row.similarity_score,
    }));
  }

  clear(): void {
    this.client.query(`TRUNCATE ${this.table}`).catch((err) => {
      console.error(`${ERROR_PREFIX} truncate failed:`, err);
    });
    this._size = 0;
  }

  /**
   * Book cap. 14: ANN index quality degrades as rows are inserted/updated
   * over time without a full rebuild. `REINDEX ... CONCURRENTLY` rebuilds
   * the index without holding a lock that blocks concurrent reads/writes —
   * call this periodically (e.g. from a scheduled maintenance job), not on
   * every write.
   */
  async reindexAnn(): Promise<void> {
    await this.client.query(`REINDEX INDEX CONCURRENTLY ${this.table}_embedding_idx`);
  }
}

/**
 * Resolve the active vector store backend.
 *
 * VECTOR_BACKEND=pgvector → attempt pgvector, fall back to in-memory on failure.
 * VECTOR_BACKEND=qdrant   → enable qdrant backend selection by callers.
 * VECTOR_BACKEND=memory   → always use in-memory (default).
 */
export function resolveVectorBackend(): "pgvector" | "qdrant" | "memory" {
  const backend = process.env.VECTOR_BACKEND?.toLowerCase().trim();
  if (backend === "pgvector") return "pgvector";
  if (backend === "qdrant") return "qdrant";
  return "memory";
}
