import { describe, expect, it } from "vitest";
import {
  EvalMetricResultSchema,
  EvalRunResultSchema,
  ExperimentRunMetadataSchema,
} from "./index";

describe("eval and experiment core schemas", () => {
  it("validates EvalMetricResult", () => {
    const result = EvalMetricResultSchema.parse({
      name: "faithfulness",
      score: 0.92,
      threshold: 0.8,
      passed: true,
      details: { evaluator: "internal" },
    });

    expect(result.name).toBe("faithfulness");
    expect(result.passed).toBe(true);
  });

  it("validates EvalRunResult", () => {
    const report = EvalRunResultSchema.parse({
      reportId: "eval-report-1",
      schemaVersion: "v1",
      createdAt: "2026-05-20T00:00:00.000Z",
      dataset: {
        datasetId: "harness-smoke-v1",
        datasetVersion: "1.0.0",
      },
      run: {
        runId: "run-1",
        pipelineName: "rag-default",
        modelProvider: "openai",
      },
      summary: {
        totalItems: 3,
        passedItems: 2,
        failedItems: 1,
        averageScore: 0.75,
      },
      metrics: [{ name: "faithfulness", score: 0.8, passed: true }],
      items: [
        {
          itemId: "item-1",
          query: "What is grounded retrieval?",
          actualAnswer: "It answers using retrieved evidence.",
          metricResults: [{ name: "faithfulness", score: 0.8, passed: true }],
          passed: true,
        },
      ],
      artifacts: {
        traceIds: ["trace-1"],
      },
    });

    expect(report.summary.totalItems).toBe(3);
    expect(report.items[0]?.metricResults).toHaveLength(1);
  });

  it("validates ExperimentRunMetadata", () => {
    const metadata = ExperimentRunMetadataSchema.parse({
      experimentId: "exp-1",
      schemaVersion: "v1",
      createdAt: "2026-05-20T00:00:00.000Z",
      datasetId: "harness-smoke-v1",
      datasetVersion: "1.0.0",
      pipelineName: "rag-default",
      modelProvider: "openai",
      modelName: "gpt-4o-mini",
      evalSuite: "default-suite",
      tags: ["smoke"],
      metadata: { branch: "main" },
    });

    expect(metadata.experimentId).toBe("exp-1");
    expect(metadata.tags).toContain("smoke");
  });
});
