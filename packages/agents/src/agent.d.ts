/**
 * Base Agent Implementation
 *
 * Abstract base class that all agents extend.
 * Provides lifecycle management, reasoning step tracking, and tool invocation.
 */
import type { Agent, AgentExecutionContext, AgentResult, AgentState, Tool } from './types.js';
import { type ToolRegistry } from './tools.js';
export declare abstract class BaseAgent implements Agent {
    id: string;
    name: string;
    description: string;
    goal: string;
    tools: Map<string, Tool>;
    protected state: AgentState;
    protected toolRegistry: ToolRegistry;
    constructor(id: string, name: string, description: string, goal: string);
    private createInitialState;
    registerTool(tool: Tool): void;
    deregisterTool(toolName: string): void;
    getState(): AgentState;
    /**
     * Execute reasoning step: given current input, decide if tool is needed.
     * Subclasses can override for custom reasoning logic.
     */
    protected reasoningStep(input: string, context: AgentExecutionContext): Promise<{
        reasoning: string;
        toolName: string | null;
        toolInput: Record<string, unknown> | null;
        directAnswer: string | null;
    }>;
    /**
     * Main execution loop: reasoning → tool calling → response generation.
     */
    execute(context: AgentExecutionContext, input: string): Promise<AgentResult>;
}
