import { readFile } from "fs/promises";
import { DatasetSchema, type GoldenDataset } from "./dataset-schemas";

export async function loadGoldenDataset(path: string): Promise<GoldenDataset> {
  const content = await readFile(path, "utf8");
  const parsed = JSON.parse(content) as unknown;
  return DatasetSchema.parse(parsed);
}
