import { z } from "zod";

export const JudgeMetricSchema = z.enum([
  "faithfulness",
  "answer_relevance",
  "answer_correctness",
  "completeness",
  "groundedness",
  "citation_quality",
  "hallucination_risk",
  "refusal_correctness",
  "uncertainty_handling",
]);

export type JudgeMetric = z.infer<typeof JudgeMetricSchema>;

export const JudgeRubricLevelSchema = z.object({
  score: z.number().int().min(1).max(5),
  description: z.string().min(1),
});

export type JudgeRubricLevel = z.infer<typeof JudgeRubricLevelSchema>;

export const JudgeRubricSchema = z.object({
  metric: JudgeMetricSchema,
  version: z.string(),
  passingScore: z.number().int().min(1).max(5).default(4),
  levels: z.array(JudgeRubricLevelSchema).min(3),
  promptHints: z.array(z.string()).default([]),
});

export type JudgeRubric = z.infer<typeof JudgeRubricSchema>;

export const JudgePromptTemplateSchema = z.object({
  id: z.string(),
  version: z.string(),
  systemPrompt: z.string(),
  userPrompt: z.string(),
  hardeningRules: z.array(z.string()).min(1),
});

export type JudgePromptTemplate = z.infer<typeof JudgePromptTemplateSchema>;

export const JudgeProviderConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
  promptVersion: z.string(),
  temperature: z.number().min(0).max(2).default(0),
  seed: z.number().int().optional(),
  deterministic: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type JudgeProviderConfig = z.infer<typeof JudgeProviderConfigSchema>;

export const JudgeEvaluationResultSchema = z.object({
  metric: JudgeMetricSchema,
  score: z.number().min(1).max(5),
  reason: z.string(),
  evidenceUsed: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  passed: z.boolean().optional(),
});

export type JudgeEvaluationResult = z.infer<typeof JudgeEvaluationResultSchema>;

export const JudgeTraceSchema = z.object({
  traceId: z.string(),
  runId: z.string(),
  sampleId: z.string().optional(),
  prompt: z.string(),
  promptTemplate: JudgePromptTemplateSchema,
  provider: JudgeProviderConfigSchema.extend({
    latencyMs: z.number().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
  }),
  rawResponse: z.string().optional(),
  warnings: z.array(z.string()).default([]),
  parsedResults: z.array(JudgeEvaluationResultSchema).default([]),
});

export type JudgeTrace = z.infer<typeof JudgeTraceSchema>;

export const JudgeAggregationResultSchema = z.object({
  metric: JudgeMetricSchema,
  averageScore: z.number().min(1).max(5),
  majorityScore: z.number().min(1).max(5),
  selfConsistency: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  evidenceUsed: z.array(z.string()).default([]),
  issues: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
});

export type JudgeAggregationResult = z.infer<typeof JudgeAggregationResultSchema>;

export const JudgeRunSchema = z.object({
  runId: z.string(),
  sampleId: z.string().optional(),
  metrics: z.array(JudgeMetricSchema).min(1),
  provider: JudgeProviderConfigSchema,
  runCount: z.number().int().positive(),
  traces: z.array(JudgeTraceSchema),
  aggregation: z.array(JudgeAggregationResultSchema),
});

export type JudgeRun = z.infer<typeof JudgeRunSchema>;

export const JudgeCalibrationExampleSchema = z.object({
  sampleId: z.string(),
  metric: JudgeMetricSchema,
  expectedScore: z.number().int().min(1).max(5),
  rationale: z.string(),
});

export const JudgeCalibrationSetSchema = z.object({
  calibrationSetId: z.string(),
  version: z.string(),
  createdAt: z.string(),
  examples: z.array(JudgeCalibrationExampleSchema).min(1),
});

export type JudgeCalibrationExample = z.infer<typeof JudgeCalibrationExampleSchema>;
export type JudgeCalibrationSet = z.infer<typeof JudgeCalibrationSetSchema>;

export const RagasMetricSchema = z.enum([
  "faithfulness",
  "answer_relevancy",
  "context_precision",
  "context_recall",
  "answer_correctness",
  "context_entity_recall",
  "noise_sensitivity",
  "answer_similarity",
]);

export type RagasMetric = z.infer<typeof RagasMetricSchema>;

