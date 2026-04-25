import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { loadLocalEnv } from "./load-env";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "../packages/etl/src/index";
import {
  buildRetrievalIndex,
  retrieveForDevMode,
  type RetrievalDevModeOutput,
} from "../packages/rag/src/index";
import {
  FaithfulnessEvaluator,
  RelevanceEvaluator,
} from "../packages/evals/src/index";
import {
  RagCliLexicalEmbeddingProvider,
  parsePositiveInteger,
  requireCliValue,
} from "./rag-cli-utils";

const DEFAULT_DATASET_ID = "phase-0-smoke-text";
const DEFAULT_TOP_K = 3;
const DEFAULT_PROVIDERS = ["local-extractive", "ollama", "openai"];
const DEFAULT_OUTPUT_PATH = "datasets/golden/baselines/phase-4-model-benchmark.json";
const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

loadLocalEnv();

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
  providers: string[];
  outputPath: string;
  help: boolean;
};

type ProviderStatus = "completed" | "skipped" | "error";

type ModelProvider = {
  id: string;
  kind: "local" | "ollama" | "cloud";
  model: string;
  isConfigured(): boolean;
  skipReason(): string | undefined;
  generate(input: ModelInput): Promise<ModelOutput>;
};

type ModelInput = {
  question: string;
  context: string;
  retrieved: RetrievalDevModeOutput;
  expectedAnswerContains: string[];
};

type ModelOutput = {
  answer: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

type ProviderRun = {
  provider: string;
  kind: ModelProvider["kind"];
  model: string;
  status: ProviderStatus;
  skippedReason?: string;
  error?: string;
  metrics: ProviderMetrics;
  perQuery: QueryRun[];
};

type ProviderMetrics = {
  requestCount: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgFaithfulness: number;
  avgRelevance: number;
  avgQuality: number;
  containsExpectedAnswerRate: number;
  avgCostUsd: number;
  totalCostUsd: number;
};

type QueryRun = {
  id: string;
  question: string;
  status: ProviderStatus;
  latencyMs: number;
  answer?: string;
  error?: string;
  expectedAnswerContains: string[];
  containsExpectedAnswer: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  costUsd: number;
  evals?: {
    faithfulness: number;
    relevance: number;
    quality: number;
  };
  retrievedChunkIds: string[];
};

type BenchmarkArtifact = {
  timestamp: string;
  version: 1;
  phase: "phase-4";
  description: string;
  dataset: string;
  goldenSize: number;
  topK: number;
  requestedProviders: string[];
  successCriteria: {
    atLeastTwoProvidersCompleted: boolean;
    includesLocalProvider: boolean;
    includesOllamaProvider: boolean;
    includesCloudProvider: boolean;
    phase4ModelBenchmarkPassed: boolean;
    note: string;
  };
  providers: ProviderRun[];
  summary: {
    completedProviders: string[];
    skippedProviders: string[];
    errorProviders: string[];
    bestByQuality?: string;
    bestByLatency?: string;
    bestByCost?: string;
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
  throw new Error(`[benchmark-models] No golden entries found for dataset "${dataset.id}".`);
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
    name: "phase-4-benchmark-lexical",
  }),
});
const providers = resolveProviders(options.providers);
const providerRuns: ProviderRun[] = [];

for (const provider of providers) {
  providerRuns.push(await runProvider(provider, goldenQueries, options.topK));
}

const completed = providerRuns.filter((run) => run.status === "completed");
const completedProviders = completed.map((run) => run.provider);
const skippedProviders = providerRuns
  .filter((run) => run.status === "skipped")
  .map((run) => run.provider);
const errorProviders = providerRuns
  .filter((run) => run.status === "error")
  .map((run) => run.provider);
const includesLocalProvider = completed.some((run) => run.kind === "local");
const includesOllamaProvider = completed.some((run) => run.provider === "ollama");
const includesCloudProvider = completed.some((run) => run.kind === "cloud");
const artifact: BenchmarkArtifact = {
  timestamp: new Date().toISOString(),
  version: 1,
  phase: "phase-4",
  description:
    "Phase 4 model/provider benchmark over the golden dataset. Local baseline always runs; Ollama and OpenAI run when configured through environment variables.",
  dataset: dataset.id,
  goldenSize: goldenQueries.length,
  topK: options.topK,
  requestedProviders: providers.map((provider) => provider.id),
  successCriteria: {
    atLeastTwoProvidersCompleted: completed.length >= 2,
    includesLocalProvider,
    includesOllamaProvider,
    includesCloudProvider,
    phase4ModelBenchmarkPassed: includesOllamaProvider && includesCloudProvider,
    note:
      "The roadmap target is satisfied only when Ollama generation and one cloud provider both complete. Without external config, this artifact records a local baseline and explicit skips.",
  },
  providers: providerRuns,
  summary: {
    completedProviders,
    skippedProviders,
    errorProviders,
    bestByQuality: bestProvider(completed, "avgQuality", "desc"),
    bestByLatency: bestProvider(completed, "avgLatencyMs", "asc"),
    bestByCost: bestProvider(completed, "avgCostUsd", "asc"),
  },
};

