/**
 * @packageDocumentation
 * core
 *
 * Shared foundational types, utilities and abstractions for the GroundedOS Lab
 * monorepo. Every other package and app imports from here — never the reverse.
 */

// Document schema (Phase 0 — Data Foundation)
export type {
  DocumentModality,
  DocumentStatus,
  DocumentSection,
  SourceDocument,
  NormalizedDocument,
} from "./types/document";

// Ingestion contract (Phase 0 — Multimodal Ingestion Standardization)
export type { IngestionInput } from "./types/ingestion";
export type { Extractor } from "./types/extractor";

// Query types (Phase 2 — Query Understanding)
export type { RawQuery, ProcessedQuery, QueryIntent } from "./types/query";

// Runtime validation (Phase 2 — Data Contracts & Schema Validation)
export {
  ContractViolationError,
  ZodValidationError,
  validateNormalizedDocument,
  validateDocumentSection,
  validateRetrievalChunk,
  validateEmbeddedChunk,
  validateVectorSearchResult,
  validateRagAskResponse,
  validateProcessedQuery,
  validateRetrievalChunks,
  validateEmbeddedChunks,
  validateVectorSearchResults,
  validateApiInput,
} from "./validation/index";

export {
  NormalizedDocumentSchema,
  RetrievalChunkSchema,
  EmbeddedChunkSchema,
  VectorSearchResultSchema,
  ProcessedQuerySchema,
  RagAskResponseSchema,
} from "./validation/schemas";

// API contracts (Phase 3 — Structured Contracts & Schema Validation)
export {
  AgentExecuteRequestSchema,
  AgentToolCallSchema,
  AgentExecuteResponseSchema,
  RagAskRequestBodySchema,
  RagIndexRequestBodySchema,
  ApiValidationErrorItemSchema,
  ApiErrorEnvelopeSchema,
  ApiEmbeddingProviderIdSchema,
  ExecutionSnapshotSchema,
  ReplayComparisonReportSchema,
  EvaluatorOutputSchema,
  EvalRunSampleSchema,
  EvalRunSummarySchema,
  EvalReportSchema,
  EvalRunComparisonReportSchema,
  EvalMetricResultSchema,
  EvalRunResultSchema,
  ExperimentRunMetadataSchema,
  DatasetEntrySchema,
  DatasetSchema,
  loadGoldenDataset,
} from "./contracts/index";

export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  RagAskRequestBody,
  RagIndexRequestBody,
  ApiValidationErrorItem,
  ApiErrorEnvelope,
  ExecutionSnapshot,
  ReplaySnapshot,
  ReplayComparisonReport,
  ReplayComparisonResult,
  EvaluatorOutput,
  EvalRunSample,
  EvalRunSummary,
  EvalReport,
  EvalRunComparisonReport,
  EvalMetricResult,
  EvalRunResult,
  ExperimentRunMetadata,
  DatasetEntry,
  DatasetSchemaType,
  GoldenDataset,
  GoldenDatasetItem,
} from "./contracts/index";

// Workflow engine (Phase 2 — Workflow Orchestration)
export type {
  StepStatus,
  WorkflowStep,
  WorkflowContext,
  WorkflowResult,
} from "./workflow/types";
export { WorkflowRunner } from "./workflow/runner";
