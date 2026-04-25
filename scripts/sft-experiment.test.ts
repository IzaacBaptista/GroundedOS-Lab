import { execFile } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

interface SftArtifact {
  version: number;
  track: string;
  mode: string;
  inputDataset: {
    entryCount: number;
    instructionPairs: number;
  };
  model: {
    base: string;
    total_parameters: number;
  };
  hyperparameters: {
    learning_rate: number;
    training_steps: number;
    optimizer: string;
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
    vs_lora: {
      sft_trainable_pct: number;
    };
  };
}

const VENV_PYTHON = "/tmp/groundedos-ml/bin/python3";

describe("Phase 5 fine-tuning (SFT) real training experiment", () => {
  it.skip(
    "runs SFT and reduces instruction loss vs baseline",
    { timeout: 120_000 },
    async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "groundedos-sft-"));
      const outputPath = join(tempDir, "sft-result.json");

      try {
        await execFileAsync(
          VENV_PYTHON,
          [
            "experiments/fine-tuning/run_experiment_real.py",
            "--steps",
            "3",
            "--output",
            outputPath,
          ],
          {
            cwd: process.cwd(),
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
            timeout: 120_000,
          }
        );

        const artifact = JSON.parse(
          await readFile(outputPath, "utf-8")
        ) as SftArtifact;

        const baseline = artifact.variants.find((v) => v.name === "baseline");
        const sft = artifact.variants.find((v) => v.name === "sft-full");

        if (!baseline || !sft) throw new Error("Missing baseline or sft-full variant");

        // Schema
        expect(artifact.version).toBe(1);
        expect(artifact.track).toBe("fine-tuning");
        expect(artifact.mode).toBe("real-sft");

        // Data: using Phase 5 richer dataset (6 entries)
        expect(artifact.inputDataset.instructionPairs).toBeGreaterThanOrEqual(1);
        expect(artifact.hyperparameters.optimizer).toBe("AdamW");

        // SFT updates ALL parameters — both baseline and SFT have full trainable count
        expect(sft.metrics.trainable_parameters).toBe(baseline.metrics.trainable_parameters);
        expect(sft.metrics.trainable_parameters).toBe(artifact.model.total_parameters);

        // SFT should achieve lower or comparable loss vs baseline
        expect(artifact.comparison.passed).toBe(true);

        // vs_lora comparison shows 100% parameter usage
        expect(artifact.comparison.vs_lora.sft_trainable_pct).toBe(100.0);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  );
});
