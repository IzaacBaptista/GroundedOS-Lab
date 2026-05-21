/**
 * ReAct Loop Types
 *
 * Defines the complete type system for the ReAct (Reason+Act) loop:
 * Thought → Action → Tool Execution → Observation → Reflection → Next Step → Final Answer
 *
 * Design notes:
 * - Chain-of-thought reasoning is NOT exposed raw to end users.
 * - Dev Mode exposes a sanitized/summarized reasoning trace.
 * - All types are serializable for replay and audit.
 */

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

export type ReActStepType =
  | 'thought'
  | 'action'
  | 'observation'
  | 'reflection'
  | 'final-answer';

export interface AgentStep {
  /** Unique identifier for this step. */
  stepId: string;
  /** Monotonic step counter within the run. */
  stepNumber: number;
  /** What kind of reasoning/action this step represents. */
  type: ReActStepType;
  /**
   * Human-readable content for this step.
   * For 'thought'/'reflection' steps this is sanitized reasoning, not raw CoT.
   */
  content: string;
  /** 0–1 confidence score for this step, if available. */
  confidence?: number;
  /** Wall-clock timestamp (ms since epoch). */
  timestamp: number;
  /** Duration of this step in milliseconds. */
  durationMs?: number;
}

// ---------------------------------------------------------------------------
// Tool call results (richer than the existing ToolCall type)
// ---------------------------------------------------------------------------

export type ToolCallStatus = 'success' | 'error' | 'timeout' | 'skipped';

export interface ToolCallResult {
  /** Tool that was called. */
  toolName: string;
  /** Input passed to the tool. */
  input: Record<string, unknown>;
  /** Short summary of the output (safe to surface to end users). */
  outputSummary: string;
  /** Full raw output (dev mode only). */
  rawOutput?: unknown;
  /** Execution outcome. */
  status: ToolCallStatus;
  /** Error message when status === 'error'. */
  error?: string;
  /** Wall-clock duration of the tool call. */
  durationMs: number;
  /** Estimated cost in USD when applicable. */
  estimatedCostUsd?: number;
  /** Retry attempt number (1-based). */
  attempt: number;
  /** Whether this tool's output was incorporated into the final answer. */
  usedInFinalAnswer: boolean;
}

// ---------------------------------------------------------------------------
// Observation (result of a tool call fed back into the reasoning loop)
// ---------------------------------------------------------------------------

export interface AgentObservation {
  /** ID of the AgentStep that produced this observation. */
  stepId: string;
  /** Name of the tool that produced the result. */
  toolName: string;
  /** Structured result from the tool. */
  result: ToolCallResult;
  /** Human-readable summary of the observation for the next reasoning step. */
  summary: string;
  /** Timestamp when observation was recorded. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Termination reasons
// ---------------------------------------------------------------------------

export type ReActTerminationReason =
  | 'completed'
  | 'max-steps-reached'
  | 'timeout'
  | 'safety-blocked'
  | 'low-confidence'
  | 'repetitive-loop'
  | 'tool-failure'
  | 'error';

// ---------------------------------------------------------------------------
// Final answer
// ---------------------------------------------------------------------------

export interface AgentFinalAnswer {
  /** The grounded answer text. */
  answer: string;
  /** 0–1 overall confidence in the answer. */
  confidence: number;
  /** Source chunk IDs or document references used to ground the answer. */
  sources: string[];
  /** Grounding score if available (0–1). */
  groundingScore?: number;
  /** Why the loop terminated. */
  terminationReason: ReActTerminationReason;
  /** Total number of reasoning steps taken. */
  totalSteps: number;
  /** Total wall-clock duration. */
  totalDurationMs: number;
}

// ---------------------------------------------------------------------------
// Full trace (for observability, replay, and audit)
// ---------------------------------------------------------------------------

export interface AgentTrace {
  /** Unique trace identifier. */
  traceId: string;
  /** ID of the agent that ran. */
  agentId: string;
  /** Human-readable agent name. */
  agentName: string;
  /** Session identifier. */
  sessionId: string;
  /** Original query that started the run. */
  query: string;
  /** All reasoning steps in order. */
  steps: AgentStep[];
  /** All tool calls made during this run. */
  toolCalls: ToolCallResult[];
  /** Observations fed back into the loop. */
  observations: AgentObservation[];
  /** Final answer, if the run completed successfully. */
  finalAnswer?: AgentFinalAnswer;
  /** Why the loop terminated. */
  terminationReason: ReActTerminationReason;
  /** Run start timestamp. */
  startedAt: number;
  /** Run end timestamp. */
  completedAt: number;
  /** Total run duration in milliseconds. */
  totalDurationMs: number;
  /** Dev mode trace (sanitized), present only when devMode is enabled. */
  devMode?: ReActDevModeTrace;
}

/** Sanitized trace shown in Dev Mode — no raw chain-of-thought. */
export interface ReActDevModeTrace {
  /** All steps with sanitized content. */
  steps: AgentStep[];
  /** Confidence score per step. */
  confidencePerStep: number[];
  /** Why the loop terminated. */
  terminationReason: ReActTerminationReason;
  /** Number of tool calls made. */
  toolCallCount: number;
  /** Distinct tool names used. */
  uniqueToolsUsed: string[];
  /** True if a repetitive loop was detected. */
  loopDetected: boolean;
}

// ---------------------------------------------------------------------------
// Runner configuration
// ---------------------------------------------------------------------------

export interface ReActRunnerConfig {
  /** Maximum number of reasoning+action steps before halting. */
  maxSteps: number;
  /** Global timeout in milliseconds. */
  timeoutMs: number;
  /** Per-tool timeout in milliseconds. */
  toolTimeoutMs: number;
  /** Maximum retry attempts per tool call. */
  maxRetries: number;
  /** Stop loop if confidence drops below this threshold (0–1). */
  minConfidenceThreshold: number;
  /** Whether to run safety guardrail checks. */
  enableSafetyChecks: boolean;
  /** Whether to include dev mode trace in results. */
  devMode: boolean;
}
