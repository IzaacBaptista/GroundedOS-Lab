import { describe, expect, it } from "vitest";
import {
  EvalOrchestratorRunSchema,
  JudgeEvaluationResultSchema,
  JudgeRubricSchema,
  RagasDatasetRecordSchema,
  SyntheticDatasetSampleSchema,
} from "./index";

describe("advanced eval core schemas", () => {
  it("validates structured judge outputs", () => {
    const result = JudgeEvaluationResultSchema.parse({
      metric: "faithfulness",
      score: 4,
      reason: "The answer is mostly supported by retrieved evidence.",
      evidenceUsed: ["chunk-1", "chunk-3"],
      issues: [],
      confidence: 0.82,
    });

    expect(result.metric).toBe("faithfulness");
    expect(result.evidenceUsed).toContain("chunk-3");
  });

  it("validates configurable rubrics", () => {
    const rubric = JudgeRubricSchema.parse({
      metric: "answer_correctness",
      version: "judge-rubric-v1",
      passingScore: 4,
      levels: [
        { score: 1, description: "Incorrect or contradicted by the context." },
        { score: 3, description: "Partially correct but incomplete." },
        { score: 5, description: "Correct, complete and grounded." },
      ],
      promptHints: ["Prefer chunk citations over generic statements."],
    });

    expect(rubric.levels).toHaveLength(3);
    expect(rubric.passingScore).toBe(4);
  });

  it("validates RAGAS adapter records", () => {
    const record = RagasDatasetRecordSchema.parse({
      sampleId: "sample-1",
      question: "How does semantic caching affect retrieval?",
      answer: "It can shortcut repeated retrieval calls.",
      contexts: ["Semantic cache stores recent retrieval evidence."],
      contextIds: ["chunk-1"],
      referenceAnswer: "Semantic cache reduces repeated retrieval work by reusing evidence.",
      groundTruthContexts: ["Semantic cache stores recent retrieval evidence."],
      metadata: { difficulty: "medium" },
    });

    expect(record.contextIds[0]).toBe("chunk-1");
  });

  it("validates synthetic dataset samples", () => {
    const sample = SyntheticDatasetSampleSchema.parse({
      id: "synthetic-001",
      question: "How does semantic cache relate to retrieval?",
      referenceAnswer: "It reuses similar retrieval results to reduce redundant work.",
      evidenceChunkIds: ["chunk-12", "chunk-19"],
      sourceDocumentIds: ["doc-rag-internals"],
      difficulty: "medium",
      questionType: "relationship",
      expectedRetrievalMode: "hybrid",
      generationMetadata: {
        generatorModel: "local-or-cloud-model",
        promptVersion: "synthetic-v1",
        createdAt: "2026-05-26T00:00:00.000Z",
      },
      validationStatus: "approved",
    });

    expect(sample.validationStatus).toBe("approved");
  });

  it("validates orchestrator runs", () => {
    const run = EvalOrchestratorRunSchema.parse({
      runId: "eval-run-1",
      mode: "experiment",
      suite: {
        suiteId: "advanced-rag",
        metrics: ["faithfulness", "answer_correctness", "context_precision"],
        includes: {
          customScorers: true,
          judge: true,
          ragas: true,
          syntheticDataset: false,
        },
      },
      dataset: {
        datasetId: "datasets/golden/rag/v1",
        datasetVersion: "v1",
      },
      summary: {
        sampleCount: 1,
        metrics: {
          faithfulness: 0.9,
          answer_correctness: 0.8,
          context_precision: 0.75,
        },
        estimatedCostUsd: 0.04,
        latencyMs: 125,
      },
      artifacts: {
        outputDir: "datasets/experiments/evals/ragas/run-1",
        files: {
          resultsJson: "results.json",
          summaryMd: "summary.md",
          metricsCsv: "metrics.csv",
          configJson: "config.json",
          traceJson: "trace.json",
        },
      },
      samples: [
        {
          sampleId: "sample-1",
          question: "What is grounded retrieval?",
          answer: "Grounded retrieval uses retrieved evidence to answer.",
          customScorers: { faithfulness: 0.9 },
          judgeResults: [
            {
              metric: "faithfulness",
              averageScore: 4.5,
              majorityScore: 5,
              selfConsistency: 1,
              confidence: 0.9,
              evidenceUsed: ["chunk-1"],
              issues: [],
              reasons: ["Grounded in the retrieved chunk."],
            },
          ],
          ragasResults: { context_precision: 0.8 },
          warnings: [],
        },
      ],
      comparisons: [],
    });

    expect(run.summary.metrics.faithfulness).toBe(0.9);
  });
});
