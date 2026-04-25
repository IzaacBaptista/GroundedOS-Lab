import { execFile } from "child_process";
import { mkdtemp, readFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const VENV_PYTHON = "/tmp/groundedos-ml/bin/python3";

interface DistillationArtifact {
  version: number;
  track: string;
  mode: string;
  inputDataset: {
    entryCount: number;
    instructionPairs: number;
  };
  method: {
    teacherModel: string;
    studentModel: string;
    trainingSteps: number;
  };
  variants: Array<{
    name: string;
    role: string;
    metrics: {
      instructionLoss: number;
      parameterCount: number;
      compressionRate?: number;
    };
  }>;
  comparison: {
    passed: boolean;
    candidateVsBaseline: {
      instructionLoss: number;
      compressionRate: number;
      parameterCount: number;
    };
  };
}

describe("Phase 5 distillation real experiment", () => {
  it.skip(
    "distills a smaller student while preserving quality within threshold",
    { timeout: 180_000 },
    async () => {
      const tempDir = await mkdtemp(join(tmpdir(), "groundedos-distill-"));
      const outputPath = join(tempDir, "distillation-result.json");

      try {
        await execFileAsync(
          VENV_PYTHON,
          [
            "experiments/distillation/run_experiment_real.py",
            "--steps",
            "3",
            "--output",
            outputPath,
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              PYTHONDONTWRITEBYTECODE: "1",
            },
            timeout: 180_000,
          }
        );

        const artifact = JSON.parse(
          await readFile(outputPath, "utf-8")
        ) as DistillationArtifact;

        const teacher = artifact.variants.find((variant) => variant.role === "baseline");
        const student = artifact.variants.find((variant) => variant.role === "candidate");

        if (!teacher || !student) {
          throw new Error("Missing teacher/student variants");
        }

        expect(artifact.version).toBe(1);
        expect(artifact.track).toBe("distillation");
        expect(artifact.mode).toBe("real-teacher-student-distillation");
        expect(artifact.inputDataset.entryCount).toBeGreaterThan(0);
        expect(artifact.inputDataset.instructionPairs).toBeGreaterThan(0);
        expect(artifact.method.teacherModel).toBe("gpt2");
        expect(artifact.method.studentModel).toBe("distilgpt2");

        expect(student.metrics.parameterCount).toBeLessThan(teacher.metrics.parameterCount);
        expect(artifact.comparison.candidateVsBaseline.parameterCount).toBeLessThan(0);
        expect(artifact.comparison.candidateVsBaseline.compressionRate).toBeGreaterThan(0.33);

        expect(artifact.comparison.passed).toBe(true);
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    }
  );
});
