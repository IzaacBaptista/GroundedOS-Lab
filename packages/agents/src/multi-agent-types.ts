/**
 * Multi-Agent Types
 *
 * Defines the complete type system for multi-agent coordination:
 * - Agent roles and capabilities
 * - Handoff protocol between agents
 * - Multi-agent trace for observability
 *
 * Handoff flow:
 * PlannerAgent → ResearcherAgent → CriticAgent → SynthesizerAgent
 *
 * Design notes:
 * - All handoffs are serializable for audit and replay.
 * - Each handoff contains full context so receiving agent is self-contained.
 */

// ---------------------------------------------------------------------------
// Agent roles and capabilities
// ---------------------------------------------------------------------------

export type AgentRole =
  | 'planner'
  | 'researcher'
  | 'critic'
  | 'synthesizer'
  | 'document-qa'
  | 'custom';

export interface AgentCapability {
  /** Machine-readable capability identifier. */
  id: string;
  /** Human-readable description. */
  description: string;
  /** Required tool names for this capability. */
  requiredTools: string[];
}

// ---------------------------------------------------------------------------
// Handoff protocol
// ---------------------------------------------------------------------------

export type HandoffStatus =
  | 'pending'
  | 'accepted'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'rejected';

export interface AgentHandoff {
  /** Unique handoff identifier. */
  handoffId: string;
  /** ID of the agent initiating the handoff. */
  fromAgentId: string;
  /** ID of the agent receiving the handoff. */
  toAgentId: string;
  /** Name of the sending agent. */
  fromAgentName: string;
  /** Name of the receiving agent. */
  toAgentName: string;
  /** Task the receiving agent must complete. */
  task: string;
  /** Full context so the receiving agent can work autonomously. */
  context: HandoffContext;
  /** Why this handoff was initiated. */
  reasonForHandoff: string;
  /** What kind of output is expected from the receiving agent. */
  expectedOutput: string;
  /** Current status of this handoff. */
  status: HandoffStatus;
  /** Timestamp when handoff was created. */
  createdAt: number;
  /** Timestamp when handoff was completed (if applicable). */
  completedAt?: number;
}

export interface HandoffContext {
  /** Original user query that started the multi-agent run. */
  originalQuery: string;
  /** Session identifier. */
  sessionId: string;
  /** Evidence collected so far by previous agents. */
  evidence: Evidence[];
  /** Constraints the receiving agent must respect. */
  constraints: string[];
  /** Execution limits inherited from the parent run. */
  executionLimits: ExecutionLimits;
  /** Additional agent-specific metadata. */
  metadata?: Record<string, unknown>;
}

export interface Evidence {
  /** Unique evidence identifier. */
  evidenceId: string;
  /** Which agent produced this evidence. */
  sourceAgentId: string;
  /** Human-readable content. */
  content: string;
  /** Source references (chunk IDs, URLs, etc.). */
  sources: string[];
  /** Confidence in this evidence (0–1). */
  confidence: number;
  /** When this evidence was collected. */
  collectedAt: number;
  /** Tags for categorization. */
  tags?: string[];
}

export interface ExecutionLimits {
  maxSteps: number;
  timeoutMs: number;
  maxCostUsd?: number;
}

/**
 * Envelope wrapping a handoff — used for transport, logging, and replay.
 */
export interface HandoffEnvelope {
  /** Unique envelope identifier. */
  envelopeId: string;
  /** The handoff payload. */
  handoff: AgentHandoff;
  /** Result from the receiving agent (set after completion). */
  result?: HandoffResult;
  /** Serialization timestamp. */
  serializedAt: number;
  /** Version of the handoff protocol. */
  protocolVersion: string;
}

export interface HandoffResult {
  success: boolean;
  answer?: string;
  evidence: Evidence[];
  reasoning: string[];
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Multi-agent messages
// ---------------------------------------------------------------------------

export type AgentMessageType =
  | 'task-assignment'
  | 'task-result'
  | 'evidence-share'
  | 'critique'
  | 'plan'
  | 'synthesis'
  | 'error';

export interface MultiAgentMessage {
  /** Unique message identifier. */
  messageId: string;
  /** Sending agent ID. */
  fromAgentId: string;
  /** Receiving agent ID. */
  toAgentId: string;
  /** Type of message. */
  type: AgentMessageType;
  /** Message payload. */
  payload: unknown;
  /** Timestamp. */
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Multi-agent trace for observability
// ---------------------------------------------------------------------------

export interface MultiAgentTrace {
  /** Unique trace identifier. */
  traceId: string;
  /** Session identifier. */
  sessionId: string;
  /** Original query. */
  query: string;
  /** All agents involved in this run. */
  agents: AgentParticipant[];
  /** All handoffs that occurred. */
  handoffs: AgentHandoff[];
  /** All messages exchanged. */
  messages: MultiAgentMessage[];
  /** Decisions recorded during the run. */
  decisions: AgentDecision[];
  /** Evidence collected across all agents. */
  evidence: Evidence[];
  /** Gaps identified by the CriticAgent. */
  criticalGaps: string[];
  /** Final synthesized answer. */
  finalAnswer?: string;
  /** Whether the run succeeded. */
  success: boolean;
  /** Run start timestamp. */
  startedAt: number;
  /** Run end timestamp. */
  completedAt: number;
  /** Total duration. */
  totalDurationMs: number;
  /** Dev mode trace (sanitized). */
  devMode?: MultiAgentDevModeTrace;
}

export interface AgentParticipant {
  agentId: string;
  agentName: string;
  role: AgentRole;
  activatedAt: number;
  completedAt?: number;
  stepsExecuted: number;
}

export interface AgentDecision {
  decisionId: string;
  agentId: string;
  description: string;
  rationale: string;
  timestamp: number;
  outcome?: string;
}

export interface MultiAgentDevModeTrace {
  agents: AgentParticipant[];
  handoffs: Array<{
    from: string;
    to: string;
    reason: string;
    evidenceCount: number;
    status: HandoffStatus;
  }>;
  decisions: AgentDecision[];
  criticalGaps: string[];
  evidenceSummary: string[];
}

// ---------------------------------------------------------------------------
// Multi-agent runner configuration
// ---------------------------------------------------------------------------

export interface MultiAgentRunnerConfig {
  /** Maximum total steps across all agents. */
  maxTotalSteps: number;
  /** Global timeout in milliseconds. */
  timeoutMs: number;
  /** Per-agent timeout in milliseconds. */
  agentTimeoutMs: number;
  /** Whether to run safety checks before handoffs. */
  enableSafetyChecks: boolean;
  /** Whether to include dev mode traces. */
  devMode: boolean;
}

export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentRunnerConfig = {
  maxTotalSteps: 40,
  timeoutMs: 120_000,
  agentTimeoutMs: 30_000,
  enableSafetyChecks: true,
  devMode: false,
};
