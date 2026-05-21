/**
 * Agent Service
 *
 * Exposes agent execution as API endpoints.
 * Integrates DocumentQAAgent with RAG service for document retrieval.
 * Supports:
 * - POST /agents/execute — DocumentQA agent (existing)
 * - POST /agents/react   — ReAct loop runner
 * - POST /agents/multi   — Multi-agent pipeline
 * - POST /agents/plan    — Long-horizon planning executor
 */

import { randomUUID } from "crypto";
import { Injectable } from '@nestjs/common';
import {
  DocumentQAAgent,
  ReActRunner,
  MultiAgentRunner,
  PlannerAgent,
  PlanExecutor,
  PlanCritic,
  type AgentResult,
  type AgentExecutionContext,
  type AgentObservation,
  type ReActReasoningResult,
} from '@groundedos/agents';
import type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentReActRequest,
  AgentReActResponse,
  AgentMultiRequest,
  AgentMultiResponse,
  AgentPlanRequest,
  AgentPlanResponse,
} from '@groundedos/core';
import { createAgentTrace } from "../observability/trace-builders";
import type { CorrelationIds } from "../observability/trace-store";
import { TraceStore } from "../observability/trace-store";

export type {
  AgentExecuteRequest,
  AgentExecuteResponse,
  AgentReActRequest,
  AgentReActResponse,
  AgentMultiRequest,
  AgentMultiResponse,
  AgentPlanRequest,
  AgentPlanResponse,
};

@Injectable()
export class AgentService {
  private readonly traceStore = new TraceStore();

  // ---------------------------------------------------------------------------
  // POST /agents/execute — DocumentQA (existing, unchanged)
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // POST /agents/react — Full ReAct loop
  // ---------------------------------------------------------------------------

  async executeReAct(
    request: AgentReActRequest,
    correlation: CorrelationIds = {}
  ): Promise<AgentReActResponse> {
    const startedAt = Date.now();

    const context: AgentExecutionContext = {
      sessionId: request.sessionId ?? `session-${Date.now()}`,
      userId: correlation.userId,
      indexId: request.indexId,
      maxSteps: request.maxSteps ?? 10,
      timeout: request.maxLatencyMs ?? 60_000,
      devMode: request.devMode ?? false,
    };

    // Use DocumentQAAgent as the reasoning engine for the ReAct loop
    const agent = new DocumentQAAgent();
    const runner = new ReActRunner({
      maxSteps: context.maxSteps,
      timeoutMs: context.timeout,
      toolTimeoutMs: request.toolTimeoutMs ?? 15_000,
      minConfidenceThreshold: request.minConfidenceThreshold ?? 0.1,
      devMode: context.devMode,
    });

    // Delegate reasoning to the agent's reasoningStep via the ReAct runner
    const trace = await runner.run(
      request.query,
      context,
      (agent as any).toolRegistry,
      async (
        input: string,
        observations: AgentObservation[],
        stepNumber: number,
      ): Promise<ReActReasoningResult> => {
        // Temporarily advance the agent's internal step counter
        (agent as any).state.currentStep = stepNumber;
        (agent as any).state.toolCalls = observations.map((o) => ({
          id: o.stepId,
          toolName: o.toolName,
          input: o.result.input,
          output: o.result.rawOutput,
          status: o.result.status,
          error: o.result.error,
          durationMs: o.result.durationMs,
        }));

        const reasoningResult = await (agent as any).reasoningStep(input, context);
        return {
          reasoning: reasoningResult.reasoning,
          confidence: 0.85,
          toolName: reasoningResult.toolName,
          toolInput: reasoningResult.toolInput,
          directAnswer: reasoningResult.directAnswer,
        };
      },
      agent.id,
      agent.name,
    );

    const response: AgentReActResponse = {
      success: !!trace.finalAnswer,
      answer: trace.finalAnswer?.answer,
      sources: trace.finalAnswer?.sources ?? [],
      terminationReason: trace.terminationReason,
      totalSteps: trace.steps.length,
      totalDurationMs: trace.totalDurationMs,
      ...(request.devMode && trace.devMode
        ? { devMode: trace.devMode }
        : {}),
    };

    return response;
  }

