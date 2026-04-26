/**
 * Agent Types & Interfaces
 *
 * Defines the contract for agent execution, tool calling, and reasoning steps.
 * All agents implement the Agent interface and can call tools via the ToolCalling layer.
 */
export interface AgentMessage {
    role: 'agent' | 'assistant' | 'user';
    content: string;
    timestamp: number;
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
    sessionId: string;
    userId?: string;
    indexId?: string;
    maxSteps: number;
    timeout: number;
    devMode: boolean;
}
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
    /**
     * Execute a goal with given context.
     * Returns structured result with answer, reasoning and sources.
     */
    execute(context: AgentExecutionContext, input: string): Promise<AgentResult>;
    /**
     * Register a tool for this agent to use.
     */
    registerTool(tool: Tool): void;
    /**
     * Deregister a tool.
     */
    deregisterTool(toolName: string): void;
    /**
     * Get current agent state (for introspection and dev mode).
     */
    getState(): AgentState;
}