export const RagasDatasetRecordSchema = z.object({
  sampleId: z.string(),
  question: z.string(),
  answer: z.string(),
  contexts: z.array(z.string()),
  contextIds: z.array(z.string()).default([]),
  referenceAnswer: z.string().optional(),
  groundTruthContexts: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RagasDatasetRecord = z.infer<typeof RagasDatasetRecordSchema>;

export const RagasConfigSchema = z.object({
  metrics: z.array(RagasMetricSchema).min(1),
  pythonExecutable: z.string().default("python3"),
  scriptPath: z.string(),
  outputDir: z.string(),
  sampleLimit: z.number().int().positive().optional(),
  environment: z.record(z.string(), z.string()).optional(),
});

export type RagasConfig = z.infer<typeof RagasConfigSchema>;

export const RagasSampleResultSchema = z.object({
  sampleId: z.string(),
  metrics: z.record(z.string(), z.number()),
  warnings: z.array(z.string()).default([]),
});

export type RagasSampleResult = z.infer<typeof RagasSampleResultSchema>;

export const RagasEvaluationResultSchema = z.object({
  runId: z.string(),
  metrics: z.record(z.string(), z.number()),
  samples: z.array(RagasSampleResultSchema),
  artifacts: z.object({
    resultsJson: z.string(),
    summaryMd: z.string(),
    metricsCsv: z.string(),
    configJson: z.string(),
    traceJson: z.string(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type RagasEvaluationResult = z.infer<typeof RagasEvaluationResultSchema>;

export const SyntheticQuestionTypeSchema = z.enum([
  "factual",
  "multi_hop",
  "comparison",
  "summarization",
  "definition",
  "relationship",
  "contradiction_check",
  "unanswerable",
  "citation_required",
]);

export type SyntheticQuestionType = z.infer<typeof SyntheticQuestionTypeSchema>;

export const SyntheticDifficultySchema = z.enum(["easy", "medium", "hard"]);
export type SyntheticDifficulty = z.infer<typeof SyntheticDifficultySchema>;

export const SyntheticRetrievalModeSchema = z.enum(["dense", "hybrid", "graph", "keyword"]);
export type SyntheticRetrievalMode = z.infer<typeof SyntheticRetrievalModeSchema>;

export const SyntheticGenerationMetadataSchema = z.object({
  generatorModel: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
  seed: z.number().int().optional(),
  notes: z.array(z.string()).default([]),
});

export type SyntheticGenerationMetadata = z.infer<typeof SyntheticGenerationMetadataSchema>;

export const SyntheticDatasetSampleSchema = z.object({
  id: z.string(),
  question: z.string(),
  referenceAnswer: z.string(),
  evidenceChunkIds: z.array(z.string()).min(1),
  sourceDocumentIds: z.array(z.string()).min(1),
  difficulty: SyntheticDifficultySchema,
  questionType: SyntheticQuestionTypeSchema,
  expectedRetrievalMode: SyntheticRetrievalModeSchema,
  generationMetadata: SyntheticGenerationMetadataSchema,
  validationStatus: z.enum(["approved", "rejected", "needs_review"]),
  validationIssues: z.array(z.string()).default([]),
});

export type SyntheticDatasetSample = z.infer<typeof SyntheticDatasetSampleSchema>;

export const SyntheticDatasetSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  createdAt: z.string(),
  samples: z.array(SyntheticDatasetSampleSchema),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type SyntheticDataset = z.infer<typeof SyntheticDatasetSchema>;

export const VersionedDatasetMetadataSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  corpusVersion: z.string(),
  generationDate: z.string(),
  generatorConfig: z.record(z.string(), z.unknown()),
  validationConfig: z.record(z.string(), z.unknown()),
  numberOfSamples: z.number().int().nonnegative(),
  metricCoverage: z.array(z.string()),
  difficultyDistribution: z.record(z.string(), z.number()),
  questionTypeDistribution: z.record(z.string(), z.number()),
});

export type VersionedDatasetMetadata = z.infer<typeof VersionedDatasetMetadataSchema>;

export const EvalModeSchema = z.enum([
  "baseline",
  "regression",
  "experiment",
  "provider-comparison",
  "retrieval-comparison",
  "prompt-comparison",
]);

export type EvalMode = z.infer<typeof EvalModeSchema>;

export const EvalSuiteSchema = z.object({
  suiteId: z.string(),
  metrics: z.array(z.string()).min(1),
  includes: z.object({
    customScorers: z.boolean().default(true),
    judge: z.boolean().default(false),
    ragas: z.boolean().default(false),
    syntheticDataset: z.boolean().default(false),
  }),
});

export type EvalSuite = z.infer<typeof EvalSuiteSchema>;

export const EvalArtifactManifestSchema = z.object({
  outputDir: z.string(),
  files: z.object({
    resultsJson: z.string(),
    summaryMd: z.string(),
    metricsCsv: z.string(),
    configJson: z.string(),
    traceJson: z.string(),
  }),
});

export type EvalArtifactManifest = z.infer<typeof EvalArtifactManifestSchema>;

export const EvalRunConfigSchema = z.object({
  datasetId: z.string().optional(),
  evalSuite: z.string(),
  metrics: z.array(z.string()).optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  judgeConfig: JudgeProviderConfigSchema.partial().optional(),
  ragasConfig: RagasConfigSchema.partial().optional(),
  syntheticConfig: z.record(z.string(), z.unknown()).optional(),
  pipelineConfig: z.record(z.string(), z.unknown()).optional(),
  outputDir: z.string().optional(),
  mode: EvalModeSchema.default("baseline"),
});

export type EvalRunConfig = z.infer<typeof EvalRunConfigSchema>;

export const EvalSampleResultSchema = z.object({
  sampleId: z.string(),
  question: z.string(),
  answer: z.string(),
  customScorers: z.record(z.string(), z.number()).default({}),
  judgeResults: z.array(JudgeAggregationResultSchema).default([]),
  ragasResults: z.record(z.string(), z.number()).default({}),
  warnings: z.array(z.string()).default([]),
});

export type EvalSampleResult = z.infer<typeof EvalSampleResultSchema>;

export const EvalOrchestratorRunSchema = z.object({
  runId: z.string(),
  mode: EvalModeSchema,
  suite: EvalSuiteSchema,
  dataset: z.object({
    datasetId: z.string(),
    datasetVersion: z.string().optional(),
  }),
  artifacts: EvalArtifactManifestSchema.optional(),
  summary: z.object({
    sampleCount: z.number().int().nonnegative(),
    metrics: z.record(z.string(), z.number()),
    estimatedCostUsd: z.number().nonnegative(),
    latencyMs: z.number().nonnegative(),
  }),
  samples: z.array(EvalSampleResultSchema),
  comparisons: z
    .array(
      z.object({
        baselineRunId: z.string(),
        candidateRunId: z.string(),
        metricDeltas: z.record(z.string(), z.number()),
      })
    )
    .default([]),
});

export type EvalOrchestratorRun = z.infer<typeof EvalOrchestratorRunSchema>;

export const EvalsRunRequestSchema = EvalRunConfigSchema;
export type EvalsRunRequest = z.infer<typeof EvalsRunRequestSchema>;

export const EvalsRunResponseSchema = EvalOrchestratorRunSchema;
export type EvalsRunResponse = z.infer<typeof EvalsRunResponseSchema>;

export const JudgeRequestSchema = z.object({
  sampleId: z.string().optional(),
  question: z.string(),
  answer: z.string(),
  referenceAnswer: z.string().optional(),
  retrievedContexts: z.array(
    z.object({
      chunkId: z.string(),
      text: z.string(),
    })
  ),
  metrics: z.array(JudgeMetricSchema).min(1),
  provider: JudgeProviderConfigSchema.partial().optional(),
});

export type JudgeRequest = z.infer<typeof JudgeRequestSchema>;

export const JudgeResponseSchema = JudgeRunSchema;
export type JudgeResponse = z.infer<typeof JudgeResponseSchema>;

export const RagasRequestSchema = z.object({
  datasetId: z.string().optional(),
  config: RagasConfigSchema.partial().extend({
    metrics: z.array(RagasMetricSchema).min(1),
    outputDir: z.string(),
  }),
  records: z.array(RagasDatasetRecordSchema).min(1),
});

export type RagasRequest = z.infer<typeof RagasRequestSchema>;

export const RagasResponseSchema = RagasEvaluationResultSchema;
export type RagasResponse = z.infer<typeof RagasResponseSchema>;

export const SyntheticDatasetRequestSchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  generatorModel: z.string(),
  promptVersion: z.string(),
  documents: z.array(
    z.object({
      documentId: z.string(),
      title: z.string().optional(),
      chunks: z.array(
        z.object({
          chunkId: z.string(),
          text: z.string(),
        })
      ),
    })
  ),
});

export type SyntheticDatasetRequest = z.infer<typeof SyntheticDatasetRequestSchema>;

export const SyntheticDatasetResponseSchema = SyntheticDatasetSchema;
export type SyntheticDatasetResponse = z.infer<typeof SyntheticDatasetResponseSchema>;

export const EvalDatasetSummarySchema = z.object({
  datasetId: z.string(),
  version: z.string(),
  sampleCount: z.number().int().nonnegative(),
  updatedAt: z.string(),
  source: z.string(),
});

export type EvalDatasetSummary = z.infer<typeof EvalDatasetSummarySchema>;