  // ---------------------------------------------------------------------------
  // POST /agents/multi — Multi-agent pipeline
  // ---------------------------------------------------------------------------

  async executeMultiAgent(
    request: AgentMultiRequest,
    correlation: CorrelationIds = {}
  ): Promise<AgentMultiResponse> {
    const startedAt = Date.now();

    const context: AgentExecutionContext = {
      sessionId: request.sessionId ?? `session-${Date.now()}`,
      userId: correlation.userId,
      indexId: request.indexId,
      maxSteps: request.maxSteps ?? 20,
      timeout: request.maxLatencyMs ?? 120_000,
      devMode: request.devMode ?? false,
    };

    const runner = new MultiAgentRunner({
      maxTotalSteps: context.maxSteps,
      timeoutMs: context.timeout,
      devMode: context.devMode,
    });

    const multiTrace = await runner.run(request.query, context);

    const sources = multiTrace.evidence.flatMap((e) => e.sources);

    const response: AgentMultiResponse = {
      success: multiTrace.success,
      answer: multiTrace.finalAnswer,
      sources: [...new Set(sources)],
      totalDurationMs: multiTrace.totalDurationMs,
      ...(request.devMode && multiTrace.devMode
        ? { devMode: multiTrace.devMode }
        : {}),
    };

    return response;
  }

  // ---------------------------------------------------------------------------
  // POST /agents/plan — Long-horizon planning
  // ---------------------------------------------------------------------------

  async executePlan(
    request: AgentPlanRequest,
    correlation: CorrelationIds = {}
  ): Promise<AgentPlanResponse> {
    const startedAt = Date.now();

    const context: AgentExecutionContext = {
      sessionId: request.sessionId ?? `session-${Date.now()}`,
      userId: correlation.userId,
      indexId: request.indexId,
      maxSteps: request.maxSteps ?? 20,
      timeout: request.maxLatencyMs ?? 120_000,
      devMode: request.devMode ?? false,
    };

    // Step 1: PlannerAgent generates the plan
    const plannerAgent = new PlannerAgent();
    const plannerResult = await plannerAgent.execute(context, request.query);

    let planData: Record<string, unknown> | undefined;
    for (const tc of plannerResult.toolCalls) {
      if (tc.status === 'success' && tc.output && typeof tc.output === 'object') {
        const output = tc.output as Record<string, unknown>;
        if ('planId' in output) {
          planData = output;
          break;
        }
      }
    }

    if (!planData) {
      return {
        success: false,
        sources: [],
        totalDurationMs: Date.now() - startedAt,
        replanCount: 0,
        error: 'PlannerAgent failed to generate a plan',
      };
    }

    // Step 2: Evaluate the plan with PlanCritic
    const critic = new PlanCritic();
    const planEvaluation = critic.evaluate(planData as any, request.query);

    // Step 3: Execute the plan with PlanExecutor
    const executor = new PlanExecutor({
      maxCostUsd: request.maxCostUsd,
      enableEarlyTermination: true,
    });

    // Node executor: use a simple multi-agent runner per node
    const multiRunner = new MultiAgentRunner({
      maxTotalSteps: Math.floor(context.maxSteps / (planData['nodes'] as unknown[])?.length || 4),
      timeoutMs: context.timeout / 4,
      devMode: context.devMode,
    });

    const executionTrace = await executor.execute(
      planData as any,
      context,
      async (node, nodeContext) => {
        try {
          const nodeResult = await multiRunner.run(
            `${node.label}: ${node.description}`,
            nodeContext,
          );
          return {
            success: nodeResult.success,
            result: nodeResult.finalAnswer,
            costUsd: undefined,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    );

    const response: AgentPlanResponse = {
      success: executionTrace.success,
      answer: executionTrace.finalAnswer,
      sources: [],
      planId: String(planData['planId'] ?? ''),
      totalDurationMs: Date.now() - startedAt,
      replanCount: executionTrace.replanCount,
      ...(request.devMode
        ? {
            devMode: {
              plan: planData,
              events: executionTrace.events,
              planEvaluation: planEvaluation as unknown as Record<string, unknown>,
            },
          }
        : {}),
    };

    return response;
  }
}

