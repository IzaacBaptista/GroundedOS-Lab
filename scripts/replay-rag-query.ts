import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  askPersistedRag,
  askRagFromFile,
  replayRagFromSnapshot,
  type RagAskResponse,
} from "../apps/api/src/rag-service";
import { TraceStore, type StructuredTraceRecord } from "../apps/api/src/observability/trace-store";
import {
  compareReplaySnapshots,
  type ReplayComparisonReport,
  type ReplaySnapshot,
} from "../apps/api/src/retrieval-reliability";
import { parsePositiveInteger, requireCliValue } from "./rag-cli-utils";

const DEFAULT_OUTPUT_PATH = "datasets/golden/baselines/replay-report.json";
const DEFAULT_SNAPSHOT_PATH = "datasets/golden/baselines/replay-snapshot.json";

export type CliOptions = {
  documentId?: string;
  contentFile?: string;
  query?: string;
  topK?: number;
  responseFile?: string;
  traceId?: string;
  requestId?: string;
  snapshotFile?: string;
  snapshotOut?: string;
  createOnly: boolean;
  outputPath: string;
  help: boolean;
};

export async function runReplayCli(rawOptions: CliOptions): Promise<{
  report?: ReplayComparisonReport;
  snapshot?: ReplaySnapshot;
}> {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const options = {
    ...rawOptions,
    outputPath: rawOptions.outputPath ?? DEFAULT_OUTPUT_PATH,
    snapshotOut: rawOptions.snapshotOut ?? DEFAULT_SNAPSHOT_PATH,
  };
  const source = await resolveReplaySource(options, repoRoot);

  if (options.createOnly) {
    if (!source.snapshot) {
      throw new Error(
        "[replay-rag-query] --create-only requires --trace-id, --request-id, --snapshot-file, or --response-file."
      );
    }

    const snapshotPath = resolve(repoRoot, options.snapshotOut);
    await mkdir(dirname(snapshotPath), { recursive: true });
    await writeFile(snapshotPath, JSON.stringify(source.snapshot, null, 2));
    console.log(JSON.stringify(source.snapshot, null, 2));
    return { snapshot: source.snapshot };
  }

  if (source.snapshot) {
    try {
      const { response, report } = await replayRagFromSnapshot(source.snapshot, {
        contentFilePath: options.contentFile ? resolve(repoRoot, options.contentFile) : undefined,
      });
      await persistReplayArtifacts({
        repoRoot,
        options,
        report,
        response,
      });
      console.log(JSON.stringify(report, null, 2));
      return { report };
    } catch (error) {
      await new TraceStore().append({
        version: "v1",
        timestamp: new Date().toISOString(),
        component: "eval",
        operation: "rag.replay",
        status: "error",
        durationMs: 0,
        correlation: {
          traceId: source.snapshot.correlation.traceId,
          requestId: source.snapshot.correlation.requestId,
          indexId: source.snapshot.document.documentId,
        },
        metadata: {
          replayId: randomUUID(),
          originalTraceId: source.snapshot.correlation.traceId,
          replayStatus: "error",
          query: source.snapshot.query,
        },
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  const query = options.query;
  const topK = options.topK ?? 3;

  if (!query) {
    throw new Error("[replay-rag-query] Provide --query, --response-file, --trace-id, or --snapshot-file.");
  }

  let replayed: RagAskResponse;
  if (options.documentId && !options.contentFile) {
    replayed = await askPersistedRag({
      documentId: options.documentId,
      query,
      topK,
    });
  } else if (options.contentFile) {
    replayed = await askRagFromFile({
      type: options.contentFile.toLowerCase().endsWith(".pdf") ? "pdf" : "text",
      filePath: resolve(repoRoot, options.contentFile),
      query,
      topK,
    });
  } else {
    throw new Error("[replay-rag-query] Provide either --document-id or --content-file.");
  }

  const report = compareReplaySnapshots({
    original: replayed.devMode.replay!.snapshot,
    replay: replayed.devMode.replay!.snapshot,
    originalAnswer: replayed.answer,
    replayAnswer: replayed.answer,
    originalCostUsd: replayed.devMode.cost?.totalCostUsd,
    replayCostUsd: replayed.devMode.cost?.totalCostUsd,
    originalLatencyMs: sumStageDuration(replayed),
    replayLatencyMs: sumStageDuration(replayed),
  });
  await persistReplayArtifacts({
    repoRoot,
    options,
    report,
    response: replayed,
  });
  console.log(JSON.stringify(report, null, 2));
  return { report };
}

async function resolveReplaySource(
  options: CliOptions,
  repoRoot: string
): Promise<{
  snapshot?: ReplaySnapshot;
  trace?: StructuredTraceRecord;
}> {
  if (options.snapshotFile) {
    const snapshot = JSON.parse(
      await readFile(resolve(repoRoot, options.snapshotFile), "utf-8")
    ) as ReplaySnapshot;
    return { snapshot };
  }

  if (options.responseFile) {
    const response = JSON.parse(
      await readFile(resolve(repoRoot, options.responseFile), "utf-8")
    ) as RagAskResponse;
    const snapshot = response.devMode.replay?.snapshot;
    if (!snapshot) {
      throw new Error("[replay-rag-query] Response file does not contain devMode.replay.snapshot.");
    }
    return { snapshot };
  }

  if (options.traceId || options.requestId) {
    const store = new TraceStore();
    const trace = await store.findLatestTrace({
      traceId: options.traceId,
      requestId: options.requestId,
      operation: "rag.pipeline",
      component: "retrieval",
    });

    if (!trace) {
      throw new Error("[replay-rag-query] No historical trace found for the supplied identifiers.");
    }

    const snapshot = readReplaySnapshotFromTrace(trace);
    return { snapshot, trace };
  }

  return {};
}

function readReplaySnapshotFromTrace(trace: StructuredTraceRecord): ReplaySnapshot {
  const replayMetadata = (trace.metadata as { replay?: { snapshot?: ReplaySnapshot } } | undefined)?.replay;
  const snapshot = replayMetadata?.snapshot;

  if (!snapshot) {
    throw new Error("[replay-rag-query] Historical trace does not include a replay snapshot.");
  }

  return snapshot;
}

async function persistReplayArtifacts(input: {
  repoRoot: string;
  options: CliOptions;
  report: ReplayComparisonReport;
  response: RagAskResponse;
}): Promise<void> {
  const outputPath = resolve(input.repoRoot, input.options.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(input.report, null, 2));

  await new TraceStore().append({
    version: "v1",
    timestamp: new Date().toISOString(),
    component: "eval",
    operation: "rag.replay",
    status: input.report.status === "error" ? "error" : "success",
    durationMs: sumStageDuration(input.response),
    correlation: {
      traceId: input.report.originalTraceId,
      indexId: input.response.document.documentId,
    },
    metadata: {
      replayId: input.report.replayId,
      originalTraceId: input.report.originalTraceId,
      replayStatus: input.report.status,
      query: input.response.query,
      documentId: input.response.document.documentId,
      responseChanged: input.report.differences.responseChanged,
      retrievalChanged: input.report.differences.retrievalChanged,
      chunkOrderChanged: input.report.differences.chunkOrderChanged,
      scoresChanged: input.report.differences.scoresChanged,
      groundednessChanged: input.report.differences.groundednessChanged,
      modelChanged: input.report.differences.modelChanged,
      providerChanged:
        input.report.differences.providerChanged ||
        input.report.differences.embeddingProviderChanged,
      costUsd: input.response.devMode.cost?.totalCostUsd,
      addedChunkIds: input.report.differences.addedChunkIds,
      removedChunkIds: input.report.differences.removedChunkIds,
      reorderedChunkIds: input.report.differences.reorderedChunkIds,
      scoreDeltas: input.report.differences.scoreDeltas,
      report: input.report,
    },
  });
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    outputPath: DEFAULT_OUTPUT_PATH,
    snapshotOut: DEFAULT_SNAPSHOT_PATH,
    createOnly: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--document-id") {
      options.documentId = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--content-file") {
      options.contentFile = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--query") {
      options.query = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--top-k") {
      options.topK = parsePositiveInteger(
        requireCliValue(args, index, arg, "[replay-rag-query]"),
        "--top-k",
        "[replay-rag-query]"
      );
      index += 1;
      continue;
    }

    if (arg === "--response-file") {
      options.responseFile = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--trace-id") {
      options.traceId = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--request-id") {
      options.requestId = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--snapshot-file") {
      options.snapshotFile = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--snapshot-out") {
      options.snapshotOut = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    if (arg === "--create-only") {
      options.createOnly = true;
      continue;
    }

    if (arg === "--output" || arg === "-o") {
      options.outputPath = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    throw new Error(`[replay-rag-query] Unknown option "${arg}". Use --help for usage.`);
  }

  return options;
}

function sumStageDuration(response?: RagAskResponse): number {
  return response?.devMode.stageMetrics?.reduce((sum, stage) => sum + stage.durationMs, 0) ?? 0;
}

function printHelp(): void {
  console.log(`Usage: npm run rag:replay -- [options]

Options:
  --document-id <id>     Replay a persisted query against an indexed document
  --content-file <path>  Replay an inline query against a local file
  --query <text>         Query to replay (optional with --response-file/--trace-id/--snapshot-file)
  --top-k <n>            Retrieval topK override for direct replay
  --response-file <path> Previous JSON response file for original-vs-replay comparison
  --trace-id <id>        Historical traceId to create or execute replay from
  --request-id <id>      Historical requestId to create or execute replay from
  --snapshot-file <path> Stored replay snapshot JSON to execute
  --snapshot-out <path>  Output path for --create-only snapshot export (default: ${DEFAULT_SNAPSHOT_PATH})
  --create-only          Export snapshot only without executing replay
  --output, -o <path>    Output report path (default: ${DEFAULT_OUTPUT_PATH})
  --help, -h             Show this help
`);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  await runReplayCli(options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
