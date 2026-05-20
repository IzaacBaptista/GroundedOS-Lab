import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "../packages/etl/src/index";
import {
  buildRetrievalIndex,
  retrieveForDevMode,
  type RetrievalDevModeOutput,
  type RetrievalMode,
} from "../packages/rag/src/index";
import {
  FaithfulnessEvaluator,
  RecallEvaluator,
  RelevanceEvaluator,
} from "../packages/evals/src/index";
import { TraceStore } from "../apps/api/src/observability/trace-store";
import {
  createPromptPolicyDiffReport,
  type PromptPolicyVariantRun,
} from "../apps/api/src/retrieval-reliability";
import {
  RagCliLexicalEmbeddingProvider,
  parsePositiveInteger,
  requireCliValue,
} from "./rag-cli-utils";

const DEFAULT_DATASET_ID = "phase-5-retrieval-text";
const DEFAULT_TOP_K = 3;
const DEFAULT_OUTPUT_PATH = "datasets/golden/baselines/prompt-policy-diff-report.json";

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
  expected_answer_contains: string[];
  expected_chunk_ids: string[];
};

type CliOptions = {
  datasetId: string;
  topK: number;
  outputPath: string;
  help: boolean;
};

type VariantConfig = {
  id: string;
  description: string;
  retrievalMode: RetrievalMode;
  render(input: {
    question: string;
    retrieved: RetrievalDevModeOutput;
  }): string;
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataset = await readDatasetEntry(repoRoot, options.datasetId);
const datasetPath = resolve(repoRoot, "datasets", dataset.path);
const rawText = await readFile(datasetPath, "utf-8");
verifyChecksum(dataset, Buffer.from(rawText));

const goldenPath = resolve(
  repoRoot,
  options.datasetId === "phase-0-smoke-text"
    ? "datasets/golden/phase-0-baseline.json"
    : "datasets/golden/phase-5-retrieval.json"
);
const golden = JSON.parse(await readFile(goldenPath, "utf-8")) as GoldenDataset;
const goldenQueries = golden.entries.filter((entry) => entry.document_ref === dataset.id);

if (goldenQueries.length === 0) {
  throw new Error(`[prompt-policy-diff] No golden entries found for dataset "${dataset.id}".`);
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
    name: "prompt-policy-diff-lexical",
  }),
});

const variants = createVariants();
const runs: PromptPolicyVariantRun[] = [];

for (const variant of variants) {
  runs.push(await runVariant(variant, goldenQueries));
}

const report = createPromptPolicyDiffReport({
  dataset: dataset.id,
  runs,
});

const outputPath = resolve(repoRoot, options.outputPath);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));

await new TraceStore().append({
  version: "v1",
  timestamp: new Date().toISOString(),
  component: "eval",
  operation: "rag.prompt-policy-diff",
  status: "success",
  metadata: {
    dataset: dataset.id,
    variants: report.comparedVariants,
    winner: report.winner,
    recommendation: report.recommendation,
    regressions: report.regressions,
    improvements: report.improvements,
  },
  correlation: {},
});

console.log(JSON.stringify(report, null, 2));

async function runVariant(
  variant: VariantConfig,
  entries: GoldenEntry[]
): Promise<PromptPolicyVariantRun> {
  const perQuery: PromptPolicyVariantRun["perQuery"] = [];

  for (const entry of entries) {
    const started = performance.now();
    const retrieved = await retrieveForDevMode(index, entry.question, {
      topK: options.topK,
      mode: variant.retrievalMode,
    });
    const answer = variant.render({ question: entry.question, retrieved });
    const latencyMs = performance.now() - started;
    const retrievedChunks = retrieved.results.map((result) => ({
      chunkId: result.chunkId,
      text: result.text,
      score: result.score,
    }));
    const [faithfulness, relevance, recall] = await Promise.all([
      new FaithfulnessEvaluator().evaluate({
        question: entry.question,
        answer,
        retrievedChunks,
        expectedChunkIds: entry.expected_chunk_ids,
      }),
      new RelevanceEvaluator().evaluate({
        question: entry.question,
        answer,
        retrievedChunks,
        expectedChunkIds: entry.expected_chunk_ids,
      }),
      new RecallEvaluator(options.topK).evaluate({
        question: entry.question,
        answer,
        retrievedChunks,
        expectedChunkIds: entry.expected_chunk_ids,
      }),
    ]);
    const quality = round(
      faithfulness.score * 0.4 + relevance.score * 0.35 + recall.score * 0.25,
      4
    );
    const refused = answer.toLowerCase().includes("does not contain an answer");

    perQuery.push({
      id: entry.id,
      question: entry.question,
      answer,
      retrievedChunkIds: retrieved.results.map((result) => result.chunkId),
      scores: {
        faithfulness: faithfulness.score,
        relevance: relevance.score,
        recall: recall.score,
        quality,
        groundedness: faithfulness.score,
        confidenceScore: quality,
      },
      latencyMs: round(latencyMs, 4),
      costUsd: 0,
      refused,
    });
  }

  return {
    variant: variant.id,
    description: variant.description,
    metrics: summarizeVariant(perQuery),
    perQuery,
  };
}

