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
} from "../packages/rag/src/index";
import {
  FaithfulnessEvaluator,
  RecallEvaluator,
  RelevanceEvaluator,
} from "../packages/evals/src/index";
import {
  RagCliLexicalEmbeddingProvider,
  parsePositiveInteger,
  requireCliValue,
} from "./rag-cli-utils";

const DEFAULT_DATASET_ID = "phase-0-smoke-text";
const DEFAULT_TOP_K = 3;
const DEFAULT_OUTPUT_PATH = "datasets/golden/baselines/phase-4-ab-prompt-test.json";
const CONFIDENCE_LEVEL = 0.95;
const Z_95 = 1.96;

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

type PromptVariant = {
  id: string;
  description: string;
  render(input: {
    question: string;
    retrieved: RetrievalDevModeOutput;
  }): string;
};

type VariantRun = {
  variant: string;
  description: string;
  metrics: {
    sampleSize: number;
    avgFaithfulness: number;
    avgRelevance: number;
    avgRecall: number;
    avgQuality: number;
    expectedAnswerHitRate: number;
  };
  perQuery: QueryRun[];
};

type QueryRun = {
  id: string;
  question: string;
  answer: string;
  expectedAnswerContains: string[];
  expectedAnswerHit: boolean;
  retrievedChunkIds: string[];
  scores: {
    faithfulness: number;
    relevance: number;
    recall: number;
    quality: number;
  };
};

type AbArtifact = {
  timestamp: string;
  version: 1;
  phase: "phase-4";
  description: string;
  dataset: string;
  topK: number;
  variants: VariantRun[];
  statisticalSummary: {
    confidenceLevel: number;
    sampleSizePerVariant: number;
    winner: string;
    runnerUp: string;
    qualityDifference: number;
    confidenceInterval95: {
      lower: number;
      upper: number;
    };
    statisticallyConclusive: boolean;
    note: string;
  };
  successCriteria: {
    ranAtLeastTwoVariants: boolean;
    reportsWinner: boolean;
    reportsConfidenceInterval: boolean;
    phase4AbPromptTestPassed: boolean;
  };
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

const golden = JSON.parse(
  await readFile(resolve(repoRoot, "datasets/golden/phase-0-baseline.json"), "utf-8")
) as GoldenDataset;
const goldenQueries = golden.entries.filter((entry) => entry.document_ref === dataset.id);

if (goldenQueries.length === 0) {
  throw new Error(`[ab-test-prompts] No golden entries found for dataset "${dataset.id}".`);
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
    name: "phase-4-ab-test-lexical",
  }),
});
const variants = createPromptVariants();
const runs = [];

for (const variant of variants) {
  runs.push(await runVariant(variant, goldenQueries));
}

const ranked = [...runs].sort((left, right) => {
  if (right.metrics.avgQuality !== left.metrics.avgQuality) {
    return right.metrics.avgQuality - left.metrics.avgQuality;
  }

  return right.metrics.expectedAnswerHitRate - left.metrics.expectedAnswerHitRate;
});
const winner = ranked[0];
const runnerUp = ranked[1];

if (!winner || !runnerUp) {
  throw new Error("[ab-test-prompts] At least two prompt variants are required.");
}

const difference = roundMetric(winner.metrics.avgQuality - runnerUp.metrics.avgQuality, 4);
const confidenceInterval = pairedDifferenceConfidenceInterval(winner, runnerUp);
const artifact: AbArtifact = {
  timestamp: new Date().toISOString(),
  version: 1,
  phase: "phase-4",
  description:
    "Automatic A/B prompt test over the golden dataset using deterministic local answer variants and the Phase 3 evaluators.",
  dataset: dataset.id,
  topK: options.topK,
  variants: runs,
  statisticalSummary: {
    confidenceLevel: CONFIDENCE_LEVEL,
    sampleSizePerVariant: goldenQueries.length,
    winner: winner.variant,
    runnerUp: runnerUp.variant,
    qualityDifference: difference,
    confidenceInterval95: confidenceInterval,
    statisticallyConclusive:
      confidenceInterval.lower > 0 || confidenceInterval.upper < 0,
    note:
      goldenQueries.length < 2
        ? "The current golden dataset has one query, so the winner is reported but the confidence interval is not statistically conclusive. Add more golden entries before treating this as a stable product decision."
        : "Confidence interval is computed from paired per-query quality differences.",
  },
  successCriteria: {
    ranAtLeastTwoVariants: runs.length >= 2,
    reportsWinner: winner.variant.length > 0,
    reportsConfidenceInterval: Number.isFinite(confidenceInterval.lower) && Number.isFinite(confidenceInterval.upper),
    phase4AbPromptTestPassed: runs.length >= 2 && winner.variant.length > 0,
  },
};

const outputPath = resolve(repoRoot, options.outputPath);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(artifact, null, 2));

