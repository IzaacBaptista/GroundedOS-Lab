import { execFile } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

interface LoraArtifact {
  version: number;
  track: string;
  inputDataset: {
    entryCount: number;
    instructionExamples: number;
  };
  hyperparameters: {
    rank: number;
    alpha: number;
    dropout: number;
    training_steps: number;
  };
  variants: Array<{
    name: string;
    role: string;
    metrics: {
      instruction_loss: number;
      trainable_parameters: number;
    };
  }>;
  comparison: {
    passed: boolean;
    loss_improvement: number;
    parameter_efficiency: {
      reduction_rate: number;
    };
  };
}

const VENV_PYTHON = "/tmp/groundedos-ml/bin/python3";

describe("Phase 5 LoRA real training experiment", () => {
  it(
    "trains LoRA adapters and reduces trainable parameter count vs baseline",
    {
      timeout: 120_000,
    },
    async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "groundedos-lora-"));
      const outputPath = join(tempDir, "lora-result.json");

      try {
        await execFileAsync(
          VENV_PYTHON,
          [
            "experiments/lora/run_experiment_real.py",
            "--steps",
            "2",
            "--output",
            outputPath,
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              PYTHONDONTWRITEBYTECODE: "1",
            },
            timeout: 120_000,
          }
        );

        const artifact = JSON.parse(
          await readFile(outputPath, "utf-8")
        ) as LoraArtifact;

        const baseline = findVariant(artifact, "baseline");
        const loraVariant = artifact.variants.find((v) =>
          v.name.startsWith("lora-r")
        );
        if (!loraVariant) throw new Error("Missing lora variant");

        // Schema validation
        expect(artifact.version).toBe(1);
        expect(artifact.track).toBe("lora");
        expect(artifact.inputDataset.instructionExamples).toBeGreaterThan(0);

        // Hyperparameters match defaults
        expect(artifact.hyperparameters.rank).toBe(8);
        expect(artifact.hyperparameters.alpha).toBe(16);

        // LoRA must reduce trainable parameters significantly
        expect(loraVariant.metrics.trainable_parameters).toBeLessThan(
          baseline.metrics.trainable_parameters
        );
        expect(artifact.comparison.parameter_efficiency.reduction_rate).toBeGreaterThan(0.9);

        // Experiment must pass quality gate
        expect(artifact.comparison.passed).toBe(true);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  );
});

function findVariant(
  artifact: LoraArtifact,
  name: string
): LoraArtifact["variants"][number] {
  const variant = artifact.variants.find((v) => v.name === name);
  if (!variant) throw new Error(`Missing variant: ${name}`);
  return variant;
}