const outputPath = resolve(repoRoot, options.outputPath);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(artifact, null, 2));
console.log(JSON.stringify(artifact, null, 2));

async function runProvider(
  provider: ModelProvider,
  entries: GoldenEntry[],
  topK: number
): Promise<ProviderRun> {
  if (!provider.isConfigured()) {
    return {
      provider: provider.id,
      kind: provider.kind,
      model: provider.model,
      status: "skipped",
      skippedReason: provider.skipReason(),
      metrics: emptyMetrics(),
      perQuery: [],
    };
  }

  const perQuery: QueryRun[] = [];

  for (const entry of entries) {
    const retrieved = await retrieveForDevMode(index, entry.question, {
      topK,
      mode: "hybrid",
    });
    const context = retrieved.results.map((result) => result.text).join("\n\n");
    const startedAt = performance.now();

    try {
      const output = await provider.generate({
        question: entry.question,
        context,
        retrieved,
        expectedAnswerContains: entry.expected_answer_contains,
      });
      const latencyMs = Math.round(performance.now() - startedAt);
      const retrievedChunks = retrieved.results.map((result) => ({
        chunkId: result.chunkId,
        text: result.text,
        score: result.score,
      }));
      const [faithfulness, relevance] = await Promise.all([
        new FaithfulnessEvaluator().evaluate({
          question: entry.question,
          answer: output.answer,
          retrievedChunks,
          expectedChunkIds: entry.expected_chunk_ids,
        }),
        new RelevanceEvaluator().evaluate({
          question: entry.question,
          answer: output.answer,
          retrievedChunks,
          expectedChunkIds: entry.expected_chunk_ids,
        }),
      ]);
      const quality = roundMetric((faithfulness.score + relevance.score) / 2, 4);
      const costUsd = estimateCostUsd(provider.id, output.inputTokens, output.outputTokens);

      perQuery.push({
        id: entry.id,
        question: entry.question,
        status: "completed",
        latencyMs,
        answer: output.answer,
        expectedAnswerContains: entry.expected_answer_contains,
        containsExpectedAnswer: containsExpected(output.answer, entry.expected_answer_contains),
        usage: {
          inputTokens: output.inputTokens,
          outputTokens: output.outputTokens,
          totalTokens: output.totalTokens,
        },
        costUsd,
        evals: {
          faithfulness: faithfulness.score,
          relevance: relevance.score,
          quality,
        },
        retrievedChunkIds: retrieved.results.map((result) => result.chunkId),
      });
    } catch (error) {
      perQuery.push({
        id: entry.id,
        question: entry.question,
        status: "error",
        latencyMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
        expectedAnswerContains: entry.expected_answer_contains,
        containsExpectedAnswer: false,
        costUsd: 0,
        retrievedChunkIds: retrieved.results.map((result) => result.chunkId),
      });
    }
  }

  const hasErrors = perQuery.some((result) => result.status === "error");

  return {
    provider: provider.id,
    kind: provider.kind,
    model: provider.model,
    status: hasErrors ? "error" : "completed",
    metrics: summarizeProvider(perQuery),
    perQuery,
  };
}

function resolveProviders(ids: string[]): ModelProvider[] {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];

  return uniqueIds.map((id) => {
    if (id === "local-extractive") {
      return createLocalExtractiveProvider();
    }

    if (id === "ollama") {
      return createOllamaProvider();
    }

    if (id === "openai") {
      return createOpenAiProvider();
    }

    if (id === "groq") {
      return createGroqProvider();
    }

    throw new Error(
      `[benchmark-models] Unknown provider "${id}". Supported providers: local-extractive, ollama, openai, groq.`
    );
  });
}

function createLocalExtractiveProvider(): ModelProvider {
  return {
    id: "local-extractive",
    kind: "local",
    model: "top-chunk-extractive-v1",
    isConfigured: () => true,
    skipReason: () => undefined,
    async generate(input) {
      const topChunk = input.retrieved.results[0]?.text ?? "";
      const answer = topChunk
        ? `Based on the retrieved context: ${topChunk}`
        : "No answer is available from the retrieved context.";

      return {
        answer,
        inputTokens: estimateTokens(`${input.question}\n${input.context}`),
        outputTokens: estimateTokens(answer),
        totalTokens:
          estimateTokens(`${input.question}\n${input.context}`) + estimateTokens(answer),
      };
    },
  };
}

