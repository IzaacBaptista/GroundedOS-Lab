/**
 * Tool Calling Layer
 *
 * Defines standardized interface for agents to invoke tools.
 * Tools are functions with typed input/output schemas.
 * The calling layer handles:
 * - Tool registry and lookup
 * - Input validation against schema
 * - Async execution with timeout
 * - Error handling and result serialization
 */
import type { Tool } from './types.js';
export declare class ToolCallingError extends Error {
    toolName: string;
    cause?: Error | undefined;
    constructor(message: string, toolName: string, cause?: Error | undefined);
}
export interface ToolRegistry {
    get(name: string): Tool | undefined;
    register(tool: Tool): void;
    list(): Tool[];
}
export declare class DefaultToolRegistry implements ToolRegistry {
    private tools;
    get(name: string): Tool | undefined;
    register(tool: Tool): void;
    list(): Tool[];
}
/**
 * Execute a single tool call with timeout and error handling.
 * Returns the execution result or throws ToolCallingError on failure.
 */
export declare function executeTool(toolName: string, input: Record<string, unknown>, registry: ToolRegistry, timeoutMs?: number): Promise<{
    output: unknown;
    durationMs: number;
}>;
/**
 * Build prompt describing available tools for LLM tool calling.
 * Used in agent reasoning to help LLM decide which tool to invoke.
 */
export declare function buildToolDescriptionPrompt(tools: Tool[]): string;
