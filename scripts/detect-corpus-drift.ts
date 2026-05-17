import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "../packages/etl/src/index";
import { buildRetrievalIndex, retrieveForDevMode } from "../packages/rag/src/index";
import { TraceStore } from "../apps/api/src/observability/trace-store";
import {
  createCorpusDriftReport,
  type CorpusDriftSnapshot,
} from "../apps/api/src/retrieval-reliability";
import {
  RagCliLexicalEmbeddingProvider,
  parsePositiveInteger,
  requireCliValue,
} from "./rag-cli-utils";

const DEFAULT_DATASET_ID = "phase-5-retrieval-text";
const DEFAULT_TOP_K = 3;
const DEFAULT_SNAPSHOT_PATH = "datasets/golden/baselines/retrieval-drift-snapshot.json";
const DEFAULT_REPORT_PATH = "datasets/golden/baselines/retrieval-drift-report.json";

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
  snapshotPath: string;
  reportPath: string;
  help: boolean;
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

const goldenPath = resolve(
  repoRoot,
  options.datasetId === "phase-0-smoke-text"
    ? "datasets/golden/phase-0-baseline.json"
    : "datasets/golden/phase-5-retrieval.json"
);
const golden = (JSON.parse(await readFile(goldenPath, "utf-8")) as GoldenDataset).entries.filter(
  (entry) => entry.document_ref === options.datasetId
);

if (golden.length === 0) {
  throw new Error(`[detect-corpus-drift] No golden entries found for "${options.datasetId}".`);
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
  embeddingProvider: new RagCliLexicalEmbeddingProvider({
    name: "corpus-drift-lexical",
  }),
});

const currentSnapshot: CorpusDriftSnapshot = {
  version: "v1",
  createdAt: new Date().toISOString(),
  dataset: dataset.id,
  topK: options.topK,
  queries: [],
};

for (const entry of golden) {
  const retrieved = await retrieveForDevMode(index, entry.question, {
    topK: options.topK,
    mode: "hybrid",
  });
  const retrievedChunkIds = retrieved.results.map((item) => item.chunkId);
  const expectedChunkIds = entry.expected_chunk_ids;
  const relevantHits = expectedChunkIds.filter((chunkId) => retrievedChunkIds.includes(chunkId));
  const rankOfExpected = (() => {
    const firstExpected = expectedChunkIds[0];
    if (!firstExpected) {
      return null;
    }
    const indexFound = retrievedChunkIds.indexOf(firstExpected);
    return indexFound >= 0 ? indexFound + 1 : null;
  })();

  currentSnapshot.queries.push({
    id: entry.id,
    question: entry.question,
    expectedChunkIds,
    retrievedChunkIds,
    recallAtK: round(relevantHits.length / Math.max(1, expectedChunkIds.length), 3),
    rankOfExpected,
    topScore: round(retrieved.results[0]?.score ?? 0, 3),
  });
}

const snapshotPath = resolve(repoRoot, options.snapshotPath);
const previousSnapshot = await tryReadJson<CorpusDriftSnapshot>(snapshotPath);
const report = createCorpusDriftReport({
  dataset: dataset.id,
  previous: previousSnapshot,
  current: currentSnapshot,
});

const reportPath = resolve(repoRoot, options.reportPath);
await mkdir(dirname(snapshotPath), { recursive: true });
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(snapshotPath, JSON.stringify(currentSnapshot, null, 2));
await writeFile(reportPath, JSON.stringify(report, null, 2));

await new TraceStore().append({
  version: "v1",
  timestamp: new Date().toISOString(),
  component: "eval",
  operation: "rag.corpus-drift",
  status: report.summary.degraded ? "error" : "success",
  correlation: {},
  metadata: {
    dataset: dataset.id,
    regressions: report.summary.regressions,
    improvements: report.summary.improvements,
    missingRelevantChunks: report.summary.missingRelevantChunks,
    degraded: report.summary.degraded,
    affectedQueries: report.queries.filter((query) => query.status === "regressed").map((query) => query.id),
  },
});

console.log(JSON.stringify(report, null, 2));

function parseArgs(args: string[]): CliOptions {
  let datasetId = DEFAULT_DATASET_ID;
  let topK = DEFAULT_TOP_K;
  let snapshotPath = DEFAULT_SNAPSHOT_PATH;
  let reportPath = DEFAULT_REPORT_PATH;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--dataset" || arg === "-d") {
      datasetId = requireCliValue(args, index, arg, "[detect-corpus-drift]");
      index += 1;
      continue;
    }

    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, index, arg, "[detect-corpus-drift]"),
        "--top-k",
        "[detect-corpus-drift]"
      );
      index += 1;
      continue;
    }

    if (arg === "--snapshot") {
      snapshotPath = requireCliValue(args, index, arg, "[detect-corpus-drift]");
      index += 1;
      continue;
    }

    if (arg === "--report") {
      reportPath = requireCliValue(args, index, arg, "[detect-corpus-drift]");
      index += 1;
      continue;
    }

    throw new Error(`[detect-corpus-drift] Unknown option "${arg}". Use --help for usage.`);
  }

  return {
    datasetId,
    topK,
    snapshotPath,
    reportPath,
    help,
  };
}

async function readDatasetEntry(root: string, datasetId: string): Promise<DatasetEntry> {
  const registry = JSON.parse(
    await readFile(resolve(root, "datasets/registry.json"), "utf-8")
  ) as DatasetRegistry;
  const dataset = registry.datasets.find((entry) => entry.id === datasetId);

  if (!dataset) {
    throw new Error(`[detect-corpus-drift] Dataset "${datasetId}" was not found.`);
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
      `[detect-corpus-drift] Dataset checksum mismatch for "${dataset.id}". Expected ${dataset.sha256}, received ${actual}.`
    );
  }
}

async function tryReadJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf-8")) as T;
  } catch {
    return undefined;
  }
}

function round(value: number, decimals = 6): number {
  return Number(value.toFixed(decimals));
}

function printHelp(): void {
  console.log(`Usage: npm run benchmark:drift -- [options]

Options:
  --dataset, -d <id>  Dataset ID from datasets/registry.json
  --top-k, -k <n>     Number of chunks to retrieve (default: ${DEFAULT_TOP_K})
  --snapshot <path>   Snapshot path (default: ${DEFAULT_SNAPSHOT_PATH})
  --report <path>     Drift report path (default: ${DEFAULT_REPORT_PATH})
  --help, -h          Show this help
`);
}
