/**
 * API-level Zod schemas for stable input/output contracts.
 *
 * These schemas define the strict surface of HTTP endpoints exposed by
 * @groundedos/api. Unknown fields are rejected (`.strict()`), missing required
 * fields produce field-level errors, and inferred TypeScript types derived here
 * serve as the single source of truth for request/response shapes.
 *
 * Validation is applied at the controller layer so that any contract violation
 * is caught before it reaches service logic.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const ApiEmbeddingProviderIdSchema = z.enum([
  "api-lexical",
  "local-hash",
  "ollama",
  "openai",
]);

// ---------------------------------------------------------------------------
// Agent endpoints — POST /agents/execute
// ---------------------------------------------------------------------------

export const AgentExecuteRequestSchema = z
  .object({
    /** Agent variant to run.  Currently only "document-qa" is supported. */
    agentType: z.enum(["document-qa"]),
    /** Natural language question the agent must answer. */
    query: z.string().min(1, "query must be a non-empty string"),
    /** Persisted index document ID to query against. */
    indexId: z.string().optional(),
    /** Filesystem path to a local index directory (dev/local use). */
    indexDir: z.string().optional(),
    /** Session ID for memory recall across turns. */
    sessionId: z.string().optional(),
    /** Maximum reasoning steps before the agent halts. */
    maxSteps: z.number().int().positive().max(20).optional(),
    /** When true the response includes tool-call traces. */
    devMode: z.boolean().optional(),
  })
  .strict();

export type AgentExecuteRequest = z.infer<typeof AgentExecuteRequestSchema>;

export const AgentToolCallSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  output: z.unknown().optional(),
  status: z.string(),
  error: z.string().optional(),
  durationMs: z.number(),
});

export const AgentExecuteResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string().optional(),
  sources: z.array(z.string()),
  reasoning: z.array(z.string()),
  devMode: z
    .object({
      toolCalls: z.array(AgentToolCallSchema),
      state: z.record(z.string(), z.unknown()),
      durationMs: z.number(),
    })
    .optional(),
  error: z.string().optional(),
});

export type AgentExecuteResponse = z.infer<typeof AgentExecuteResponseSchema>;

// ---------------------------------------------------------------------------
// Agent endpoint — POST /agents/react
// ---------------------------------------------------------------------------

export const AgentReActRequestSchema = z
  .object({
    /** Natural language query to answer via the ReAct loop. */
    query: z.string().min(1, "query must be a non-empty string"),
    /** Persisted index document ID to query against. */
    indexId: z.string().optional(),
    /** Session ID for memory recall across turns. */
    sessionId: z.string().optional(),
    /** Maximum number of ReAct steps. */
    maxSteps: z.number().int().positive().max(20).optional(),
    /** Maximum total run time in milliseconds. */
    maxLatencyMs: z.number().int().positive().optional(),
    /** Per-tool timeout in milliseconds. */
    toolTimeoutMs: z.number().int().positive().optional(),
    /** Minimum confidence threshold to continue loop (0–1). */
    minConfidenceThreshold: z.number().min(0).max(1).optional(),
    /** Comma-separated list of allowed tool names. */
    allowedTools: z.array(z.string()).optional(),
    /** When true the response includes the full ReAct trace. */
    devMode: z.boolean().optional(),
  })
  .strict();

export type AgentReActRequest = z.infer<typeof AgentReActRequestSchema>;

export const AgentReActResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string().optional(),
  sources: z.array(z.string()),
  terminationReason: z.string(),
  totalSteps: z.number(),
  totalDurationMs: z.number(),
  devMode: z
    .object({
      steps: z.array(
        z.object({
          stepId: z.string(),
          stepNumber: z.number(),
          type: z.string(),
          content: z.string(),
          confidence: z.number().optional(),
          timestamp: z.number(),
          durationMs: z.number().optional(),
        }),
      ),
      confidencePerStep: z.array(z.number()),
      terminationReason: z.string(),
      toolCallCount: z.number(),
      uniqueToolsUsed: z.array(z.string()),
      loopDetected: z.boolean(),
    })
    .optional(),
  error: z.string().optional(),
});

export type AgentReActResponse = z.infer<typeof AgentReActResponseSchema>;

// ---------------------------------------------------------------------------
// Agent endpoint — POST /agents/multi
// ---------------------------------------------------------------------------

export const AgentMultiRequestSchema = z
  .object({
    /** Natural language query to answer via multi-agent pipeline. */
    query: z.string().min(1, "query must be a non-empty string"),
    /** Persisted index document ID. */
    indexId: z.string().optional(),
    /** Session ID. */
    sessionId: z.string().optional(),
    /** Maximum steps across all agents. */
    maxSteps: z.number().int().positive().max(40).optional(),
    /** Global timeout in milliseconds. */
    maxLatencyMs: z.number().int().positive().optional(),
    /** When true the response includes multi-agent traces. */
    devMode: z.boolean().optional(),
  })
  .strict();

export type AgentMultiRequest = z.infer<typeof AgentMultiRequestSchema>;

