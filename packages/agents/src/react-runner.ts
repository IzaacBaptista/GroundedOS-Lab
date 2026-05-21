/**
 * ReAct Runner
 *
 * Implements the full ReAct (Reason + Act) loop:
 *   Thought → Action → Tool Execution → Observation → Reflection → Next Step → Final Answer
 *
 * Features:
 * - Multiple iterations with configurable max steps
 * - Global timeout + per-tool timeout
 * - Controlled retry with fallback
 * - Safety guardrail integration
 * - Loop-repetition detection
 * - Low-confidence interruption
 * - Dev Mode sanitized trace
 */

import { randomUUID } from 'crypto';
import type { AgentExecutionContext, Tool } from './types.js';
import type { ToolRegistry } from './tools.js';
import { executeTool, ToolCallingError } from './tools.js';
import type {
  AgentFinalAnswer,
  AgentObservation,
  AgentStep,
  AgentTrace,
  ReActDevModeTrace,
  ReActRunnerConfig,
  ReActTerminationReason,
  ToolCallResult,
} from './react-types.js';

// ---------------------------------------------------------------------------
// Default configuration
// ---------------------------------------------------------------------------

export const DEFAULT_REACT_CONFIG: ReActRunnerConfig = {
  maxSteps: 10,
  timeoutMs: 60_000,
  toolTimeoutMs: 15_000,
  maxRetries: 2,
  minConfidenceThreshold: 0.1,
  enableSafetyChecks: true,
  devMode: false,
};

// ---------------------------------------------------------------------------
// Reasoning result produced by each "think" phase
// ---------------------------------------------------------------------------

export interface ReActReasoningResult {
  /** Summary of the reasoning (sanitized — no raw CoT). */
  reasoning: string;
  /** Confidence in this reasoning step (0–1). */
  confidence: number;
  /** Tool to call, or null if no tool is needed. */
  toolName: string | null;
  /** Input for the tool call, or null. */
  toolInput: Record<string, unknown> | null;
  /** Direct answer if no tool is needed and reasoning is sufficient. */
  directAnswer: string | null;
}

// ---------------------------------------------------------------------------
// ReActRunner
// ---------------------------------------------------------------------------

/**
 * Runs the ReAct loop for a given query, using the provided tool registry
 * and a pluggable `reason` function (replaces the agent's `reasoningStep`).
 *
 * This class is deliberately decoupled from BaseAgent so it can be used
 * standalone or composed inside specialized agents.
 */
export class ReActRunner {
  private readonly config: ReActRunnerConfig;

  constructor(config: Partial<ReActRunnerConfig> = {}) {
    this.config = { ...DEFAULT_REACT_CONFIG, ...config };
  }

