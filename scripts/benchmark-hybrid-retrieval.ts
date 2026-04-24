import { createHash } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "../packages/etl/src/index";
import {
  buildRetrievalIndex,
  retrieveForDevMode,
  type RetrievalMode,
} from "../packages/rag/src/index";
import {
  RagCliLexicalEmbeddingProvider,
  parsePositiveInteger,
  requireCliValue,
} from "./rag-cli-utils";

const DEFAULT_DATASET_ID = "phase-0-smoke-text";
const DEFAULT_TOP_K = 3;

type DatasetRegistry = {
  datasets: DatasetEntry[];
};

type DatasetEntry = {
  id: string;
  name?: string;
  description?: string;
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
  expected_answer_contains: string[];
  expected_chunk_ids: string[];
  expected_sources: Array<{
    documentId: string;
    sectionId: string;
  }>;
  notes?: string;
};

type BenchmarkResult = {
  timestamp: string;
  version: 1;
  description: string;
  dataset: string;
  goldenSize: number;
  topK: number;
  modes: {
    denseOnly: ModeBenchmark;
    hybrid: ModeBenchmark;
    improvement: {
      top3RecallGain: number;
      avgScoreDense: number;
      avgScoreHybrid: number;
    };
  };
  perQuery: QueryBenchmark[];
};

type ModeBenchmark = {
  top3Recall: number;
  avgScore: number;
  totalQueries: number;
  successfulRetrievals: number;
};

type QueryBenchmark = {
  id: string;
  question: string;
  expectedChunkIds: string[];
  results: {
    denseOnly: {
      retrieved: string[];
      scores: number[];
      hit: boolean;
      rank: number | null;
    };
    hybrid: {
      retrieved: string[];
      scores: number[];
      hit: boolean;
      rank: number | null;
    };
  };
};

