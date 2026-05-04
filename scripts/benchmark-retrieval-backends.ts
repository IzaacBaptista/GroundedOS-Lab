import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "../packages/etl/src/index";
import {
  InMemoryVectorStore,
  PgvectorVectorStore,
  buildRetrievalIndex,
  createVectorStore,
  type PgClient,
  type RetrievalIndex,
  type VectorSearchResult,
} from "../packages/rag/src/index";
import {
  RagCliLexicalEmbeddingProvider,
  parsePositiveInteger,
  requireCliValue,
} from "./rag-cli-utils";

const DEFAULT_DATASET_ID = "phase-5-retrieval-text";
const DEFAULT_TOP_K = 3;
const DEFAULT_TABLE = "rag_chunks_benchmark";

type DatasetRegistry = {
  datasets: DatasetEntry[];
};

type DatasetEntry = {
  id: string;
  modality: DocumentModality;
  path: string;
  source: string;
  license: string;
  sha256?: string;
  metadata: {
    documentId: string;
    title: string;
    language?: string;
    tags?: string[];
  };
};

type GoldenDataset = {
  version: number;
  description: string;
  entries: GoldenEntry[];
};

type GoldenEntry = {
  id: string;
  question: string;
  document_ref: string;
  expected_chunk_ids: string[];
};

type CliOptions = {
  datasetId: string;
  topK: number;
  tableName: string;
  help: boolean;
};

type BackendMetrics = {
  backend: "memory" | "pgvector";
  available: boolean;
  reasonUnavailable?: string;
  totalQueries: number;
  successfulRetrievals: number;
  recallAtK: number;
  top1Recall: number;
  meanReciprocalRank: number;
  avgExpectedChunkScore: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  persistenceAfterRestart: {
    supported: boolean;
    retainedRecallAtK: number;
    passed: boolean;
    note: string;
  };
};

type BenchmarkOutput = {
  timestamp: string;
  version: 1;
  description: string;
  dataset: string;
  topK: number;
  goldenSize: number;
  pgvectorTable: string;
  postgresConnectionConfigured: boolean;
  results: {
    memory: BackendMetrics;
    pgvector: BackendMetrics;
    comparison: {
      latencyDeltaMs: number;
      recallAtKDelta: number;
      mrrDelta: number;
      expectedChunkScoreDelta: number;
      persistenceAdvantage: "pgvector" | "memory" | "tie";
    };
  };
};

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataset = await readDatasetEntry(repoRoot, options.datasetId);
const rawText = await readFile(resolve(repoRoot, "datasets", dataset.path), "utf-8");
verifyChecksum(dataset, Buffer.from(rawText));

const golden = (JSON.parse(
  await readFile(resolve(repoRoot, "datasets/golden/phase-5-retrieval.json"), "utf-8")
) as GoldenDataset).entries.filter((entry) => entry.document_ref === options.datasetId);

if (golden.length === 0) {
  throw new Error(`No golden entries found for dataset \"${options.datasetId}\".`);
}

const document = await ingest({
  type: dataset.modality,
  content: rawText,
  metadata: {
    ...dataset.metadata,
    datasetId: dataset.id,
    datasetSource: dataset.source,
    datasetLicense: dataset.license,
  },
});

const index = await buildRetrievalIndex(document, {
  embeddingProvider: new RagCliLexicalEmbeddingProvider({ name: "benchmark-lexical" }),
  store: new InMemoryVectorStore(),
});

const memoryMetrics = await runMemoryBenchmark(index, golden, options.topK);
const pgvectorMetrics = await runPgvectorBenchmark(index, golden, options.topK, options.tableName);

