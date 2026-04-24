/**
 * Base Agent Implementation
 *
 * Abstract base class that all agents extend.
 * Provides lifecycle management, reasoning step tracking, and tool invocation.
 */

import type { Agent, AgentExecutionContext, AgentResult, AgentState, Tool, ToolCall } from './types.js';
import {
  DefaultToolRegistry,
  ToolCallingError,
  buildToolDescriptionPrompt,
  executeTool,
  type ToolRegistry,
} from './tools.js';

const DEEP_REASONING_PROMPT_TEMPLATE = `You are an AI agent with specific goal and available tools.

Goal: {goal}

Task: {input}

{availableTools}

Think through this step by step:
1. What is the user asking for?
2. Do I need to call any tools to answer?
3. If yes, which tool and with what input?
4. Once I have the result, how do I answer based on the retrieved context?

Respond in this exact JSON format:
{
  "reasoning": "Your step-by-step reasoning",
  "shouldCallTool": boolean,
  "toolName": "tool_name_if_applicable" or null,
  "toolInput": { extracted input } or null,
  "answer": "Your final answer if no tool needed" or null
}`;

export abstract class BaseAgent implements Agent {
  id: string;
  name: string;
  description: string;
  goal: string;
  tools: Map<string, Tool>;
  protected state: AgentState;
  protected toolRegistry: ToolRegistry;

  constructor(id: string, name: string, description: string, goal: string) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.goal = goal;
    this.tools = new Map();
    this.toolRegistry = new DefaultToolRegistry();
    this.state = this.createInitialState();
  }

  private createInitialState(): AgentState {
    return {
      sessionId: '',
      agentId: this.id,
      agentName: this.name,
      goal: this.goal,
      state: 'idle',
      messages: [],
      currentStep: 0,
      maxSteps: 5,
      reasoning: [],
      toolCalls: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
    this.toolRegistry.register(tool);
  }

  deregisterTool(toolName: string): void {
    this.tools.delete(toolName);
  }

  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Execute reasoning step: given current input, decide if tool is needed.
   * Subclasses can override for custom reasoning logic.
   */
  protected async reasoningStep(input: string, context: AgentExecutionContext): Promise<{
    reasoning: string;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    directAnswer: string | null;
  }> {
    // Simple heuristic: if input contains question mark or starts with common question words,
    // invoke the default retrieval tool if available.

    const isQuestion = input.includes('?') || /^(what|where|when|why|who|how)/i.test(input);
    const hasRetrievalTool = this.toolRegistry.get('retrieve-from-index');

    if (isQuestion && hasRetrievalTool) {
      return {
        reasoning: `Query "${input}" appears to be a question. Calling retrieve-from-index tool.`,
        toolName: 'retrieve-from-index',
        toolInput: { query: input, indexId: context.indexId, topK: 3 },
        directAnswer: null,
      };
    }

    return {
      reasoning: `Query "${input}" does not require tool invocation.`,
      toolName: null,
      toolInput: null,
      directAnswer: `Acknowledged: ${input}`,
    };
  }

  /**
   * Main execution loop: reasoning → tool calling → response generation.
   */
  async execute(context: AgentExecutionContext, input: string): Promise<AgentResult> {
    const startTime = Date.now();
    this.state = this.createInitialState();
    this.state.sessionId = context.sessionId;
    this.state.maxSteps = context.maxSteps;
    this.state.state = 'thinking';

    try {
      const results: {
        toolCalls: ToolCall[];
        sources: string[];
        finalAnswer: string;
        reasoning: string[];
      } = {
        toolCalls: [],
        sources: [],
        finalAnswer: '',
        reasoning: [],
      };

      // Execute reasoning + tool loop
      for (let step = 0; step < context.maxSteps; step++) {
        this.state.currentStep = step;
        this.state.updatedAt = Date.now();

        // 1. Reasoning step
        const reasoningResult = await this.reasoningStep(input, context);
        this.state.reasoning.push(reasoningResult.reasoning);
        results.reasoning.push(reasoningResult.reasoning);

        if (!reasoningResult.toolName) {
          // No tool needed, wrap up
          results.finalAnswer = reasoningResult.directAnswer || 'No response generated.';
          break;
        }

        // 2. Tool calling step
        this.state.state = 'calling-tool';
        const toolCall: ToolCall = {
          id: `${this.id}-tool-${step}`,
          toolName: reasoningResult.toolName,
          input: reasoningResult.toolInput || {},
          status: 'pending',
          durationMs: 0,
        };

        try {
          const { output, durationMs } = await executeTool(
            reasoningResult.toolName,
            reasoningResult.toolInput || {},
            this.toolRegistry,
            context.timeout / 2, // Half the context timeout per tool
          );

          toolCall.output = output;
          toolCall.status = 'success';
          toolCall.durationMs = durationMs;

          // Extract sources if tool returned retrieval results
          if (
            typeof output === 'object' &&
            output !== null &&
            'retrievedChunkIds' in output &&
            Array.isArray(output.retrievedChunkIds)
          ) {
            results.sources.push(...output.retrievedChunkIds);
          }
          if (
            typeof output === 'object' &&
            output !== null &&
            'summary' in output &&
            typeof output.summary === 'string'
          ) {
            results.finalAnswer = output.summary;
          }
        } catch (error) {
          toolCall.status = 'error';
          toolCall.error = error instanceof Error ? error.message : String(error);
          toolCall.durationMs = Date.now() - startTime;
        }

        this.state.toolCalls.push(toolCall);
        results.toolCalls.push(toolCall);

        // If tool failed, stop
        if (toolCall.status === 'error') {
          break;
        }
      }

      this.state.state = 'done';

      return {
        success: true,
        answer: results.finalAnswer,
        reasoning: results.reasoning,
        sources: results.sources,
        toolCalls: results.toolCalls,
        state: this.state,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      this.state.state = 'error';
      this.state.error = error instanceof Error ? error.message : String(error);

      return {
        success: false,
        answer: undefined,
        reasoning: this.state.reasoning,
        sources: [],
        toolCalls: this.state.toolCalls,
        state: this.state,
        durationMs: Date.now() - startTime,
        error: this.state.error,
      };
    }
  }
}