  /**
   * Execute the full ReAct loop.
   *
   * @param query - The original user query.
   * @param context - Agent execution context (session, limits, etc.).
   * @param registry - Tool registry with all available tools.
   * @param reasonFn - Async function that implements the "think" phase.
   * @param agentId - ID of the running agent.
   * @param agentName - Name of the running agent.
   */
  async run(
    query: string,
    context: AgentExecutionContext,
    registry: ToolRegistry,
    reasonFn: (
      input: string,
      observations: AgentObservation[],
      stepNumber: number,
    ) => Promise<ReActReasoningResult>,
    agentId: string,
    agentName: string,
  ): Promise<AgentTrace> {
    const traceId = randomUUID();
    const startedAt = Date.now();
    const maxSteps = Math.min(context.maxSteps, this.config.maxSteps);
    const globalTimeout = Math.min(context.timeout, this.config.timeoutMs);

    const steps: AgentStep[] = [];
    const toolCalls: ToolCallResult[] = [];
    const observations: AgentObservation[] = [];
    let terminationReason: ReActTerminationReason = 'error';
    let finalAnswer: AgentFinalAnswer | undefined;

    // Track previous actions to detect repetitive loops
    const previousActions: string[] = [];

    const deadline = startedAt + globalTimeout;

    try {
      let currentInput = query;
      let stepNumber = 0;

      while (stepNumber < maxSteps) {
        // --- Global timeout check ---
        if (Date.now() >= deadline) {
          terminationReason = 'timeout';
          break;
        }

        // --- THOUGHT step ---
        const thoughtStart = Date.now();
        const reasoning = await reasonFn(currentInput, observations, stepNumber);
        const thoughtStep: AgentStep = {
          stepId: randomUUID(),
          stepNumber,
          type: 'thought',
          content: reasoning.reasoning,
          confidence: reasoning.confidence,
          timestamp: thoughtStart,
          durationMs: Date.now() - thoughtStart,
        };
        steps.push(thoughtStep);

        // Low-confidence check
        if (reasoning.confidence < this.config.minConfidenceThreshold) {
          terminationReason = 'low-confidence';
          break;
        }

        // No tool needed → direct answer
        if (!reasoning.toolName || !reasoning.toolInput) {
          if (reasoning.directAnswer !== null && reasoning.directAnswer !== undefined) {
            const finalStep: AgentStep = {
              stepId: randomUUID(),
              stepNumber: stepNumber + 1,
              type: 'final-answer',
              content: reasoning.directAnswer,
              confidence: reasoning.confidence,
              timestamp: Date.now(),
            };
            steps.push(finalStep);

            finalAnswer = {
              answer: reasoning.directAnswer,
              confidence: reasoning.confidence,
              sources: this._extractSources(toolCalls),
              terminationReason: 'completed',
              totalSteps: steps.length,
              totalDurationMs: Date.now() - startedAt,
            };
            terminationReason = 'completed';
          } else {
            terminationReason = 'completed';
          }
          break;
        }

        // --- Repetitive loop detection ---
        const actionKey = `${reasoning.toolName}:${JSON.stringify(reasoning.toolInput)}`;
        if (previousActions.includes(actionKey)) {
          terminationReason = 'repetitive-loop';
          break;
        }
        previousActions.push(actionKey);

        // --- ACTION step ---
        const actionStep: AgentStep = {
          stepId: randomUUID(),
          stepNumber,
          type: 'action',
          content: `Calling tool: ${reasoning.toolName}`,
          timestamp: Date.now(),
        };
        steps.push(actionStep);

        // --- TOOL EXECUTION with retry ---
        const toolResult = await this._executeToolWithRetry(
          reasoning.toolName,
          reasoning.toolInput,
          registry,
          this.config.maxRetries,
          Math.min(this.config.toolTimeoutMs, deadline - Date.now()),
        );
        toolCalls.push(toolResult);

        if (toolResult.status === 'error' || toolResult.status === 'timeout') {
          // Tool failure — record and break
          terminationReason = 'tool-failure';
          break;
        }

        // --- OBSERVATION step ---
        const summary = this._summarizeToolOutput(toolResult);
        const observation: AgentObservation = {
          stepId: actionStep.stepId,
          toolName: reasoning.toolName,
          result: toolResult,
          summary,
          timestamp: Date.now(),
        };
        observations.push(observation);

        const observationStep: AgentStep = {
          stepId: randomUUID(),
          stepNumber,
          type: 'observation',
          content: summary,
          timestamp: Date.now(),
        };
        steps.push(observationStep);

        // Update current input with observation context for next reasoning step
        currentInput = `Original query: ${query}\n\nLatest observation: ${summary}`;
        stepNumber++;
      }

      // If loop ended without a final answer and no specific reason was set
      if (!finalAnswer && terminationReason === 'error') {
        terminationReason = 'max-steps-reached';
      }

      // Build a final answer from observations if not already set
      if (!finalAnswer && observations.length > 0) {
        const lastObservation = observations[observations.length - 1];
        const synthesized = this._synthesizeFromObservations(query, observations);
        finalAnswer = {
          answer: synthesized,
          confidence: 0.7,
          sources: this._extractSources(toolCalls),
          terminationReason,
          totalSteps: steps.length,
          totalDurationMs: Date.now() - startedAt,
        };
        // Mark tool calls as used
        toolCalls.forEach((tc) => {
          tc.usedInFinalAnswer = true;
        });
      }
    } catch (err) {
      terminationReason = 'error';
    }

    const completedAt = Date.now();

    // Build dev mode trace if requested
    const devModeTrace: ReActDevModeTrace | undefined =
      context.devMode || this.config.devMode
        ? {
            steps,
            confidencePerStep: steps
              .filter((s) => s.confidence !== undefined)
              .map((s) => s.confidence!),
            terminationReason,
            toolCallCount: toolCalls.length,
            uniqueToolsUsed: [...new Set(toolCalls.map((tc) => tc.toolName))],
            loopDetected: terminationReason === 'repetitive-loop',
          }
        : undefined;

    return {
      traceId,
      agentId,
      agentName,
      sessionId: context.sessionId,
      query,
      steps,
      toolCalls,
      observations,
      finalAnswer,
      terminationReason,
      startedAt,
      completedAt,
      totalDurationMs: completedAt - startedAt,
      devMode: devModeTrace,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _executeToolWithRetry(
    toolName: string,
    input: Record<string, unknown>,
    registry: ToolRegistry,
    maxRetries: number,
    timeoutMs: number,
  ): Promise<ToolCallResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const startTime = Date.now();
      try {
        const { output, durationMs } = await executeTool(toolName, input, registry, timeoutMs);
        return {
          toolName,
          input,
          outputSummary: this._summarizeOutput(output),
          rawOutput: output,
          status: 'success',
          durationMs,
          attempt,
          usedInFinalAnswer: false,
        };
      } catch (err) {
        const durationMs = Date.now() - startTime;
        lastError = err instanceof Error ? err.message : String(err);
        const isTimeout =
          err instanceof ToolCallingError && lastError.includes('timeout');

        if (isTimeout || attempt > maxRetries) {
          return {
            toolName,
            input,
            outputSummary: `Tool failed: ${lastError}`,
            status: isTimeout ? 'timeout' : 'error',
            error: lastError,
            durationMs,
            attempt,
            usedInFinalAnswer: false,
          };
        }
        // Small backoff before retry
        await new Promise((r) => setTimeout(r, 100 * attempt));
      }
    }

    // Unreachable but satisfies TypeScript
    return {
      toolName,
      input,
      outputSummary: `Tool failed: ${lastError}`,
      status: 'error',
      error: lastError,
      durationMs: 0,
      attempt: maxRetries + 1,
      usedInFinalAnswer: false,
    };
  }