const output: BenchmarkOutput = {
  timestamp: new Date().toISOString(),
  version: 1,
  description:
    "Retrieval backend benchmark comparing in-memory VectorStore versus pgvector on Phase 5 golden queries, including persistence behavior after restart.",
  dataset: options.datasetId,
  topK: options.topK,
  goldenSize: golden.length,
  pgvectorTable: options.tableName,
  postgresConnectionConfigured: Boolean(resolvePgConnectionString()),
  results: {
    memory: memoryMetrics,
    pgvector: pgvectorMetrics,
    comparison: {
      latencyDeltaMs: round(pgvectorMetrics.avgLatencyMs - memoryMetrics.avgLatencyMs),
      recallAtKDelta: round(pgvectorMetrics.recallAtK - memoryMetrics.recallAtK),
      mrrDelta: round(pgvectorMetrics.meanReciprocalRank - memoryMetrics.meanReciprocalRank),
      expectedChunkScoreDelta: round(
        pgvectorMetrics.avgExpectedChunkScore - memoryMetrics.avgExpectedChunkScore
      ),
      persistenceAdvantage: resolvePersistenceWinner(memoryMetrics, pgvectorMetrics),
    },
  },
};

const outPath = resolve(
  repoRoot,
  "datasets/golden/baselines/phase-6-retrieval-backend-benchmark.json"
);
await writeFile(outPath, JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));

async function runMemoryBenchmark(
  index: RetrievalIndex,
  golden: GoldenEntry[],
  topK: number
): Promise<BackendMetrics> {
  const measurements: number[] = [];
  let hits = 0;
  let top1Hits = 0;
  let rrTotal = 0;
  let expectedChunkScoreTotal = 0;

  for (const entry of golden) {
    const queryEmbedding = (await index.embeddingProvider.embedTexts([entry.question]))[0] ?? [];
    const started = performance.now();
    const results = index.store.search({ embedding: queryEmbedding, topK });
    measurements.push(performance.now() - started);

    const expectedChunkId = entry.expected_chunk_ids[0] ?? "";
    const rank = getRank(results, expectedChunkId);

    if (rank !== null) {
      hits += 1;
      rrTotal += 1 / rank;
      if (rank === 1) {
        top1Hits += 1;
      }
    }

    expectedChunkScoreTotal += findExpectedChunkScore(results, expectedChunkId);
  }

  return {
    backend: "memory",
    available: true,
    totalQueries: golden.length,
    successfulRetrievals: hits,
    recallAtK: round(hits / golden.length),
    top1Recall: round(top1Hits / golden.length),
    meanReciprocalRank: round(rrTotal / golden.length),
    avgExpectedChunkScore: round(expectedChunkScoreTotal / golden.length),
    avgLatencyMs: round(mean(measurements)),
    p95LatencyMs: round(percentile(measurements, 95)),
    persistenceAfterRestart: {
      supported: false,
      retainedRecallAtK: 0,
      passed: true,
      note: "In-memory backend is expected to lose data on restart.",
    },
  };
}

async function runPgvectorBenchmark(
  index: RetrievalIndex,
  golden: GoldenEntry[],
  topK: number,
  tableName: string
): Promise<BackendMetrics> {
  const connectionString = resolvePgConnectionString();
  if (!connectionString) {
    return unavailablePgvector("DATABASE_URL (or POSTGRES_* vars) is not configured.");
  }

  let pgModule: {
    Client: new (options: { connectionString: string }) => {
      connect(): Promise<unknown>;
      end(): Promise<unknown>;
      query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
    };
  };
  try {
    pgModule = (await import("pg")) as unknown as {
      Client: new (options: { connectionString: string }) => {
        connect(): Promise<unknown>;
        end(): Promise<unknown>;
        query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
      };
    };
  } catch {
    return unavailablePgvector("Package 'pg' is not installed in the current workspace runtime.");
  }

  const safeTable = normalizeTableName(tableName);
  const client = new pgModule.Client({ connectionString });
  await client.connect();

  try {
    const store = await createVectorStore({
      connect: async () => toPgClientAdapter(client),
      tableName: safeTable,
      dimensions: index.embeddingProvider.dimensions,
      defaultTopK: topK,
    });

    if (!(store instanceof PgvectorVectorStore)) {
      return unavailablePgvector(
        "Could not initialize pgvector backend (extension unavailable or connection failed)."
      );
    }

    await client.query(`TRUNCATE ${safeTable}`);
    await store.insertAsync(index.embeddedChunks);

    const preRestart = await evaluatePgvector(index, store, golden, topK);

    // Reconnect and query again to validate persistence.
    const clientAfterRestart = new pgModule.Client({ connectionString });
    await clientAfterRestart.connect();
    try {
      const storeAfterRestart = await createVectorStore({
        connect: async () => toPgClientAdapter(clientAfterRestart),
        tableName: safeTable,
        dimensions: index.embeddingProvider.dimensions,
        defaultTopK: topK,
      });

      if (!(storeAfterRestart instanceof PgvectorVectorStore)) {
        return unavailablePgvector("Reopen check failed; pgvector store unavailable after restart.");
      }

      const postRestart = await evaluatePgvector(index, storeAfterRestart, golden, topK);
      const retainedRecall = postRestart.recallAtK;

      return {
        ...preRestart,
        persistenceAfterRestart: {
          supported: true,
          retainedRecallAtK: retainedRecall,
          passed: retainedRecall >= preRestart.recallAtK,
          note:
            retainedRecall >= preRestart.recallAtK
              ? "Recall was retained after reconnect."
              : "Recall dropped after reconnect; inspect pgvector schema/index setup.",
        },
      };
    } finally {
      await clientAfterRestart.end();
    }
  } catch (error) {
    return unavailablePgvector(error instanceof Error ? error.message : "Unknown pgvector error.");
  } finally {
    await client.end();
  }
}

