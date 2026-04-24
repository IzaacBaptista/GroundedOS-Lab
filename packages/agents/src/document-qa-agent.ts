/**
 * Document QA Agent
 *
 * Specialized agent for answering questions grounded in document content.
 * Flow:
 * 1. Receives question
 * 2. Calls retrieve-from-index tool to get top-K chunks
 * 3. Calls summarize-with-context tool to generate grounded answer
 * 4. Returns answer + sources + reasoning
 *
 * This is the end-to-end agent flow for Phase 3.
 */

import type { Tool } from './types.js';
import { BaseAgent } from './agent.js';

export interface DocumentQAAgentConfig {
  id?: string;
  name?: string;
  description?: string;
}

/**
 * Built-in tool: retrieve-from-index
 * Simulates calling into the RAG retrieval layer.
 */
function createRetrievalTool(ragServiceGetterFn: () => any): Tool {
  return {
    name: 'retrieve-from-index',
    description:
      'Retrieves top-K relevant chunks from a persisted document index based on query similarity.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        indexId: { type: 'string', description: 'The persisted index identifier' },
        topK: { type: 'number', description: 'Number of top results to retrieve' },
      },
      required: ['query', 'indexId', 'topK'],
    },
    call: async (input: Record<string, unknown>) => {
      const { query, indexId, topK } = input;

      // In real implementation, this would call into the RAG service
      // For now, return a mock retrieval result
      const ragService = ragServiceGetterFn();

      // Simulate retrieval
      return {
        retrievedChunkIds: [`chunk-${indexId}-1`, `chunk-${indexId}-2`, `chunk-${indexId}-3`],
        scores: [0.92, 0.85, 0.78],
        chunks: [
          `This is a simulated retrieval result for query: "${query}"`,
          'This is the second most relevant chunk.',
          'This is the third most relevant chunk.',
        ],
        metadata: {
          query,
          indexId,
          topK,
          totalMatched: 3,
        },
      };
    },
  };
}

/**
 * Built-in tool: summarize-with-context
 * Takes retrieved chunks + original query and generates grounded answer.
 */
function createSummarizationTool(): Tool {
  return {
    name: 'summarize-with-context',
    description:
      'Generates a grounded answer based on retrieved context chunks and the original question.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The original user query' },
        chunks: {
          type: 'array',
          description: 'List of context chunks to base answer on',
          items: { type: 'string' },
        },
      },
      required: ['query', 'chunks'],
    },
    call: async (input: Record<string, unknown>) => {
      const { query, chunks } = input;

      if (!Array.isArray(chunks) || chunks.length === 0) {
        return {
          summary: `I could not find relevant information to answer: "${query}"`,
          groundingScore: 0,
        };
      }

      // Simple mock summarization: combine chunks
      const combined = chunks.join(' ');

      return {
        summary: `Based on the retrieved documents: ${combined}`,
        groundingScore: chunks.length > 0 ? 0.85 : 0,
        sourceCount: chunks.length,
      };
    },
  };
}

/**
 * DocumentQA Agent - answers questions grounded in indexed documents.
 */
export class DocumentQAAgent extends BaseAgent {
  private ragServiceGetterFn: (() => any) | null = null;

  constructor(config?: DocumentQAAgentConfig) {
    super(
      config?.id || 'document-qa-agent',
      config?.name || 'Document QA Agent',
      config?.description || 'Answers questions grounded in indexed documents.',
      'Answer user questions by retrieving relevant document chunks and generating grounded responses with source attribution.',
    );

    // Register built-in tools
    this.registerTool(createRetrievalTool(() => this.ragServiceGetterFn?.()));
    this.registerTool(createSummarizationTool());
  }

  /**
   * Allow injection of RAG service for retrieval.
   */
  setRagService(ragService: any): void {
    this.ragServiceGetterFn = () => ragService;
  }

  /**
   * Override reasoning for document QA: always retrieve first, then summarize.
   */
  protected async reasoningStep(
    input: string,
    context: any,
  ): Promise<{
    reasoning: string;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    directAnswer: string | null;
  }> {
    // Document QA always retrieves first
    if (!context.indexId) {
      return {
        reasoning: 'No index ID provided; cannot retrieve documents.',
        toolName: null,
        toolInput: null,
        directAnswer: 'Error: No document index provided.',
      };
    }

    const step = this.state.currentStep;

    if (step === 0) {
      // First step: retrieve
      return {
        reasoning: `Step 1: Query "${input}" requires retrieving relevant chunks from index ${context.indexId}.`,
        toolName: 'retrieve-from-index',
        toolInput: {
          query: input,
          indexId: context.indexId,
          topK: 3,
        },
        directAnswer: null,
      };
    }

    if (step === 1) {
      // Second step: summarize using output from first tool call
      const lastToolCall = this.state.toolCalls[this.state.toolCalls.length - 1];

      if (lastToolCall?.status === 'success' && lastToolCall.output) {
        const output = lastToolCall.output as any;
        return {
          reasoning: `Step 2: Summarizing retrieved chunks (${output.chunks?.length || 0} chunks) to answer the question.`,
          toolName: 'summarize-with-context',
          toolInput: {
            query: input,
            chunks: output.chunks || [],
          },
          directAnswer: null,
        };
      }
    }

    // No more steps needed
    return {
      reasoning: 'Answer generation complete.',
      toolName: null,
      toolInput: null,
      directAnswer: null,
    };
  }
}
