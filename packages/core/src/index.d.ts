/**
 * @packageDocumentation
 * core
 *
 * Shared foundational types, utilities and abstractions for the GroundedOS Lab
 * monorepo. Every other package and app imports from here — never the reverse.
 */
export type { DocumentModality, DocumentStatus, DocumentSection, SourceDocument, NormalizedDocument, } from "./types/document";
export type { IngestionInput } from "./types/ingestion";
export type { Extractor } from "./types/extractor";
export type { RawQuery, ProcessedQuery, QueryIntent } from "./types/query";
export { ContractViolationError, validateNormalizedDocument, validateDocumentSection, validateRetrievalChunk, validateEmbeddedChunk, validateVectorSearchResult, validateRagAskResponse, validateProcessedQuery, validateRetrievalChunks, validateEmbeddedChunks, validateVectorSearchResults, } from "./validation/index";
export { NormalizedDocumentSchema, RetrievalChunkSchema, EmbeddedChunkSchema, VectorSearchResultSchema, ProcessedQuerySchema, RagAskResponseSchema, } from "./validation/schemas";
export type { StepStatus, WorkflowStep, WorkflowContext, WorkflowResult, } from "./workflow/types";
export { WorkflowRunner } from "./workflow/runner";
