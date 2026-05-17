import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, extname, resolve } from "path";
import { fileURLToPath } from "url";
import { askPersistedRag, askRagFromFile, type RagAskResponse } from "../apps/api/src/rag-service";
import { TraceStore } from "../apps/api/src/observability/trace-store";
import { compareReplaySnapshots } from "../apps/api/src/retrieval-reliability";
import { parsePositiveInteger, requireCliValue } from "./rag-cli-utils";

const DEFAULT_OUTPUT_PATH = "datasets/golden/baselines/replay-report.json";

type CliOptions = {
  documentId?: string;
  contentFile?: string;
  query?: string;
  topK?: number;
  responseFile?: string;
  outputPath: string;
  help: boolean;
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reference = options.responseFile
  ? (JSON.parse(await readFile(resolve(repoRoot, options.responseFile), "utf-8")) as RagAskResponse)
  : undefined;
const query = options.query ?? reference?.query;
const topK = options.topK ?? reference?.devMode.replay?.snapshot.parameters.topK ?? 3;
const documentId = options.documentId ?? reference?.document.documentId;
const contentFile = options.contentFile;

if (!query) {
  throw new Error("[replay-rag-query] Provide --query or --response-file.");
}

let replayed: RagAskResponse;
if (documentId && !contentFile) {
  replayed = await askPersistedRag({
    documentId,
    query,
    topK,
  });
} else if (contentFile) {
  replayed = await askRagFromFile({
    type: resolveModality(contentFile),
    filePath: resolve(repoRoot, contentFile),
    query,
    topK,
  });
} else {
  throw new Error("[replay-rag-query] Provide either --document-id or --content-file.");
}

const report = compareReplaySnapshots({
  original: reference?.devMode.replay?.snapshot ?? replayed.devMode.replay!.snapshot,
  replay: replayed.devMode.replay!.snapshot,
  originalAnswer: reference?.answer ?? replayed.answer,
  replayAnswer: replayed.answer,
  originalCostUsd: reference?.devMode.cost?.totalCostUsd,
  replayCostUsd: replayed.devMode.cost?.totalCostUsd,
  originalLatencyMs: sumStageDuration(reference),
  replayLatencyMs: sumStageDuration(replayed),
});

const outputPath = resolve(repoRoot, options.outputPath);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2));

await new TraceStore().append({
  version: "v1",
  timestamp: new Date().toISOString(),
  component: "eval",
  operation: "rag.replay",
  status: "success",
  durationMs: sumStageDuration(replayed),
  correlation: {
    indexId: replayed.document.documentId,
  },
  metadata: {
    query,
    documentId: replayed.document.documentId,
    responseChanged: report.differences.responseChanged,
    retrievalChanged: report.differences.retrievalChanged,
    groundednessChanged: report.differences.groundednessChanged,
    costUsd: replayed.devMode.cost?.totalCostUsd,
    addedChunkIds: report.differences.addedChunkIds,
    removedChunkIds: report.differences.removedChunkIds,
  },
});

console.log(JSON.stringify(report, null, 2));

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    outputPath: DEFAULT_OUTPUT_PATH,
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

    if (arg === "--output" || arg === "-o") {
      options.outputPath = requireCliValue(args, index, arg, "[replay-rag-query]");
      index += 1;
      continue;
    }

    throw new Error(`[replay-rag-query] Unknown option "${arg}". Use --help for usage.`);
  }

  return options;
}

function resolveModality(filePath: string): "text" | "pdf" {
  return extname(filePath).toLowerCase() === ".pdf" ? "pdf" : "text";
}

function sumStageDuration(response?: RagAskResponse): number {
  return (
    response?.devMode.stageMetrics?.reduce((sum, stage) => sum + stage.durationMs, 0) ?? 0
  );
}

function printHelp(): void {
  console.log(`Usage: npm run rag:replay -- [options]

Options:
  --document-id <id>     Replay a persisted query against an indexed document
  --content-file <path>  Replay an inline query against a local file
  --query <text>         Query to replay (optional when --response-file is used)
  --top-k <n>            Retrieval topK
  --response-file <path> Previous JSON response file for original-vs-replay comparison
  --output, -o <path>    Output report path (default: ${DEFAULT_OUTPUT_PATH})
  --help, -h             Show this help
`);
}
