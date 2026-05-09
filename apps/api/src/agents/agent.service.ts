/**
 * Agent Service
 *
 * Orchestrates agent execution with rich context injection:
 *   1. Fetches relevant session memory entries (MemoryStore.search)
 *   2. Runs model routing to pick the best model (routeModel)
 *   3. Builds a fully-populated AgentExecutionContext
 *   4. Selects and runs the requested agent type
 *
 * Supported agent types: document-qa | research | safety-guard
 */

import { Injectable } from '@nestjs/common';
import {
  DocumentQAAgent,
  ResearchAgent,
  SafetyGuardAgent,
  type AgentResult,
  type AgentExecutionContext,
} from '@groundedos/agents';
import { FileSessionMemoryStore } from '@groundedos/memory';
import { routeModel } from '@groundedos/model-routing';

export type AgentType = 'document-qa' | 'research' | 'safety-guard';

export type AgentExecuteRequest = {
  agentType: AgentType;
  indexId?: string;
  indexDir?: string;
  query: string;
  sessionId?: string;
  maxSteps?: number;
  devMode?: boolean;
  /** Language for the agent response. Defaults to 'en-US'. */
  language?: string;
};

export type AgentExecuteResponse = {
  success: boolean;
  answer?: string;
  sources: string[];
  reasoning: string[];
  /** Model selected by the router for this request. */
  selectedModel?: string;
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
  private readonly memoryStore = new FileSessionMemoryStore();

  async executeAgent(request: AgentExecuteRequest): Promise<AgentExecuteResponse> {
    const sessionId = request.sessionId ?? `session-${Date.now()}`;

    // 1. Fetch relevant memory entries for this session
    let memoryEntries: AgentExecutionContext['memoryEntries'] = [];
    try {
      const memResults = await this.memoryStore.search(sessionId, request.query, 3);
      memoryEntries = memResults.map((r) => ({ ...r.entry }));
    } catch {
      // Memory retrieval is best-effort; never block agent execution
    }

    // 2. Run model routing based on query intent
    const routingDecision = routeModel(request.query);

    // 3. Build the rich execution context
    const context: AgentExecutionContext = {
      sessionId,
      indexId: request.indexId,
      maxSteps: request.maxSteps ?? 5,
      timeout: 30000,
      devMode: request.devMode ?? true,
      language: request.language ?? 'en-US',
      memoryEntries,
      routingDecision,
    };

    // 4. Select and execute agent
    const agent = this.createAgent(request.agentType);
    const result: AgentResult = await agent.execute(context, request.query);

    // 5. Persist the turn in session memory
    try {
      if (result.success && result.answer) {
        await this.memoryStore.append({
          sessionId,
          query: request.query,
          answer: result.answer,
        });
      }
    } catch {
      // Persistence failure is non-fatal
    }

    return {
      success: result.success,
      answer: result.answer,
      sources: result.sources,
      reasoning: result.reasoning,
      selectedModel: routingDecision.selectedModel,
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

  private createAgent(agentType: AgentType) {
    switch (agentType) {
      case 'document-qa':
        return new DocumentQAAgent();
      case 'research':
        return new ResearchAgent();
      case 'safety-guard':
        return new SafetyGuardAgent();
      default: {
        const exhaustive: never = agentType;
        throw new Error(`Unsupported agent type: ${exhaustive}`);
      }
    }
  }
}
