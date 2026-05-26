/**
 * Stable API contract schemas for GroundedOS Lab endpoints.
 *
 * Re-exports Zod schemas and their inferred TypeScript types so that
 * consumers can import both the runtime validator and the static type
 * from the same location.
 */

export {
  AgentExecuteRequestSchema,
  AgentToolCallSchema,
  AgentExecuteResponseSchema,
  AgentReActRequestSchema,
  AgentReActResponseSchema,
  AgentMultiRequestSchema,
  AgentMultiResponseSchema,
  AgentPlanRequestSchema,
  AgentPlanResponseSchema,
  RagAskRequestBodySchema,
  RagIndexRequestBodySchema,
  ApiValidationErrorItemSchema,
  ApiErrorEnvelopeSchema,
  ApiEmbeddingProviderIdSchema,
} from "./api-schemas";

export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentReActRequest,
  AgentReActResponse,
  AgentMultiRequest,
  AgentMultiResponse,
  AgentPlanRequest,
  AgentPlanResponse,
  RagAskRequestBody,
  RagIndexRequestBody,
  ApiValidationErrorItem,
  ApiErrorEnvelope,
} from "./api-schemas";

export {
  ExecutionSnapshotSchema,
  ReplayComparisonReportSchema,
} from "./replay-schemas";

export type {
  ExecutionSnapshot,
  ReplaySnapshot,
  ReplayComparisonReport,
  ReplayComparisonResult,
} from "./replay-schemas";

export {
  EvaluatorOutputSchema,
  EvalRunSampleSchema,
  EvalRunSummarySchema,
  EvalReportSchema,
  EvalRunComparisonReportSchema,
  EvalMetricResultSchema,
  EvalRunResultSchema,
} from "./eval-schemas";

export type {
  EvaluatorOutput,
  EvalRunSample,
  EvalRunSummary,
  EvalReport,
  EvalRunComparisonReport,
  EvalMetricResult,
  EvalRunResult,
} from "./eval-schemas";

export {
  JudgeMetricSchema,
  JudgeRubricLevelSchema,
  JudgeRubricSchema,
  JudgePromptTemplateSchema,
  JudgeProviderConfigSchema,
  JudgeEvaluationResultSchema,
  JudgeTraceSchema,
  JudgeAggregationResultSchema,
  JudgeRunSchema,
  JudgeCalibrationExampleSchema,
  JudgeCalibrationSetSchema,
  RagasMetricSchema,
  RagasDatasetRecordSchema,
  RagasConfigSchema,
  RagasSampleResultSchema,
  RagasEvaluationResultSchema,
  SyntheticQuestionTypeSchema,
  SyntheticDifficultySchema,
  SyntheticRetrievalModeSchema,
  SyntheticGenerationMetadataSchema,
  SyntheticDatasetSampleSchema,
  SyntheticDatasetSchema,
  VersionedDatasetMetadataSchema,
  EvalModeSchema,
  EvalSuiteSchema,
  EvalArtifactManifestSchema,
  EvalRunConfigSchema,
  EvalSampleResultSchema,
  EvalOrchestratorRunSchema,
  EvalsRunRequestSchema,
  EvalsRunResponseSchema,
  JudgeRequestSchema,
  JudgeResponseSchema,
  RagasRequestSchema,
  RagasResponseSchema,
  SyntheticDatasetRequestSchema,
  SyntheticDatasetResponseSchema,
  EvalDatasetSummarySchema,
} from "./advanced-eval-schemas";

export type {
  JudgeMetric,
  JudgeRubricLevel,
  JudgeRubric,
  JudgePromptTemplate,
  JudgeProviderConfig,
  JudgeEvaluationResult,
  JudgeTrace,
  JudgeAggregationResult,
  JudgeRun,
  JudgeCalibrationExample,
  JudgeCalibrationSet,
  RagasMetric,
  RagasDatasetRecord,
  RagasConfig,
  RagasSampleResult,
  RagasEvaluationResult,
  SyntheticQuestionType,
  SyntheticDifficulty,
  SyntheticRetrievalMode,
  SyntheticGenerationMetadata,
  SyntheticDatasetSample,
  SyntheticDataset,
  VersionedDatasetMetadata,
  EvalMode,
  EvalSuite,
  EvalArtifactManifest,
  EvalRunConfig,
  EvalSampleResult,
  EvalOrchestratorRun,
  EvalsRunRequest,
  EvalsRunResponse,
  JudgeRequest,
  JudgeResponse,
  RagasRequest,
  RagasResponse,
  SyntheticDatasetRequest,
  SyntheticDatasetResponse,
  EvalDatasetSummary,
} from "./advanced-eval-schemas";

export { ExperimentRunMetadataSchema } from "./experiment-schemas";
export type { ExperimentRunMetadata } from "./experiment-schemas";

export { DatasetEntrySchema, DatasetSchema } from "./dataset-schemas";
export { loadGoldenDataset } from "./dataset-loader";

export type {
  DatasetEntry,
  DatasetSchemaType,
  GoldenDataset,
  GoldenDatasetItem,
} from "./dataset-schemas";