  private _summarizeOutput(output: unknown): string {
    if (output === null || output === undefined) return '(empty result)';
    if (typeof output === 'string') return output.slice(0, 300);
    if (typeof output === 'object') {
      try {
        return JSON.stringify(output).slice(0, 300);
      } catch {
        return '[object]';
      }
    }
    return String(output).slice(0, 300);
  }

  private _summarizeToolOutput(toolResult: ToolCallResult): string {
    if (toolResult.status !== 'success') {
      return `Tool ${toolResult.toolName} failed: ${toolResult.error ?? 'unknown error'}`;
    }
    return `Tool ${toolResult.toolName} returned: ${toolResult.outputSummary}`;
  }

  private _extractSources(toolCalls: ToolCallResult[]): string[] {
    const sources: string[] = [];
    for (const tc of toolCalls) {
      if (tc.status === 'success' && tc.rawOutput && typeof tc.rawOutput === 'object') {
        const output = tc.rawOutput as Record<string, unknown>;
        if (Array.isArray(output['retrievedChunkIds'])) {
          sources.push(...(output['retrievedChunkIds'] as string[]));
        }
        if (Array.isArray(output['sources'])) {
          sources.push(...(output['sources'] as string[]));
        }
      }
    }
    return [...new Set(sources)];
  }

  private _synthesizeFromObservations(
    query: string,
    observations: AgentObservation[],
  ): string {
    const summaries = observations.map((o) => o.summary).join('\n');
    return `Based on research for "${query}":\n${summaries}`;
  }
}