function createOllamaProvider(): ModelProvider {
  const model = process.env.GROUNDEDOS_OLLAMA_GENERATE_MODEL ?? "";

  return {
    id: "ollama",
    kind: "ollama",
    model: model || "(not configured)",
    isConfigured: () => model.trim().length > 0,
    skipReason: () =>
      "Set GROUNDEDOS_OLLAMA_GENERATE_MODEL to run the Ollama generation benchmark.",
    async generate(input) {
      const response = await fetchWithTimeout(
        `${process.env.GROUNDEDOS_OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL}/api/generate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            prompt: buildGroundedPrompt(input.question, input.context),
            options: { temperature: 0 },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Ollama request failed with status ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as { response?: string };
      const answer = body.response?.trim();

      if (!answer) {
        throw new Error("Ollama returned an empty response.");
      }

      return {
        answer,
        inputTokens: estimateTokens(`${input.question}\n${input.context}`),
        outputTokens: estimateTokens(answer),
        totalTokens:
          estimateTokens(`${input.question}\n${input.context}`) + estimateTokens(answer),
      };
    },
  };
}

function createOpenAiProvider(): ModelProvider {
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

  return {
    id: "openai",
    kind: "cloud",
    model,
    isConfigured: () => apiKey.trim().length > 0,
    skipReason: () => "Set OPENAI_API_KEY to run the OpenAI cloud benchmark.",
    async generate(input) {
      const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          input: buildGroundedPrompt(input.question, input.context),
          max_output_tokens: 300,
          store: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI request failed with status ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as {
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{
            type?: string;
            text?: string;
          }>;
        }>;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          total_tokens?: number;
        };
      };
      const answer = extractOpenAiText(body).trim();

      if (!answer) {
        throw new Error("OpenAI returned an empty response.");
      }

      return {
        answer,
        inputTokens: body.usage?.input_tokens,
        outputTokens: body.usage?.output_tokens,
        totalTokens: body.usage?.total_tokens,
      };
    },
  };
}

function createGroqProvider(): ModelProvider {
  const apiKey = process.env.GROQ_API_KEY ?? "";
  const model = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

  return {
    id: "groq",
    kind: "cloud",
    model,
    isConfigured: () => apiKey.trim().length > 0,
    skipReason: () => "Set GROQ_API_KEY to run the Groq cloud benchmark (free tier available at console.groq.com).",
    async generate(input) {
      const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: buildGroundedPrompt(input.question, input.context) }],
          max_tokens: 300,
          temperature: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Groq request failed with status ${response.status}: ${await response.text()}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };
      const answer = body.choices?.[0]?.message?.content?.trim();

      if (!answer) {
        throw new Error("Groq returned an empty response.");
      }

      return {
        answer,
        inputTokens: body.usage?.prompt_tokens,
        outputTokens: body.usage?.completion_tokens,
        totalTokens: body.usage?.total_tokens,
      };
    },
  };
}

function extractOpenAiText(body: {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}): string {
  if (body.output_text) {
    return body.output_text;
  }

  return (
    body.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text ?? "")
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

function buildGroundedPrompt(question: string, context: string): string {
  return [
    "Answer the question using only the provided context.",
    "If the context does not contain the answer, say that the answer is not available in the retrieved context.",
    "",
    `Question: ${question}`,
    "",
    "Context:",
    context,
  ].join("\n");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeProvider(results: QueryRun[]): ProviderMetrics {
  const completed = results.filter((result) => result.status === "completed");

  if (completed.length === 0) {
    return emptyMetrics();
  }

  const latencies = completed.map((result) => result.latencyMs).sort((a, b) => a - b);
  const faithfulness = completed.map((result) => result.evals?.faithfulness ?? 0);
  const relevance = completed.map((result) => result.evals?.relevance ?? 0);
  const quality = completed.map((result) => result.evals?.quality ?? 0);
  const costs = completed.map((result) => result.costUsd);

  return {
    requestCount: completed.length,
    avgLatencyMs: roundMetric(avg(latencies), 2),
    p95LatencyMs: percentile(latencies, 0.95),
    avgFaithfulness: roundMetric(avg(faithfulness), 4),
    avgRelevance: roundMetric(avg(relevance), 4),
    avgQuality: roundMetric(avg(quality), 4),
    containsExpectedAnswerRate: roundMetric(
      completed.filter((result) => result.containsExpectedAnswer).length / completed.length,
      4
    ),
    avgCostUsd: roundMetric(avg(costs), 6),
    totalCostUsd: roundMetric(costs.reduce((sum, cost) => sum + cost, 0), 6),
  };
}

function emptyMetrics(): ProviderMetrics {
  return {
    requestCount: 0,
    avgLatencyMs: 0,
    p95LatencyMs: 0,
    avgFaithfulness: 0,
    avgRelevance: 0,
    avgQuality: 0,
    containsExpectedAnswerRate: 0,
    avgCostUsd: 0,
    totalCostUsd: 0,
  };
}

function containsExpected(answer: string, expected: string[]): boolean {
  const normalized = answer.toLowerCase();
  return expected.every((part) => normalized.includes(part.toLowerCase()));
}

function estimateCostUsd(
  provider: string,
  inputTokens = 0,
  outputTokens = 0
): number {
  const normalized = provider.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const inputCostPer1k = Number(process.env[`GROUNDEDOS_${normalized}_INPUT_COST_PER_1K`] ?? 0);
  const outputCostPer1k = Number(process.env[`GROUNDEDOS_${normalized}_OUTPUT_COST_PER_1K`] ?? 0);

  if (!Number.isFinite(inputCostPer1k) || !Number.isFinite(outputCostPer1k)) {
    return 0;
  }

  return roundMetric((inputTokens / 1000) * inputCostPer1k + (outputTokens / 1000) * outputCostPer1k, 6);
}

function estimateTokens(text: string): number {
  return Math.ceil((text.trim().match(/\S+/g) ?? []).length * 1.3);
}

function bestProvider(
  runs: ProviderRun[],
  metric: keyof ProviderMetrics,
  direction: "asc" | "desc"
): string | undefined {
  const sorted = [...runs].sort((left, right) => {
    const delta = left.metrics[metric] - right.metrics[metric];
    return direction === "asc" ? delta : -delta;
  });

  return sorted[0]?.provider;
}

function avg(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sortedValues: number[], percentileValue: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.ceil(sortedValues.length * percentileValue) - 1;
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))] ?? 0;
}

function roundMetric(value: number, decimals = 6): number {
  return Number(value.toFixed(decimals));
}

function parseArgs(args: string[]): CliOptions {
  let datasetId = DEFAULT_DATASET_ID;
  let topK = DEFAULT_TOP_K;
  let providers = DEFAULT_PROVIDERS;
  let outputPath = DEFAULT_OUTPUT_PATH;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--dataset" || arg === "-d") {
      datasetId = requireCliValue(args, index, arg, "[benchmark-models]");
      index += 1;
      continue;
    }

    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, index, arg, "[benchmark-models]"),
        "--top-k",
        "[benchmark-models]"
      );
      index += 1;
      continue;
    }

    if (arg === "--providers" || arg === "-p") {
      providers = requireCliValue(args, index, arg, "[benchmark-models]")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      outputPath = requireCliValue(args, index, arg, "[benchmark-models]");
      index += 1;
      continue;
    }

    throw new Error(`[benchmark-models] Unknown option "${arg}". Use --help for usage.`);
  }

  return {
    datasetId,
    topK,
    providers,
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
    throw new Error(`[benchmark-models] Dataset "${datasetId}" was not found.`);
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
      `[benchmark-models] Dataset checksum mismatch for "${dataset.id}". Expected ${dataset.sha256}, received ${actual}.`
    );
  }
}

function printHelp(): void {
  console.log(`Usage: npm run benchmark:models -- [options]

Options:
  --dataset, -d <id>       Dataset ID from datasets/registry.json
  --top-k, -k <n>          Number of chunks to retrieve (default: ${DEFAULT_TOP_K})
  --providers, -p <list>   Comma-separated providers: local-extractive,ollama,openai,groq
  --output, -o <path>      Output artifact path (default: ${DEFAULT_OUTPUT_PATH})
  --help, -h               Show this help

Optional provider environment:
  GROUNDEDOS_OLLAMA_GENERATE_MODEL   Required for provider "ollama"
  GROUNDEDOS_OLLAMA_BASE_URL         Defaults to ${DEFAULT_OLLAMA_BASE_URL}
  OPENAI_API_KEY                     Required for provider "openai"
  OPENAI_MODEL                       Defaults to gpt-5-mini
  GROQ_API_KEY                       Required for provider "groq" (free tier at console.groq.com)
  GROQ_MODEL                         Defaults to llama-3.1-8b-instant
`);
}