async function runVariant(
  variant: PromptVariant,
  entries: GoldenEntry[]
): Promise<VariantRun> {
  const perQuery: QueryRun[] = [];

  for (const entry of entries) {
    const retrieved = await retrieveForDevMode(index, entry.question, {
      topK: options.topK,
      mode: "hybrid",
    });
    const answer = variant.render({ question: entry.question, retrieved });
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
    const quality = roundMetric(
      faithfulness.score * 0.4 + relevance.score * 0.4 + recall.score * 0.2,
      4
    );

    perQuery.push({
      id: entry.id,
      question: entry.question,
      answer,
      expectedAnswerContains: entry.expected_answer_contains,
      expectedAnswerHit: containsExpected(answer, entry.expected_answer_contains),
      retrievedChunkIds: retrieved.results.map((result) => result.chunkId),
      scores: {
        faithfulness: faithfulness.score,
        relevance: relevance.score,
        recall: recall.score,
        quality,
      },
    });
  }

  return {
    variant: variant.id,
    description: variant.description,
    metrics: summarizeVariant(perQuery),
    perQuery,
  };
}

function createPromptVariants(): PromptVariant[] {
  return [
    {
      id: "concise-grounded",
      description: "Short answer that only states the top retrieved fact.",
      render({ retrieved }) {
        const topChunk = retrieved.results[0]?.text;
        return topChunk
          ? `Based on the retrieved context: ${topChunk}`
          : "The retrieved context does not contain an answer.";
      },
    },
    {
      id: "citation-focused",
      description: "Answer plus explicit source/chunk attribution.",
      render({ retrieved }) {
        const topChunk = retrieved.results[0];

        if (!topChunk) {
          return "The retrieved context does not contain an answer.";
        }

        return [
          `Based on the retrieved context: ${topChunk.text}`,
          `Source: ${topChunk.documentId} / ${topChunk.sectionId} / ${topChunk.chunkId}.`,
        ].join(" ");
      },
    },
    {
      id: "direct-answer",
      description: "Direct answer without explicit grounding language.",
      render({ retrieved }) {
        return retrieved.results[0]?.text ?? "No answer available.";
      },
    },
  ];
}

function summarizeVariant(perQuery: QueryRun[]): VariantRun["metrics"] {
  return {
    sampleSize: perQuery.length,
    avgFaithfulness: roundMetric(avg(perQuery.map((query) => query.scores.faithfulness)), 4),
    avgRelevance: roundMetric(avg(perQuery.map((query) => query.scores.relevance)), 4),
    avgRecall: roundMetric(avg(perQuery.map((query) => query.scores.recall)), 4),
    avgQuality: roundMetric(avg(perQuery.map((query) => query.scores.quality)), 4),
    expectedAnswerHitRate: roundMetric(
      perQuery.filter((query) => query.expectedAnswerHit).length / perQuery.length,
      4
    ),
  };
}

function pairedDifferenceConfidenceInterval(
  winner: VariantRun,
  runnerUp: VariantRun
): { lower: number; upper: number } {
  const runnerById = new Map(runnerUp.perQuery.map((query) => [query.id, query]));
  const differences = winner.perQuery
    .map((query) => query.scores.quality - (runnerById.get(query.id)?.scores.quality ?? 0))
    .filter((value) => Number.isFinite(value));
  const mean = avg(differences);

  if (differences.length < 2) {
    return {
      lower: roundMetric(mean, 4),
      upper: roundMetric(mean, 4),
    };
  }

  const variance =
    differences.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    (differences.length - 1);
  const standardError = Math.sqrt(variance) / Math.sqrt(differences.length);

  return {
    lower: roundMetric(mean - Z_95 * standardError, 4),
    upper: roundMetric(mean + Z_95 * standardError, 4),
  };
}

function containsExpected(answer: string, expected: string[]): boolean {
  const normalized = answer.toLowerCase();
  return expected.every((part) => normalized.includes(part.toLowerCase()));
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundMetric(value: number, decimals = 6): number {
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
      datasetId = requireCliValue(args, index, arg, "[ab-test-prompts]");
      index += 1;
      continue;
    }

    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, index, arg, "[ab-test-prompts]"),
        "--top-k",
        "[ab-test-prompts]"
      );
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      outputPath = requireCliValue(args, index, arg, "[ab-test-prompts]");
      index += 1;
      continue;
    }

    throw new Error(`[ab-test-prompts] Unknown option "${arg}". Use --help for usage.`);
  }

  return {
    datasetId,
    topK,
    outputPath,
    help,
  };
}

async function readDatasetEntry(
  root: string,
  datasetId: string
): Promise<DatasetEntry> {
  const registry = JSON.parse(
    await readFile(resolve(root, "datasets/registry.json"), "utf-8")
  ) as DatasetRegistry;
  const dataset = registry.datasets.find((entry) => entry.id === datasetId);

  if (!dataset) {
    throw new Error(`[ab-test-prompts] Dataset "${datasetId}" was not found.`);
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
      `[ab-test-prompts] Dataset checksum mismatch for "${dataset.id}". Expected ${dataset.sha256}, received ${actual}.`
    );
  }
}

function printHelp(): void {
  console.log(`Usage: npm run experiment:prompts -- [options]

Options:
  --dataset, -d <id>   Dataset ID from datasets/registry.json
  --top-k, -k <n>      Number of chunks to retrieve (default: ${DEFAULT_TOP_K})
  --output, -o <path>  Output artifact path (default: ${DEFAULT_OUTPUT_PATH})
  --help, -h           Show this help
`);
}
