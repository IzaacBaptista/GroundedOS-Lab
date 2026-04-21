import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { DocumentModality } from "@groundedos/core";
import { ingest } from "../packages/etl/src/index";

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

const datasetId = process.argv[2] ?? "phase-0-smoke-text";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = resolve(repoRoot, "datasets/registry.json");
const registry = JSON.parse(
  await readFile(registryPath, "utf-8")
) as DatasetRegistry;
const dataset = registry.datasets.find((entry) => entry.id === datasetId);

if (!dataset) {
  throw new Error(
    `[ingest-smoke] Dataset "${datasetId}" was not found in datasets/registry.json.`
  );
}

const filePath = resolve(repoRoot, "datasets", dataset.path);
const rawBytes = await readFile(filePath);

if (dataset.sha256) {
  const actualChecksum = createHash("sha256").update(rawBytes).digest("hex");

  if (actualChecksum !== dataset.sha256) {
    throw new Error(
      `[ingest-smoke] Dataset checksum mismatch for "${dataset.id}". ` +
        `Expected ${dataset.sha256}, received ${actualChecksum}.`
    );
  }
}

const doc = await ingest({
  type: dataset.modality,
  filePath,
  metadata: {
    ...dataset.metadata,
    datasetId: dataset.id,
    datasetSource: dataset.source,
    datasetLicense: dataset.license,
  },
});

console.log(JSON.stringify(doc, null, 2));
