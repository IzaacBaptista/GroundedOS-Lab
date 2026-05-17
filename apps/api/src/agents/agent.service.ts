/**
 * Agent Service
 *
 * Exposes agent execution as API endpoints.
 * Integrates DocumentQAAgent with RAG service for document retrieval.
 */

import { randomUUID } from "crypto";
import { Injectable } from '@nestjs/common';
import {
  DocumentQAAgent,
  type AgentResult,
  type AgentExecutionContext,
} from '@groundedos/agents';
import type { AgentExecuteRequest, AgentExecuteResponse } from '@groundedos/core';
import { createAgentTrace } from "../observability/trace-builders";
import type { CorrelationIds } from "../observability/trace-store";
import { TraceStore } from "../observability/trace-store";

export type { AgentExecuteRequest, AgentExecuteResponse };

@Injectable()
export class AgentService {
  private readonly traceStore = new TraceStore();

  async executeAgent(
    request: AgentExecuteRequest,
    correlation: CorrelationIds = {}
  ): Promise<AgentExecuteResponse> {
    if (request.agentType !== 'document-qa') {
      throw new Error(`Unsupported agent type: ${request.agentType}`);
    }

    const agent = new DocumentQAAgent();
    const agentExecutionId = correlation.agentExecutionId ?? randomUUID();
    const startedAt = Date.now();

    const context: AgentExecutionContext = {
      sessionId: request.sessionId || `session-${Date.now()}`,
      userId: correlation.userId,
      indexId: request.indexId,
      maxSteps: request.maxSteps ?? 5,
      timeout: 30000, // 30s timeout
      devMode: request.devMode ?? true,
    };

    const result: AgentResult = await agent.execute(context, request.query);

    const response: AgentExecuteResponse = {
      success: result.success,
      answer: result.answer,
      sources: result.sources,
      reasoning: result.reasoning,
      ...(request.devMode
        ? {
            devMode: {
              toolCalls: result.toolCalls.map((call) => ({
                id: call.id,
                toolName: call.toolName,
                input: call.input,
                output: call.output,
                status: call.status,
                error: call.error,
                durationMs: call.durationMs,
              })),
              state: {
                ...(result.state as unknown as Record<string, unknown>),
                correlation: {
                  requestId: correlation.requestId,
                  traceId: correlation.traceId,
                  sessionId: context.sessionId,
                  tenantId: correlation.tenantId,
                  userId: correlation.userId,
                  indexId: request.indexId,
                  agentExecutionId,
                },
              },
              durationMs: result.durationMs,
            },
          }
        : {}),
      error: result.error,
    };

    await this.traceStore.append(
      createAgentTrace({
        request,
        response,
        durationMs: Date.now() - startedAt,
        correlation: {
          ...correlation,
          sessionId: context.sessionId,
          indexId: request.indexId,
          agentExecutionId,
        },
      })
    );

    return response;
  }
}
