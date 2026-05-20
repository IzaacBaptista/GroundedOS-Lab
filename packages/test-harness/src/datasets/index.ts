import { readFile } from "fs/promises";
import { resolve } from "path";
import { DatasetSchema, type GoldenDataset } from "@groundedos/core";

export async function loadGoldenDataset(
  name: string,
  root = resolve(process.cwd(), "datasets/golden")
): Promise<GoldenDataset> {
  const filePath = resolve(root, `${name}.json`);
  const content = await readFile(filePath, "utf8");
  const parsed = JSON.parse(content) as unknown;
  return validateDataset(parsed);
}

export function validateDataset(dataset: unknown): GoldenDataset {
  return DatasetSchema.parse(dataset);
}

export function compareDatasetVersions(left: GoldenDataset, right: GoldenDataset): {
  changed: boolean;
  addedEntryIds: string[];
  removedEntryIds: string[];
  versionChanged: boolean;
} {
  const leftIds = new Set(left.entries.map((entry) => entry.id));
  const rightIds = new Set(right.entries.map((entry) => entry.id));

  const addedEntryIds = [...rightIds].filter((id) => !leftIds.has(id));
  const removedEntryIds = [...leftIds].filter((id) => !rightIds.has(id));

  return {
    changed: addedEntryIds.length > 0 || removedEntryIds.length > 0 || left.version !== right.version,
    addedEntryIds,
    removedEntryIds,
    versionChanged: left.version !== right.version,
  };
}
