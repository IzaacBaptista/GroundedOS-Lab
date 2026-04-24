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

import type { Tool, ToolCall } from './types.js';

export class ToolCallingError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'ToolCallingError';
  }
}

export interface ToolRegistry {
  get(name: string): Tool | undefined;
  register(tool: Tool): void;
  list(): Tool[];
}

export class DefaultToolRegistry implements ToolRegistry {
  private tools = new Map<string, Tool>();

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }
}

/**
 * Execute a single tool call with timeout and error handling.
 * Returns the execution result or throws ToolCallingError on failure.
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  registry: ToolRegistry,
  timeoutMs: number = 30000,
): Promise<{ output: unknown; durationMs: number }> {
  const tool = registry.get(toolName);
  if (!tool) {
    throw new ToolCallingError(`Tool not found: ${toolName}`, toolName);
  }

  const startTime = Date.now();

  try {
    const result = await Promise.race([
      tool.call(input),
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new ToolCallingError(`Tool execution timeout (${timeoutMs}ms)`, toolName),
            ),
          timeoutMs,
        ),
      ),
    ]);

    const durationMs = Date.now() - startTime;
    return { output: result, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    if (error instanceof ToolCallingError) {
      throw error;
    }
    throw new ToolCallingError(
      `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      toolName,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Build prompt describing available tools for LLM tool calling.
 * Used in agent reasoning to help LLM decide which tool to invoke.
 */
export function buildToolDescriptionPrompt(tools: Tool[]): string {
  if (tools.length === 0) {
    return 'No tools available.';
  }

  const descriptions = tools
    .map((tool) => {
      const schema = typeof tool.inputSchema === 'object' ? JSON.stringify(tool.inputSchema) : String(tool.inputSchema);
      return `- **${tool.name}**: ${tool.description}\n  Input schema: ${schema}`;
    })
    .join('\n');

  return `Available tools:\n${descriptions}`;
}