async function evaluatePgvector(
  index: RetrievalIndex,
  store: PgvectorVectorStore,
  golden: GoldenEntry[],
  topK: number
): Promise<BackendMetrics> {
  const measurements: number[] = [];
  let hits = 0;
  let top1Hits = 0;
  let rrTotal = 0;
  let expectedChunkScoreTotal = 0;

  for (const entry of golden) {
    const queryEmbedding = (await index.embeddingProvider.embedTexts([entry.question]))[0] ?? [];
    const started = performance.now();
    const results = await store.searchAsync({ embedding: queryEmbedding, topK });
    measurements.push(performance.now() - started);

    const expectedChunkId = entry.expected_chunk_ids[0] ?? "";
    const rank = getRank(results, expectedChunkId);

    if (rank !== null) {
      hits += 1;
      rrTotal += 1 / rank;
      if (rank === 1) {
        top1Hits += 1;
      }
    }

    expectedChunkScoreTotal += findExpectedChunkScore(results, expectedChunkId);
  }

  return {
    backend: "pgvector",
    available: true,
    totalQueries: golden.length,
    successfulRetrievals: hits,
    recallAtK: round(hits / golden.length),
    top1Recall: round(top1Hits / golden.length),
    meanReciprocalRank: round(rrTotal / golden.length),
    avgExpectedChunkScore: round(expectedChunkScoreTotal / golden.length),
    avgLatencyMs: round(mean(measurements)),
    p95LatencyMs: round(percentile(measurements, 95)),
    persistenceAfterRestart: {
      supported: true,
      retainedRecallAtK: 0,
      passed: false,
      note: "Filled after reconnect validation.",
    },
  };
}

function unavailablePgvector(reason: string): BackendMetrics {
  return {
    backend: "pgvector",
    available: false,
    reasonUnavailable: reason,
    totalQueries: 0,
    successfulRetrievals: 0,
    recallAtK: 0,
    top1Recall: 0,
    meanReciprocalRank: 0,
    avgExpectedChunkScore: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    persistenceAfterRestart: {
      supported: true,
      retainedRecallAtK: 0,
      passed: false,
      note: "Skipped because pgvector was unavailable.",
    },
  };
}

function getRank(results: VectorSearchResult[], expectedChunkId: string): number | null {
  if (!expectedChunkId) {
    return null;
  }
  const index = results.findIndex((result) => result.chunk.id === expectedChunkId);
  if (index < 0) {
    return null;
  }
  return index + 1;
}

function findExpectedChunkScore(results: VectorSearchResult[], expectedChunkId: string): number {
  return results.find((result) => result.chunk.id === expectedChunkId)?.score ?? 0;
}

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  const index = Math.min(Math.max(rank, 0), sorted.length - 1);
  return sorted[index] ?? 0;
}

