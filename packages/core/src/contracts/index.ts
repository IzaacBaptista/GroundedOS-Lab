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
  RagAskRequestBodySchema,
  RagIndexRequestBodySchema,
  ApiValidationErrorItemSchema,
  ApiErrorEnvelopeSchema,
  ApiEmbeddingProviderIdSchema,
} from "./api-schemas";

export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
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
} from "./eval-schemas";

export type {
  EvaluatorOutput,
  EvalRunSample,
  EvalRunSummary,
  EvalReport,
  EvalRunComparisonReport,
} from "./eval-schemas";

export { DatasetEntrySchema, DatasetSchema } from "./dataset-schemas";
export { loadGoldenDataset } from "./dataset-loader";

export type {
  DatasetEntry,
  DatasetSchemaType,
  GoldenDataset,
  GoldenDatasetItem,
} from "./dataset-schemas";