export const AgentMultiResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string().optional(),
  sources: z.array(z.string()),
  totalDurationMs: z.number(),
  devMode: z
    .object({
      agents: z.array(
        z.object({
          agentId: z.string(),
          agentName: z.string(),
          role: z.string(),
          activatedAt: z.number(),
          completedAt: z.number().optional(),
          stepsExecuted: z.number(),
        }),
      ),
      handoffs: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          reason: z.string(),
          evidenceCount: z.number(),
          status: z.string(),
        }),
      ),
      decisions: z.array(
        z.object({
          decisionId: z.string(),
          agentId: z.string(),
          description: z.string(),
          rationale: z.string(),
          timestamp: z.number(),
          outcome: z.string().optional(),
        }),
      ),
      criticalGaps: z.array(z.string()),
      evidenceSummary: z.array(z.string()),
    })
    .optional(),
  error: z.string().optional(),
});

export type AgentMultiResponse = z.infer<typeof AgentMultiResponseSchema>;

// ---------------------------------------------------------------------------
// Agent endpoint — POST /agents/plan
// ---------------------------------------------------------------------------

export const AgentPlanRequestSchema = z
  .object({
    /** Natural language objective for the planner. */
    query: z.string().min(1, "query must be a non-empty string"),
    /** Persisted index document ID. */
    indexId: z.string().optional(),
    /** Session ID. */
    sessionId: z.string().optional(),
    /** Planning strategy to use. */
    planningStrategy: z.enum(["plan-and-execute", "tree-of-plans"]).optional(),
    /** Maximum steps for the plan executor. */
    maxSteps: z.number().int().positive().max(40).optional(),
    /** Maximum cost in USD. */
    maxCostUsd: z.number().positive().optional(),
    /** Global timeout in milliseconds. */
    maxLatencyMs: z.number().int().positive().optional(),
    /** When true the response includes the planning trace. */
    devMode: z.boolean().optional(),
  })
  .strict();

export type AgentPlanRequest = z.infer<typeof AgentPlanRequestSchema>;

export const AgentPlanResponseSchema = z.object({
  success: z.boolean(),
  answer: z.string().optional(),
  sources: z.array(z.string()),
  planId: z.string().optional(),
  totalDurationMs: z.number(),
  replanCount: z.number(),
  devMode: z
    .object({
      plan: z.record(z.string(), z.unknown()).optional(),
      events: z.array(
        z.object({
          eventId: z.string(),
          type: z.string(),
          nodeId: z.string().optional(),
          description: z.string(),
          timestamp: z.number(),
        }),
      ),
      planEvaluation: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  error: z.string().optional(),
});

export type AgentPlanResponse = z.infer<typeof AgentPlanResponseSchema>;

// ---------------------------------------------------------------------------
// RAG endpoints — POST /rag/ask  (JSON body only; multipart is separate)
// ---------------------------------------------------------------------------

export const RagAskRequestBodySchema = z
  .object({
    /** Input modality.  Only "text" is valid for the JSON API. */
    type: z.enum(["text"]).optional(),
    /**
     * Full text content to index and query in a single call.
     * Omit to query against a previously persisted index (requires documentId).
     */
    content: z
      .string()
      .min(1, "content must be a non-empty string")
      .optional(),
    /** Natural language question. */
    query: z.string().min(1, "query must be a non-empty string"),
    /** Session ID for cross-turn memory. */
    sessionId: z.string().optional(),
    /** Number of chunks to retrieve (positive integer). */
    topK: z.number().int().positive().optional(),
    /** Human-readable document title. */
    title: z.string().optional(),
    /** Stable document identifier (used for index deduplication). */
    documentId: z.string().optional(),
    /** Arbitrary key-value metadata attached to the document. */
    metadata: z.record(z.string(), z.unknown()).optional(),
    /** Local filesystem path for an existing index directory. */
    indexDir: z.string().optional(),
    /** Embedding backend to use. */
    embeddingProvider: ApiEmbeddingProviderIdSchema.optional(),
    /** Enable multi-model orchestration for the answer step. */
    useMultiModelOrchestration: z.boolean().optional(),
    /** Enable chain-of-thought reasoning traces. */
    reasoningEnabled: z.boolean().optional(),
    /** Run a shadow retrieval pass for cache quality checks. */
    enableShadowRetrieval: z.boolean().optional(),
  })
  .strict();

export type RagAskRequestBody = z.infer<typeof RagAskRequestBodySchema>;

// ---------------------------------------------------------------------------
// RAG endpoints — POST /rag/index  (JSON body only)
// ---------------------------------------------------------------------------

export const RagIndexRequestBodySchema = z
  .object({
    /** Document modality.  Only "text" is valid for the JSON API. */
    type: z.enum(["text"]).optional(),
    /** Full text content to index. */
    content: z.string().min(1, "content must be a non-empty string"),
    /** Human-readable document title. */
    title: z.string().optional(),
    /** Stable document identifier. */
    documentId: z.string().optional(),
    /** Arbitrary metadata. */
    metadata: z.record(z.string(), z.unknown()).optional(),
    /** Filesystem path for an existing index directory. */
    indexDir: z.string().optional(),
    /** Embedding backend. */
    embeddingProvider: ApiEmbeddingProviderIdSchema.optional(),
  })
  .strict();

export type RagIndexRequestBody = z.infer<typeof RagIndexRequestBodySchema>;

// ---------------------------------------------------------------------------
// Error response envelope
// ---------------------------------------------------------------------------

export const ApiValidationErrorItemSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export type ApiValidationErrorItem = z.infer<typeof ApiValidationErrorItemSchema>;

export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    message: z.string(),
    errorCode: z.string(),
    requestId: z.string(),
    details: z.string().optional(),
    validationErrors: z.array(ApiValidationErrorItemSchema).optional(),
  }),
});

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;
