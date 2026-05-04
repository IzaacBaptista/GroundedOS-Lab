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

import type { EmbeddedChunk } from "./embeddings";
import { InMemoryVectorStore } from "./vector-store";
import type {
  VectorMetadataFilter,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStore,
} from "./vector-store";

const ERROR_PREFIX = "[rag/pgvector-store]";

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
}

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
    await bootstrapSchema(client, options.tableName ?? "rag_chunks", options.dimensions ?? 1536);
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
  dimensions: number
): Promise<void> {
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
  await client.query(`
    CREATE INDEX IF NOT EXISTS ${table}_embedding_idx
      ON ${table} USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
  `);
}

export class PgvectorVectorStore implements VectorStore {
  private readonly client: PgClient;
  private readonly table: string;
  private readonly defaultTopK: number;
  private _size = 0;

  constructor(client: PgClient, options: PgvectorStoreOptions) {
    this.client = client;
    this.table = options.tableName ?? "rag_chunks";
    this.defaultTopK = options.defaultTopK ?? 5;
  }

  get size(): number {
    return this._size;
  }

  insert(chunks: EmbeddedChunk[]): void {
    // Kick off async upsert; caller does not await inserts synchronously to
    // match the synchronous VectorStore interface.
    this._upsertAsync(chunks).catch((err) => {
      console.error(`${ERROR_PREFIX} background upsert failed:`, err);
    });
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
        const pgKey = camelToSnake(key);
        filterClauses.push(`${pgKey} = $${idx}`);
        params.push(value);
        idx++;
      }
    }

    const where = filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : "";

    type Row = {
      id: string;
      document_id: string;
      section_id: string | null;
      start_offset: number;
      end_offset: number;
      text: string;
      metadata: Record<string, unknown>;
      embedding_metadata: Record<string, unknown>;
      cosine_distance: number;
    };

    const { rows } = await this.client.query<Row>(
      `SELECT
         id, document_id, section_id, start_offset, end_offset, text,
         metadata, embedding_metadata,
         1 - (embedding <=> $1::vector) AS cosine_distance
       FROM ${this.table}
       ${where}
       ORDER BY embedding <=> $1::vector
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
      score: row.cosine_distance,
    }));
  }

  clear(): void {
    this.client.query(`TRUNCATE ${this.table}`).catch((err) => {
      console.error(`${ERROR_PREFIX} truncate failed:`, err);
    });
    this._size = 0;
  }
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Resolve the active vector store backend.
 *
 * VECTOR_BACKEND=pgvector → attempt pgvector, fall back to in-memory on failure.
 * VECTOR_BACKEND=memory   → always use in-memory (default).
 */
export function resolveVectorBackend(): "pgvector" | "memory" {
  const backend = process.env.VECTOR_BACKEND?.toLowerCase().trim();
  if (backend === "pgvector") return "pgvector";
  return "memory";
}
