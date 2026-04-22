import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { basename, extname, resolve } from "path";
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

const ERROR_PREFIX = "[rag-ask]";
const DEFAULT_TOP_K = 3;

type SupportedRagAskModality = Extract<DocumentModality, "text" | "pdf">;

type CliOptions = {
  filePath: string;
  modality: SupportedRagAskModality;
  query: string;
  topK: number;
  title?: string;
  help: boolean;
};

const options = parseArgs(process.argv.slice(2));

if (options.help) {
  printHelp();
  process.exit(0);
}

const absoluteFilePath = resolve(process.cwd(), options.filePath);
const rawBytes = await readFile(absoluteFilePath);
const checksum = createHash("sha256").update(rawBytes).digest("hex");
const title = options.title ?? basename(absoluteFilePath);
const documentId = `local-${checksum.slice(0, 16)}`;

const document = await ingest({
  type: options.modality,
  filePath: absoluteFilePath,
  metadata: {
    documentId,
    title,
    localPath: absoluteFilePath,
    checksum,
  },
});
const index = await buildRetrievalIndex(document, {
  embeddingProvider: new RagCliLexicalEmbeddingProvider({ name: "rag-ask-lexical" }),
});
const devMode = await retrieveForDevMode(index, options.query, {
  topK: options.topK,
});
const output = {
  document: {
    documentId,
    title,
    modality: options.modality,
    filePath: absoluteFilePath,
    checksum,
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
  let filePath = "";
  let modality: SupportedRagAskModality | undefined;
  let query = "";
  let topK = DEFAULT_TOP_K;
  let title: string | undefined;
  let help = false;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--file" || arg === "-f") {
      filePath = requireCliValue(args, index, arg, ERROR_PREFIX);
      index += 1;
      continue;
    }

    if (arg === "--type" || arg === "-t") {
      modality = parseModality(requireCliValue(args, index, arg, ERROR_PREFIX));
      index += 1;
      continue;
    }

    if (arg === "--query" || arg === "-q") {
      query = requireCliValue(args, index, arg, ERROR_PREFIX);
      index += 1;
      continue;
    }

    if (arg === "--top-k" || arg === "-k") {
      topK = parsePositiveInteger(
        requireCliValue(args, index, arg, ERROR_PREFIX),
        "--top-k",
        ERROR_PREFIX
      );
      index += 1;
      continue;
    }

    if (arg === "--title") {
      title = requireCliValue(args, index, arg, ERROR_PREFIX);
      index += 1;
      continue;
    }

    if (arg?.startsWith("-")) {
      throw new Error(`${ERROR_PREFIX} Unknown option "${arg}". Use --help for usage.`);
    }

    positional.push(arg ?? "");
  }

  if (!filePath && positional[0]) {
    filePath = positional[0];
  }

  if (!query && positional.length > 1) {
    query = positional.slice(1).join(" ");
  }

  if (help) {
    return {
      filePath,
      modality: modality ?? "text",
      query,
      topK,
      title,
      help,
    };
  }

  if (filePath.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} --file is required.`);
  }

  if (query.trim().length === 0) {
    throw new Error(`${ERROR_PREFIX} --query is required.`);
  }

  return {
    filePath,
    modality: modality ?? inferModality(filePath),
    query,
    topK,
    title,
    help,
  };
}

function parseModality(value: string): SupportedRagAskModality {
  if (value === "text" || value === "pdf") {
    return value;
  }

  throw new Error(`${ERROR_PREFIX} --type must be "text" or "pdf".`);
}

function inferModality(filePath: string): SupportedRagAskModality {
  if (extname(filePath).toLowerCase() === ".pdf") {
    return "pdf";
  }

  return "text";
}

function printHelp(): void {
  console.log(`Usage: npm run rag:ask -- --file <path> --query <text> [options]

Options:
  --file, -f <path>    Local text or PDF file path
  --type, -t <type>    Input type: text or pdf (default: infer from extension)
  --query, -q <text>   Question to ask against the file
  --top-k, -k <n>      Number of chunks to retrieve
  --title <text>       Optional document title
  --help, -h           Show this help

Examples:
  npm run rag:ask -- --file datasets/samples/phase-0-smoke.txt --type text --query "What does this command verify?"
  npm run rag:ask -- ./notes.txt "What are the main points?"
`);
}
