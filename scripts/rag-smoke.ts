import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "../packages/etl/src/index";
import {
  buildRetrievalIndex,
  retrieveForDevMode,
} from "../packages/rag/src/index";
import {
  RagCliLexicalEmbeddingProvider,
  createGroundedAnswer,
  parsePositiveInteger,
  requireCliValue,
} from "./rag-cli-utils";

const DEFAULT_DATASET_ID = "phase-0-smoke-text";
const DEFAULT_QUERY = "What does this command verify?";
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

type CliOptions = {
  datasetId: string;
  query: string;
  topK: number;
  help: boolean;
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataset = await readDatasetEntry(repoRoot, options.datasetId);
const filePath = resolve(repoRoot, "datasets", dataset.path);
const rawBytes = await readFile(filePath);

verifyChecksum(dataset, rawBytes);

const document = await ingest({
  type: dataset.modality,
  filePath,
  metadata: {
    ...dataset.metadata,
    datasetId: dataset.id,
    datasetSource: dataset.source,
    datasetLicense: dataset.license,
  },
});
const index = await buildRetrievalIndex(document, {
  embeddingProvider: new RagCliLexicalEmbeddingProvider({ name: "rag-smoke-lexical" }),
});
const devMode = await retrieveForDevMode(index, options.query, {
  topK: options.topK,
});
const output = {
  dataset: {
    id: dataset.id,
    name: dataset.name,
    modality: dataset.modality,
    source: dataset.source,
    license: dataset.license,
    path: dataset.path,
  },
  query: options.query,
  answer: createGroundedAnswer(devMode),
  index: {
    chunkCount: index.embeddedChunks.length,
    embeddingProvider: index.embeddingProvider.name,
    embeddingDimensions: index.embeddingProvider.dimensions,
  },
  devMode,
};

console.log(JSON.stringify(output, null, 2));

function parseArgs(args: string[]): CliOptions {
  let datasetId = DEFAULT_DATASET_ID;
  let query = DEFAULT_QUERY;
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
      datasetId = requireCliValue(args, index, arg, "[rag-smoke]");
      index += 1;
      continue;
    }

    if (arg === "--query" || arg === "-q") {
      query = requireCliValue(args, index, arg, "[rag-smoke]");
      index += 1;
      continue;
    }

    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, index, arg, "[rag-smoke]"),
        "--top-k",
        "[rag-smoke]"
      );
      index += 1;
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`[rag-smoke] Unknown option "${arg}". Use --help for usage.`);
    }

    positional.push(arg ?? "");
  }

  if (positional[0]) {
    datasetId = positional[0];
  }

  if (positional.length > 1) {
    query = positional.slice(1).join(" ");
  }

  if (query.trim().length === 0) {
    throw new Error("[rag-smoke] Query must not be empty.");
  }

  return {
    datasetId,
    query,
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
      `[rag-smoke] Dataset "${datasetId}" was not found in datasets/registry.json.`
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
      `[rag-smoke] Dataset checksum mismatch for "${dataset.id}". ` +
        `Expected ${dataset.sha256}, received ${actualChecksum}.`
    );
  }
}

function printHelp(): void {
  console.log(`Usage: npm run rag:smoke -- [options]

Options:
  --dataset, -d <id>   Dataset ID from datasets/registry.json
  --query, -q <text>   Query to retrieve against the dataset
  --top-k, -k <n>      Number of chunks to retrieve
  --help, -h           Show this help

Defaults:
  dataset: ${DEFAULT_DATASET_ID}
  query:   ${DEFAULT_QUERY}
  topK:    ${DEFAULT_TOP_K}
`);
}
