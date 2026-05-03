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
export class ToolCallingError extends Error {
    toolName;
    cause;
    constructor(message, toolName, cause) {
        super(message);
        this.toolName = toolName;
        this.cause = cause;
        this.name = 'ToolCallingError';
    }
}
export class DefaultToolRegistry {
    tools = new Map();
    get(name) {
        return this.tools.get(name);
    }
    register(tool) {
        this.tools.set(tool.name, tool);
    }
    list() {
        return Array.from(this.tools.values());
    }
}
/**
 * Execute a single tool call with timeout and error handling.
 * Returns the execution result or throws ToolCallingError on failure.
 */
export async function executeTool(toolName, input, registry, timeoutMs = 30000) {
    const tool = registry.get(toolName);
    if (!tool) {
        throw new ToolCallingError(`Tool not found: ${toolName}`, toolName);
    }
    const startTime = Date.now();
    try {
        const result = await Promise.race([
            tool.call(input),
            new Promise((_, reject) => setTimeout(() => reject(new ToolCallingError(`Tool execution timeout (${timeoutMs}ms)`, toolName)), timeoutMs)),
        ]);
        const durationMs = Date.now() - startTime;
        return { output: result, durationMs };
    }
    catch (error) {
        const durationMs = Date.now() - startTime;
        if (error instanceof ToolCallingError) {
            throw error;
        }
        throw new ToolCallingError(`Tool execution failed: ${error instanceof Error ? error.message : String(error)}`, toolName, error instanceof Error ? error : undefined);
    }
}
/**
 * Build prompt describing available tools for LLM tool calling.
 * Used in agent reasoning to help LLM decide which tool to invoke.
 */
export function buildToolDescriptionPrompt(tools) {
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
//# sourceMappingURL=tools.js.map