function round(value: number, precision = 6): number {
  return Number(value.toFixed(precision));
}

function resolvePersistenceWinner(
  memory: BackendMetrics,
  pgvector: BackendMetrics
): "pgvector" | "memory" | "tie" {
  const memoryRetains = memory.persistenceAfterRestart.supported
    ? memory.persistenceAfterRestart.passed
    : false;
  const pgRetains = pgvector.persistenceAfterRestart.passed;

  if (pgRetains && !memoryRetains) {
    return "pgvector";
  }
  if (!pgRetains && memoryRetains) {
    return "memory";
  }
  return "tie";
}

function toPgClientAdapter(client: {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}): PgClient {
  return {
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      const result = await client.query(sql, params);
      return { rows: result.rows as T[] };
    },
    end: async () => {
      // No-op: benchmark controls connection lifecycle explicitly.
    },
  };
}

function normalizeTableName(raw: string): string {
  const candidate = raw.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(candidate)) {
    throw new Error(
      `Invalid table name \"${raw}\". Use letters, digits, and underscore only.`
    );
  }
  return candidate;
}

function resolvePgConnectionString(): string | null {
  const explicit = process.env.DATABASE_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const host = process.env.POSTGRES_HOST?.trim();
  const db = process.env.POSTGRES_DB?.trim();
  const user = process.env.POSTGRES_USER?.trim();
  if (!host || !db || !user) {
    return null;
  }

  const password = process.env.POSTGRES_PASSWORD?.trim() ?? "";
  const port = process.env.POSTGRES_PORT?.trim() || "5432";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

function parseArgs(args: string[]): CliOptions {
  let datasetId = DEFAULT_DATASET_ID;
  let topK = DEFAULT_TOP_K;
  let tableName = DEFAULT_TABLE;
  let help = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--dataset" || arg === "-d") {
      datasetId = requireCliValue(args, i, arg, "[benchmark-backends]");
      i += 1;
      continue;
    }
    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, i, arg, "[benchmark-backends]"),
        "--top-k",
        "[benchmark-backends]"
      );
      i += 1;
      continue;
    }
    if (arg === "--table" || arg === "-t") {
      tableName = requireCliValue(args, i, arg, "[benchmark-backends]");
      i += 1;
      continue;
    }
    if (arg?.startsWith("-")) {
      throw new Error(`[benchmark-backends] Unknown option \"${arg}\".`);
    }
  }

  return {
    datasetId,
    topK,
    tableName,
    help,
  };
}

async function readDatasetEntry(repoRoot: string, datasetId: string): Promise<DatasetEntry> {
  const registry = JSON.parse(
    await readFile(resolve(repoRoot, "datasets/registry.json"), "utf-8")
  ) as DatasetRegistry;
  const dataset = registry.datasets.find((entry) => entry.id === datasetId);
  if (!dataset) {
    throw new Error(`Dataset \"${datasetId}\" not found in datasets/registry.json.`);
  }
  return dataset;
}

function verifyChecksum(dataset: DatasetEntry, rawBytes: Buffer): void {
  if (!dataset.sha256) {
    return;
  }
  const actual = createHash("sha256").update(rawBytes).digest("hex");
  if (actual !== dataset.sha256) {
    throw new Error(
      `Dataset checksum mismatch for \"${dataset.id}\": expected ${dataset.sha256}, got ${actual}.`
    );
  }
}

function printHelp(): void {
  console.log(`Usage: npm run benchmark:retrieval:backends -- [options]

Options:
  --dataset, -d <id>   Dataset ID from datasets/registry.json (default: ${DEFAULT_DATASET_ID})
  --top-k, -k <n>      Retrieval topK (default: ${DEFAULT_TOP_K})
  --table, -t <name>   pgvector benchmark table (default: ${DEFAULT_TABLE})
  --help, -h           Show this help

Environment:
  DATABASE_URL (preferred) or POSTGRES_HOST/POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD

Output:
  datasets/golden/baselines/phase-6-retrieval-backend-benchmark.json
`);
}

