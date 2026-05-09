/**
 * Research Agent
 *
 * Specialised agent for answering complex questions that require multi-hop
 * retrieval across multiple document sources.
 *
 * Flow:
 * 1. Calls MultiHopRetrievalSkill to gather chunks across up to 3 hops.
 * 2. Calls summarize-with-context tool to produce a synthesised answer.
 * 3. Returns the answer, sources, and the full multi-hop reasoning chain.
 */

import type { Tool } from './types.js';
import { BaseAgent } from './agent.js';
import { MultiHopRetrievalSkill } from './skills/index.js';

export interface ResearchAgentConfig {
  id?: string;
  name?: string;
  description?: string;
  maxHops?: number;
  topK?: number;
}

export class ResearchAgent extends BaseAgent {
  constructor(config?: ResearchAgentConfig) {
    super(
      config?.id ?? 'research-agent',
      config?.name ?? 'Research Agent',
      config?.description ??
        'Answers complex questions by exploring multiple document sources across iterative retrieval hops.',
      'Perform multi-hop research over indexed documents and synthesise a well-supported, comprehensive answer.',
    );

    // Register built-in tools needed by the skills
    const retrieveTool = this.createRetrieveTool();
    const summarizeTool = this.createSummarizeTool();

    this.registerTool(retrieveTool);
    this.registerTool(summarizeTool);

    // Add the multi-hop retrieval skill
    this.addSkill(
      new MultiHopRetrievalSkill(retrieveTool, {
        maxHops: config?.maxHops ?? 3,
        topK: config?.topK ?? 3,
      }),
    );
  }

  private createRetrieveTool(): Tool {
    return {
      name: 'retrieve-from-index',
      description: 'Retrieves top-K relevant chunks from a persisted document index.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          indexId: { type: 'string' },
          topK: { type: 'number' },
        },
        required: ['query', 'indexId', 'topK'],
      },
      call: async (input) => {
        const { query, indexId, topK } = input as {
          query: string;
          indexId: string;
          topK: number;
        };
        return {
          retrievedChunkIds: [
            `chunk-${indexId}-1`,
            `chunk-${indexId}-2`,
            `chunk-${indexId}-3`,
          ],
          scores: [0.92, 0.85, 0.78],
          chunks: [
            `Research result (hop 1) for query: "${query}"`,
            'Second relevant chunk with supporting evidence.',
            'Third chunk adding additional context from related sources.',
          ],
          metadata: { query, indexId, topK, totalMatched: 3 },
        };
      },
    };
  }

  private createSummarizeTool(): Tool {
    return {
      name: 'summarize-with-context',
      description: 'Generates a synthesised answer from retrieved context chunks.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          chunks: { type: 'array', items: { type: 'string' } },
        },
        required: ['query', 'chunks'],
      },
      call: async (input) => {
        const { query, chunks } = input as { query: string; chunks: string[] };
        if (!Array.isArray(chunks) || chunks.length === 0) {
          return {
            summary: `No context found to answer: "${query}"`,
            groundingScore: 0,
          };
        }
        return {
          summary: `Research synthesis based on ${chunks.length} source(s): ${chunks.join(' | ')}`,
          groundingScore: 0.88,
          sourceCount: chunks.length,
        };
      },
    };
  }

  /**
   * Override reasoning to drive multi-hop retrieval via the registered skill.
   */
  protected override async reasoningStep(
    input: string,
    context: any,
  ): Promise<{
    reasoning: string;
    toolName: string | null;
    toolInput: Record<string, unknown> | null;
    directAnswer: string | null;
  }> {
    const step = this.state.currentStep;

    if (step === 0) {
      // Delegate to multi-hop retrieval skill on the first step
      const skill = this.skills.get('multi-hop-retrieval');
      if (!skill) {
        return {
          reasoning: 'MultiHopRetrievalSkill not registered.',
          toolName: null,
          toolInput: null,
          directAnswer: 'Error: research skill not available.',
        };
      }

      const skillResult = await skill.execute(context, input);
      const out = skillResult.output as { chunks?: string[]; chunkIds?: string[] };

      // Push skill reasoning into agent state
      for (const r of skillResult.reasoning) {
        this.state.reasoning.push(r);
      }
      // Record tool calls from skill
      for (const tc of skillResult.toolCallsUsed) {
        this.state.toolCalls.push(tc);
      }

      // Now trigger summarisation with collected chunks
      return {
        reasoning: `Multi-hop retrieval complete (${out.chunks?.length ?? 0} chunks). Proceeding to synthesis.`,
        toolName: 'summarize-with-context',
        toolInput: { query: input, chunks: out.chunks ?? [] },
        directAnswer: null,
      };
    }

    // After summarise tool completes, we're done
    return {
      reasoning: 'Research and synthesis complete.',
      toolName: null,
      toolInput: null,
      directAnswer: null,
    };
  }
}
