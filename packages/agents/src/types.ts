/**
 * Agent Types & Interfaces
 *
 * Defines the contract for agent execution, tool calling, and reasoning steps.
 * All agents implement the Agent interface and can call tools via the ToolCalling layer.
 */

import type { InstructionSet } from './instructions.js';
import type { ModelRoutingDecision } from '@groundedos/model-routing';

// ---------------------------------------------------------------------------
// Conversation history
// ---------------------------------------------------------------------------

/**
 * A single turn in a conversation between a user and the agent.
 * Used to provide conversational context across multi-turn interactions.
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AgentMessage {
  role: 'agent' | 'assistant' | 'user';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Memory entry (mirrors @groundedos/memory to avoid circular deps)
// ---------------------------------------------------------------------------

/** Lightweight snapshot of a prior session turn used for memory injection. */
export interface AgentMemoryEntry {
  id: string;
  sessionId: string;
  query: string;
  answer: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface AgentState {
  sessionId: string;
  agentId: string;
  agentName: string;
  goal: string;
  state: 'idle' | 'thinking' | 'calling-tool' | 'done' | 'error';
  messages: AgentMessage[];
  currentStep: number;
  maxSteps: number;
  reasoning: string[];
  toolCalls: ToolCall[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ToolCall {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  status: 'pending' | 'success' | 'error';
  error?: string;
  durationMs: number;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (input: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentExecutionContext {
  // --- existing fields (required) ---
  sessionId: string;
  maxSteps: number;
  timeout: number;
  devMode: boolean;

  // --- existing optional fields ---
  userId?: string;
  indexId?: string;

  // --- new: rich context fields ---

  /**
   * Previous session turns fetched from the memory store before execution.
   * Agents can use these to maintain conversational continuity.
   */
  memoryEntries?: AgentMemoryEntry[];

  /**
   * Pre-retrieved RAG chunks passed into the context.
   * Skills or services that already ran retrieval can populate this so the
   * agent skips a redundant retrieve step.
   */
  retrievedChunks?: string[];

  /**
   * Full conversation history for the current session.
   * Enables multi-turn dialogue awareness inside the agent.
   */
  conversationHistory?: ConversationMessage[];

  /**
   * Model routing decision produced before agent execution.
   * Agents can inspect this to know which model was selected and why.
   */
  routingDecision?: ModelRoutingDecision;

  /**
   * Guardrail flags raised during pre-execution safety checks.
   * Populated by SafetyCheckSkill or the API service layer.
   */
  guardrailFlags?: string[];

  /**
   * Language the agent should use when generating responses.
   * Defaults to 'en-US'.
   */
  language?: string;

  /**
   * Instruction set to apply to this execution.
   * When set, BaseAgent uses it to build the system prompt.
   */
  instructions?: InstructionSet;

  /** Arbitrary metadata passed through to tools and skills. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Skill types (higher-level than Tool; encapsulates multi-step logic)
// ---------------------------------------------------------------------------

/**
 * Result produced by a Skill execution.
 */
export interface SkillResult {
  /** Primary output of the skill (free-form). */
  output: unknown;

  /** Reasoning steps recorded during skill execution. */
  reasoning: string[];

  /** Tool calls made during skill execution. */
  toolCallsUsed: ToolCall[];
}

/**
 * A Skill is a reusable, composable capability that sits above Tools.
 * Unlike a Tool (a single typed function), a Skill may orchestrate multiple
 * tools and maintain intermediate state over several steps.
 */
export interface Skill {
  /** Unique identifier. */
  id: string;

  /** Human-readable name. */
  name: string;

  /** What this skill does. */
  description: string;

  /**
   * Names of tools this skill expects to be available in the agent's registry.
   * Used for validation at registration time.
   */
  requiredTools: string[];

  /**
   * Execute the skill with the given execution context and user input.
   */
  execute(context: AgentExecutionContext, input: string): Promise<SkillResult>;
}

// ---------------------------------------------------------------------------
// Existing types (unchanged)
// ---------------------------------------------------------------------------

export interface AgentResult {
  success: boolean;
  answer?: string;
  reasoning: string[];
  sources: string[];
  toolCalls: ToolCall[];
  state: AgentState;
  durationMs: number;
  error?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  goal: string;
  tools: Map<string, Tool>;
  skills: Map<string, Skill>;

  /**
   * Execute a goal with given context.
   * Returns structured result with answer, reasoning and sources.
   */
  execute(
    context: AgentExecutionContext,
    input: string,
  ): Promise<AgentResult>;

  /**
   * Register a tool for this agent to use.
   */
  registerTool(tool: Tool): void;

  /**
   * Deregister a tool.
   */
  deregisterTool(toolName: string): void;

  /**
   * Add a skill to this agent.
   */
  addSkill(skill: Skill): void;

  /**
   * Remove a skill from this agent.
   */
  removeSkill(skillId: string): void;

  /**
   * Get current agent state (for introspection and dev mode).
   */
  getState(): AgentState;
}
