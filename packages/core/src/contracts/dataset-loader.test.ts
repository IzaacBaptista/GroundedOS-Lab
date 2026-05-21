import { resolve } from "path";
import { describe, expect, it } from "vitest";
import { loadGoldenDataset } from "./dataset-loader";

describe("loadGoldenDataset", () => {
  it("loads and validates the harness smoke fixture", async () => {
    const filePath = resolve(
      process.cwd(),
      "datasets/golden/harness-smoke-v1/dataset.json"
    );
    const dataset = await loadGoldenDataset(filePath);
    expect(dataset.name).toBe("Harness Smoke v1");
    expect(dataset.entries).toHaveLength(3);
  });
});