function createVariants(): VariantConfig[] {
  return [
    {
      id: "baseline-hybrid",
      description: "Hybrid retrieval with a concise grounded answer.",
      retrievalMode: "hybrid",
      render({ retrieved }) {
        return retrieved.results[0]?.text ?? "The retrieved context does not contain an answer.";
      },
    },
    {
      id: "strict-grounding-policy",
      description: "Hybrid retrieval plus explicit refusal when evidence is weak.",
      retrievalMode: "hybrid",
      render({ retrieved }) {
        const top = retrieved.results[0];
        if (!top || top.score < 0.3) {
          return "The retrieved context does not contain an answer.";
        }
        return `Based only on retrieved evidence: ${top.text}`;
      },
    },
    {
      id: "dense-retrieval-baseline",
      description: "Dense-only retrieval under the same answer policy.",
      retrievalMode: "dense",
      render({ retrieved }) {
        return retrieved.results[0]?.text ?? "The retrieved context does not contain an answer.";
      },
    },
  ];
}

function summarizeVariant(
  perQuery: PromptPolicyVariantRun["perQuery"]
): PromptPolicyVariantRun["metrics"] {
  return {
    sampleSize: perQuery.length,
    avgFaithfulness: round(avg(perQuery.map((query) => query.scores.faithfulness)), 4),
    avgRelevance: round(avg(perQuery.map((query) => query.scores.relevance)), 4),
    avgRecall: round(avg(perQuery.map((query) => query.scores.recall)), 4),
    avgQuality: round(avg(perQuery.map((query) => query.scores.quality)), 4),
    avgGroundedness: round(avg(perQuery.map((query) => query.scores.groundedness ?? 0)), 4),
    avgConfidenceScore: round(avg(perQuery.map((query) => query.scores.confidenceScore ?? 0)), 4),
    avgLatencyMs: round(avg(perQuery.map((query) => query.latencyMs ?? 0)), 4),
    avgCostUsd: round(avg(perQuery.map((query) => query.costUsd ?? 0)), 6),
    refusalRate: round(
      perQuery.filter((query) => query.refused).length / Math.max(1, perQuery.length),
      4
    ),
    stability: 1,
  };
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, decimals = 6): number {
  return Number(value.toFixed(decimals));
}

function parseArgs(args: string[]): CliOptions {
  let datasetId = DEFAULT_DATASET_ID;
  let topK = DEFAULT_TOP_K;
  let outputPath = DEFAULT_OUTPUT_PATH;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--dataset" || arg === "-d") {
      datasetId = requireCliValue(args, index, arg, "[prompt-policy-diff]");
      index += 1;
      continue;
    }

    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, index, arg, "[prompt-policy-diff]"),
        "--top-k",
        "[prompt-policy-diff]"
      );
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      outputPath = requireCliValue(args, index, arg, "[prompt-policy-diff]");
      index += 1;
      continue;
    }

    throw new Error(`[prompt-policy-diff] Unknown option "${arg}". Use --help for usage.`);
  }

  return {
    datasetId,
    topK,
    outputPath,
    help,
  };
}

async function readDatasetEntry(root: string, datasetId: string): Promise<DatasetEntry> {
  const registry = JSON.parse(
    await readFile(resolve(root, "datasets/registry.json"), "utf-8")
  ) as DatasetRegistry;
  const dataset = registry.datasets.find((entry) => entry.id === datasetId);

  if (!dataset) {
    throw new Error(`[prompt-policy-diff] Dataset "${datasetId}" was not found.`);
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
      `[prompt-policy-diff] Dataset checksum mismatch for "${dataset.id}". Expected ${dataset.sha256}, received ${actual}.`
    );
  }
}

function printHelp(): void {
  console.log(`Usage: npm run experiment:prompts:diff -- [options]

Options:
  --dataset, -d <id>   Dataset ID from datasets/registry.json
  --top-k, -k <n>      Number of chunks to retrieve (default: ${DEFAULT_TOP_K})
  --output, -o <path>  Output artifact path (default: ${DEFAULT_OUTPUT_PATH})
  --help, -h           Show this help
`);
}
