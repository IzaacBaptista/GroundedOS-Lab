/**
 * @packageDocumentation
 * core
 *
 * Shared foundational types, utilities and abstractions for the GroundedOS Lab
 * monorepo. Every other package and app imports from here — never the reverse.
 */
// Runtime validation (Phase 2 — Data Contracts & Schema Validation)
export { ContractViolationError, validateNormalizedDocument, validateDocumentSection, validateRetrievalChunk, validateEmbeddedChunk, validateVectorSearchResult, validateRagAskResponse, validateProcessedQuery, validateRetrievalChunks, validateEmbeddedChunks, validateVectorSearchResults, } from "./validation/index";
export { NormalizedDocumentSchema, RetrievalChunkSchema, EmbeddedChunkSchema, VectorSearchResultSchema, ProcessedQuerySchema, RagAskResponseSchema, } from "./validation/schemas";
export { WorkflowRunner } from "./workflow/runner";
//# sourceMappingURL=index.js.map