type CliOptions = {
  datasetId: string;
  topK: number;
  help: boolean;
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Load dataset and golden questions
const dataset = await readDatasetEntry(repoRoot, options.datasetId);
const filePath = resolve(repoRoot, "datasets", dataset.path);
const rawBytes = await readFile(filePath, "utf-8");

verifyChecksum(dataset, Buffer.from(rawBytes));

const docId = dataset.metadata.documentId;
const goldenPath = resolve(repoRoot, "datasets/golden/phase-0-baseline.json");
const goldenRaw = await readFile(goldenPath, "utf-8");
const golden = JSON.parse(goldenRaw) as GoldenDataset;

// Filter golden entries to this dataset
const goldenQueries = golden.entries.filter((e) => e.document_ref === options.datasetId);

if (goldenQueries.length === 0) {
  console.error(`No golden questions found for dataset "${options.datasetId}".`);
  process.exit(1);
}

// Ingest document
const document = await ingest({
  type: dataset.modality,
  content: rawBytes,
  metadata: {
    ...dataset.metadata,
    datasetId: dataset.id,
    datasetSource: dataset.source,
    datasetLicense: dataset.license,
  },
});

const index = await buildRetrievalIndex(document, {
  embeddingProvider: new RagCliLexicalEmbeddingProvider({ name: "benchmark-lexical" }),
});

// Run benchmark for each query with both modes
const perQuery: QueryBenchmark[] = [];
const denseMetrics = { hits: 0, totalScore: 0, count: 0 };
const hybridMetrics = { hits: 0, totalScore: 0, count: 0 };

for (const entry of goldenQueries) {
  const denseOutput = await retrieveForDevMode(index, entry.question, {
    topK: options.topK,
    mode: "dense" as RetrievalMode,
  });

  const hybridOutput = await retrieveForDevMode(index, entry.question, {
    topK: options.topK,
    mode: "hybrid" as RetrievalMode,
  });

  const denseChunks = denseOutput.results.map((r) => r.chunkId);
  const hybridChunks = hybridOutput.results.map((r) => r.chunkId);

  const expectedTarget = entry.expected_chunk_ids[0];

  const denseHit = denseChunks.includes(expectedTarget);
  const hybridHit = hybridChunks.includes(expectedTarget);

  const denseRank = denseChunks
    .findIndex((cid) => cid === expectedTarget)
    + 1 || null;
  const hybridRank = hybridChunks
    .findIndex((cid) => cid === expectedTarget)
    + 1 || null;

  const denseScores = denseOutput.results.slice(0, options.topK).map((r) => r.score);
  const hybridScores = hybridOutput.results.slice(0, options.topK).map((r) => r.score);

  perQuery.push({
    id: entry.id,
    question: entry.question,
    expectedChunkIds: entry.expected_chunk_ids,
    results: {
      denseOnly: {
        retrieved: denseChunks,
        scores: denseScores,
        hit: denseHit,
        rank: denseRank,
      },
      hybrid: {
        retrieved: hybridChunks,
        scores: hybridScores,
        hit: hybridHit,
        rank: hybridRank,
      },
    },
  });

  if (denseHit) {
    denseMetrics.hits += 1;
  }
  denseMetrics.totalScore += denseScores[0] ?? 0;
  denseMetrics.count += 1;

  if (hybridHit) {
    hybridMetrics.hits += 1;
  }
  hybridMetrics.totalScore += hybridScores[0] ?? 0;
  hybridMetrics.count += 1;
}

const denseTop3Recall = denseMetrics.count > 0 ? denseMetrics.hits / denseMetrics.count : 0;
const hybridTop3Recall = hybridMetrics.count > 0 ? hybridMetrics.hits / hybridMetrics.count : 0;

const result: BenchmarkResult = {
  timestamp: new Date().toISOString(),
  version: 1,
  description:
    "Comparison of dense-only vs hybrid retrieval on Phase 0 smoke dataset golden questions. Top-3 recall measures if expected chunk appears in top 3 results.",
  dataset: options.datasetId,
  goldenSize: goldenQueries.length,
  topK: options.topK,
  modes: {
    denseOnly: {
      top3Recall: Number(denseTop3Recall.toFixed(4)),
      avgScore: Number((denseMetrics.totalScore / denseMetrics.count).toFixed(6)),
      totalQueries: denseMetrics.count,
      successfulRetrievals: denseMetrics.hits,
    },
    hybrid: {
      top3Recall: Number(hybridTop3Recall.toFixed(4)),
      avgScore: Number((hybridMetrics.totalScore / hybridMetrics.count).toFixed(6)),
      totalQueries: hybridMetrics.count,
      successfulRetrievals: hybridMetrics.hits,
    },
    improvement: {
      top3RecallGain: Number((hybridTop3Recall - denseTop3Recall).toFixed(4)),
      avgScoreDense: Number((denseMetrics.totalScore / denseMetrics.count).toFixed(6)),
      avgScoreHybrid: Number((hybridMetrics.totalScore / hybridMetrics.count).toFixed(6)),
    },
  },
  perQuery,
};

// Write result to benchmark file
const benchmarkPath = resolve(
  repoRoot,
  "datasets/golden/baselines/phase-2-hybrid-benchmark.json"
);

await writeFile(benchmarkPath, JSON.stringify(result, null, 2));

console.log(JSON.stringify(result, null, 2));

function parseArgs(args: string[]): CliOptions {
  let datasetId = DEFAULT_DATASET_ID;
  let topK = DEFAULT_TOP_K;
  let help = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--dataset" || arg === "-d") {
      datasetId = requireCliValue(args, index, arg, "[benchmark-hybrid]");
      index += 1;
      continue;
    }

    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, index, arg, "[benchmark-hybrid]"),
        "--top-k",
        "[benchmark-hybrid]"
      );
      index += 1;
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`[benchmark-hybrid] Unknown option "${arg}". Use --help for usage.`);
    }

    positional.push(arg ?? "");
  }

  if (positional[0]) {
    datasetId = positional[0];
  }

  return {
    datasetId,
    topK,
    help,
  };
}

async function readDatasetEntry(
  repoRoot: string,
  datasetId: string
): Promise<DatasetEntry> {
  const registryPath = resolve(repoRoot, "datasets/registry.json");
  const registry = JSON.parse(
    await readFile(registryPath, "utf-8")
  ) as DatasetRegistry;
  const dataset = registry.datasets.find((entry) => entry.id === datasetId);

  if (!dataset) {
    throw new Error(
      `[benchmark-hybrid] Dataset "${datasetId}" was not found in datasets/registry.json.`
    );
  }

  return dataset;
}

function verifyChecksum(dataset: DatasetEntry, rawBytes: Buffer): void {
  if (!dataset.sha256) {
    return;
  }

  const actualChecksum = createHash("sha256").update(rawBytes).digest("hex");

  if (actualChecksum !== dataset.sha256) {
    throw new Error(
      `[benchmark-hybrid] Dataset checksum mismatch for "${dataset.id}". ` +
        `Expected ${dataset.sha256}, received ${actualChecksum}.`
    );
  }
}

function printHelp(): void {
  console.log(`Usage: npm run benchmark:hybrid -- [options]

Options:
  --dataset, -d <id>   Dataset ID from datasets/registry.json
  --top-k, -k <n>      Number of chunks to retrieve (default: ${DEFAULT_TOP_K})
  --help, -h           Show this help

Defaults:
  dataset: ${DEFAULT_DATASET_ID}
  topK:    ${DEFAULT_TOP_K}

Output: datasets/golden/baselines/phase-2-hybrid-benchmark.json
`);
}
