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
