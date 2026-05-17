/**
 * Agent Service
 *
 * Exposes agent execution as API endpoints.
 * Integrates DocumentQAAgent with RAG service for document retrieval.
 */

import { Injectable } from '@nestjs/common';
import {
  DocumentQAAgent,
  type AgentResult,
  type AgentExecutionContext,
} from '@groundedos/agents';
import type { AgentExecuteRequest, AgentExecuteResponse } from '@groundedos/core';

export type { AgentExecuteRequest, AgentExecuteResponse };

@Injectable()
export class AgentService {
  async executeAgent(request: AgentExecuteRequest): Promise<AgentExecuteResponse> {
    if (request.agentType !== 'document-qa') {
      throw new Error(`Unsupported agent type: ${request.agentType}`);
    }

    const agent = new DocumentQAAgent();

    const context: AgentExecutionContext = {
      sessionId: request.sessionId || `session-${Date.now()}`,
      indexId: request.indexId,
      maxSteps: request.maxSteps ?? 5,
      timeout: 30000, // 30s timeout
      devMode: request.devMode ?? true,
    };

    const result: AgentResult = await agent.execute(context, request.query);

    return {
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
              state: result.state as unknown as Record<string, unknown>,
              durationMs: result.durationMs,
            },
          }
        : {}),
      error: result.error,
    };
  }
}
