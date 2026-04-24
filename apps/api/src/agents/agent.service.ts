/**
 * Agent Controller
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

export type AgentExecuteRequest = {
  agentType: 'document-qa';
  indexId?: string;
  indexDir?: string;
  query: string;
  sessionId?: string;
  maxSteps?: number;
  devMode?: boolean;
};

export type AgentExecuteResponse = {
  success: boolean;
  answer?: string;
  sources: string[];
  reasoning: string[];
  devMode?: {
    toolCalls: Array<{
      id: string;
      toolName: string;
      input: Record<string, unknown>;
      output?: unknown;
      status: string;
      error?: string;
      durationMs: number;
    }>;
    state: Record<string, unknown>;
    durationMs: number;
  };
  error?: string;
};

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
