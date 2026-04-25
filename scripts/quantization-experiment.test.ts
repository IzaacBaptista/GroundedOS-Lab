import { execFile } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

interface QuantizationArtifact {
  version: number;
  inputDataset: {
    entryCount: number;
    path: string;
  };
  method: {
    chunkCount: number;
    searchPaths: string[];
  };
  variants: Array<{
    name: string;
    metrics: {
      recallAt1: number;
      memoryBytes: number;
      memoryReductionRate?: number;
    };
  }>;
  comparison: {
    passed: boolean;
    directCandidateVsBaseline: {
      recallAt1: number;
      memoryReductionRate: number;
    };
  };
}

describe("Phase 5 quantization experiment", () => {
  it("preserves Recall@1 for direct INT8 search on the Phase 5 golden set", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "groundedos-quantization-"));
    const outputPath = join(tempDir, "quantization-result.json");

    try {
      await execFileAsync(
        "python3",
        [
          "experiments/quantization/run_experiment.py",
          "--iterations",
          "100",
          "--output",
          outputPath,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            PYTHONDONTWRITEBYTECODE: "1",
          },
          timeout: 10_000,
        }
      );

      const artifact = JSON.parse(
        await readFile(outputPath, "utf-8")
      ) as QuantizationArtifact;
      const fp32 = findVariant(artifact, "lexical-fp32");
      const int8Direct = findVariant(artifact, "lexical-int8-symmetric-direct");

      expect(artifact.version).toBe(3);
      expect(artifact.inputDataset.path).toBe("datasets/golden/phase-5-retrieval.json");
      expect(artifact.inputDataset.entryCount).toBe(6);
      expect(artifact.method.chunkCount).toBe(7);
      expect(artifact.method.searchPaths).toContain("int8 direct normalized dot product");
      expect(artifact.comparison.passed).toBe(true);
      expect(fp32.metrics.recallAt1).toBe(1);
      expect(int8Direct.metrics.recallAt1).toBe(fp32.metrics.recallAt1);
      expect(int8Direct.metrics.memoryBytes).toBeLessThan(fp32.metrics.memoryBytes);
      expect(artifact.comparison.directCandidateVsBaseline.recallAt1).toBe(0);
      expect(
        artifact.comparison.directCandidateVsBaseline.memoryReductionRate
      ).toBeGreaterThan(0.7);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

function findVariant(
  artifact: QuantizationArtifact,
  name: string
): QuantizationArtifact["variants"][number] {
  const variant = artifact.variants.find((item) => item.name === name);

  if (!variant) {
    throw new Error(`Missing quantization variant: ${name}`);
  }

  return variant;
}
