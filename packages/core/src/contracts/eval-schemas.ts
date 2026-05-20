import { z } from "zod";

export const EvaluatorOutputSchema = z.object({
  metric: z.string(),
  score: z.number(),
  passed: z.boolean(),
  reason: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  costUsd: z.number().optional(),
  latencyMs: z.number().optional(),
  frameworkMeta: z.record(z.string(), z.unknown()).optional(),
});

export type EvaluatorOutput = z.infer<typeof EvaluatorOutputSchema>;

export const EvalRunSampleSchema = z.object({
  sampleId: z.string(),
  question: z.string(),
  answer: z.string(),
  outputs: z.array(EvaluatorOutputSchema),
  score: z.number(),
  passed: z.boolean(),
  latencyMs: z.number().optional(),
  costUsd: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type EvalRunSample = z.infer<typeof EvalRunSampleSchema>;

export const EvalRunSummarySchema = z.object({
  runId: z.string(),
  datasetName: z.string(),
  datasetVersion: z.string(),
  createdAt: z.string(),
  sampleCount: z.number(),
  passCount: z.number(),
  passRate: z.number(),
  averageScore: z.number(),
  totalCostUsd: z.number(),
  totalLatencyMs: z.number(),
  retrievalDriftRate: z.number().optional(),
  hallucinationRate: z.number().optional(),
  metrics: z.record(z.string(), z.number()),
});

export type EvalRunSummary = z.infer<typeof EvalRunSummarySchema>;

export const EvalReportSchema = z.object({
  version: z.literal("v1"),
  summary: EvalRunSummarySchema,
  samples: z.array(EvalRunSampleSchema),
});

export type EvalReport = z.infer<typeof EvalReportSchema>;

export const EvalRunComparisonReportSchema = z.object({
  version: z.literal("v1"),
  baselineRunId: z.string(),
  candidateRunId: z.string(),
  comparedAt: z.string(),
  deltas: z.object({
    passRate: z.number(),
    averageScore: z.number(),
    totalCostUsd: z.number(),
    totalLatencyMs: z.number(),
    retrievalDriftRate: z.number().optional(),
    hallucinationRate: z.number().optional(),
  }),
  metricDeltas: z.record(z.string(), z.number()),
});

export type EvalRunComparisonReport = z.infer<typeof EvalRunComparisonReportSchema>;

export const EvalMetricResultSchema = z.object({
  name: z.string(),
  score: z.number(),
  threshold: z.number().optional(),
  passed: z.boolean().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type EvalMetricResult = z.infer<typeof EvalMetricResultSchema>;

export const EvalRunResultSchema = z.object({
  reportId: z.string(),
  schemaVersion: z.string(),
  createdAt: z.string(),
  dataset: z.object({
    datasetId: z.string(),
    datasetVersion: z.string(),
  }),
  run: z.object({
    runId: z.string(),
    pipelineName: z.string(),
    modelProvider: z.string().optional(),
    modelName: z.string().optional(),
    embeddingProvider: z.string().optional(),
    promptVersion: z.string().optional(),
  }),
  summary: z.object({
    totalItems: z.number(),
    passedItems: z.number(),
    failedItems: z.number(),
    averageScore: z.number(),
  }),
  metrics: z.array(EvalMetricResultSchema),
  items: z.array(
    z.object({
      itemId: z.string(),
      query: z.string(),
      expectedAnswer: z.string().optional(),
      actualAnswer: z.string().optional(),
      retrievedChunkIds: z.array(z.string()).optional(),
      metricResults: z.array(EvalMetricResultSchema),
      passed: z.boolean(),
      errors: z.array(z.string()).optional(),
    })
  ),
  artifacts: z
    .object({
      traceIds: z.array(z.string()).optional(),
      snapshotIds: z.array(z.string()).optional(),
      outputPath: z.string().optional(),
    })
    .optional(),
});

export type EvalRunResult = z.infer<typeof EvalRunResultSchema>;
