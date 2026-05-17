import type { AgentExecuteRequest, AgentExecuteResponse } from "@groundedos/core";
import type { RagAskRequest, RagAskResponse } from "../rag-service";
import type { CorrelationIds, StructuredTraceRecord } from "./trace-store";

function withDefaults(correlation: CorrelationIds): CorrelationIds {
  return {
    requestId: correlation.requestId,
    traceId: correlation.traceId,
    sessionId: correlation.sessionId,
    jobId: correlation.jobId,
    tenantId: correlation.tenantId,
    userId: correlation.userId,
    indexId: correlation.indexId,
    agentExecutionId: correlation.agentExecutionId,
  };
}

export function createRagSuccessTrace(input: {
  request: RagAskRequest;
  response: RagAskResponse;
  durationMs: number;
  correlation: CorrelationIds;
}): StructuredTraceRecord {
  const { request, response, durationMs, correlation } = input;
  const retrievalStage = response.devMode.retrievalSpans?.find((item) => item.stage === "retrieve-chunks");
  const rerankStage = response.devMode.retrievalSpans?.find((item) => item.stage === "rerank-chunks");
  const stageSteps = response.devMode.workflowContext
    ? Object.entries(response.devMode.workflowContext.steps).map(([name, step]) => ({
        name,
        status: step.status,
        durationMs: step.durationMs ?? 0,
      }))
    : [];

  return {
    version: "v1",
    timestamp: new Date().toISOString(),
    component: "retrieval",
    operation: "rag.pipeline",
    status: "success",
    durationMs,
    provider: response.index.embeddingProvider,
    model: response.index.embeddingModel?.model,
    correlation: withDefaults({
      ...correlation,
      sessionId: correlation.sessionId ?? request.sessionId,
      indexId: correlation.indexId ?? request.documentId ?? response.document.documentId,
    }),
    metadata: {
      topK: request.topK,
      query: response.query,
      resultCount: response.devMode.resultCount,
      retrievalMs: retrievalStage?.latencyMs ?? 0,
      rerankingMs: rerankStage?.latencyMs ?? 0,
      retrievalChunkCount: retrievalStage?.chunkCount ?? 0,
      rerankChunkCount: rerankStage?.chunkCount ?? 0,
      retrievalHitQuality: response.devMode.evals?.retrievalAccuracy,
      groundedness: response.devMode.evals?.groundedness,
      confidenceScore: response.devMode.evals?.confidence?.confidenceScore,
      confidenceLevel: response.devMode.evals?.confidence?.confidenceLevel,
      failureCategory: response.devMode.evals?.taxonomy?.category,
      failureProbableCause: response.devMode.evals?.taxonomy?.probableCause,
      costUsd: response.devMode.cost?.totalCostUsd,
      cacheHit: response.devMode.cache?.hit,
      retries: 0,
      filters: request.metadata,
      chunks: response.devMode.results.map((item) => ({
        chunkId: item.chunkId,
        score: item.score,
        provider: item.embedding.provider,
      })),
      replay: response.devMode.replay
        ? {
            reproducible: response.devMode.replay.reproducible,
            command: response.devMode.replay.command,
            mode: response.devMode.replay.snapshot.mode,
          }
        : undefined,
      retrievalDiagnostics: response.devMode.retrievalDiagnostics,
      reportReferences: response.devMode.reportReferences,
      stageSteps,
    },
  };
}

export function createRagErrorTrace(input: {
  request: RagAskRequest;
  correlation: CorrelationIds;
  durationMs: number;
  error: unknown;
}): StructuredTraceRecord {
  return {
    version: "v1",
    timestamp: new Date().toISOString(),
    component: "retrieval",
    operation: "rag.pipeline",
    status: "error",
    durationMs: input.durationMs,
    correlation: withDefaults({
      ...input.correlation,
      sessionId: input.correlation.sessionId ?? input.request.sessionId,
      indexId: input.correlation.indexId ?? input.request.documentId,
    }),
    error: {
      message: input.error instanceof Error ? input.error.message : String(input.error),
    },
    metadata: {
      topK: input.request.topK,
      query: input.request.query,
      retries: 0,
    },
  };
}

export function createAgentTrace(input: {
  request: AgentExecuteRequest;
  response: AgentExecuteResponse;
  durationMs: number;
  correlation: CorrelationIds;
}): StructuredTraceRecord {
  const toolCalls = input.response.devMode?.toolCalls ?? [];

  return {
    version: "v1",
    timestamp: new Date().toISOString(),
    component: "agent",
    operation: "agent.execution",
    status: input.response.success ? "success" : "error",
    durationMs: input.durationMs,
    correlation: withDefaults({
      ...input.correlation,
      sessionId: input.correlation.sessionId ?? input.request.sessionId,
      indexId: input.correlation.indexId ?? input.request.indexId,
    }),
    metadata: {
      agentType: input.request.agentType,
      maxSteps: input.request.maxSteps,
      toolSequence: toolCalls.map((call) => call.toolName),
      toolDurations: toolCalls.map((call) => ({ toolName: call.toolName, durationMs: call.durationMs })),
      retries: toolCalls.filter((call) => call.status === "error").length,
      failureCount: toolCalls.filter((call) => call.status === "error").length,
      reasoningSummary: input.response.reasoning.slice(-5),
      context: {
        sessionId: input.request.sessionId,
        indexId: input.request.indexId,
      },
    },
    ...(input.response.error
      ? {
          error: {
            message: input.response.error,
          },
        }
      : {}),
  };
}
