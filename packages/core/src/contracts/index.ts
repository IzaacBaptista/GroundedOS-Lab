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
