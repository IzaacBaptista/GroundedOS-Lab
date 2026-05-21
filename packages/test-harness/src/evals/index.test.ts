import { describe, expect, it } from "vitest";
import { EvalReportSchema, EvalRunComparisonReportSchema, type GoldenDataset } from "@groundedos/core";
import { compareEvalRuns, makeRetrievedChunk, runEvalDataset } from "./index";

describe("eval harness", () => {
  it("produces canonical EvalReport output from runEvalDataset", async () => {
    const dataset: GoldenDataset = {
      name: "harness-eval",
      version: "1.0.0",
      entries: [
        {
          id: "sample-1",
          question: "What is grounded retrieval?",
          expectedChunkIds: ["chunk-1"],
        },
      ],
    };

    const report = await runEvalDataset(dataset, {
      async retrieve() {
        return [makeRetrievedChunk()];
      },
      async generate() {
        return "Grounded retrieval uses retrieved evidence to answer.";
      },
    });

    const parsed = EvalReportSchema.parse(report);
    expect(parsed.version).toBe("v1");
    expect(parsed.summary.datasetName).toBe("harness-eval");
    expect(parsed.samples).toHaveLength(1);
  });

  it("produces canonical comparison output from compareEvalRuns", async () => {
    const dataset: GoldenDataset = {
      name: "harness-eval",
      version: "1.0.0",
      entries: [
        {
          id: "sample-1",
          question: "What is grounded retrieval?",
          expectedChunkIds: ["chunk-1"],
        },
      ],
    };

    const baseline = await runEvalDataset(dataset, {
      async retrieve() {
        return [makeRetrievedChunk()];
      },
      async generate() {
        return "Grounded retrieval uses retrieved evidence to answer.";
      },
    });

    const candidate = await runEvalDataset(dataset, {
      async retrieve() {
        return [makeRetrievedChunk({ score: 0.95 })];
      },
      async generate() {
        return "Grounded retrieval uses retrieved evidence to answer.";
      },
    });

    const comparison = compareEvalRuns(baseline, candidate);
    const parsed = EvalRunComparisonReportSchema.parse(comparison);

    expect(parsed.version).toBe("v1");
    expect(parsed.baselineRunId).toBe(baseline.summary.runId);
    expect(parsed.candidateRunId).toBe(candidate.summary.runId);
  });
});
