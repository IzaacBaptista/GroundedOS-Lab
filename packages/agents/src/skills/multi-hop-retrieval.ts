/**
 * Multi-Hop Retrieval Skill
 *
 * Iteratively retrieves document chunks across multiple hops to answer complex
 * research questions that cannot be resolved in a single retrieval step.
 *
 * Required tools:
 *  - retrieve-from-index
 */

import type { AgentExecutionContext, Skill, SkillResult, ToolCall, Tool } from '../types.js';

export interface MultiHopRetrievalConfig {
  /** Maximum number of retrieval hops. Defaults to 3. */
  maxHops?: number;
  /** Number of chunks to retrieve per hop. Defaults to 3. */
  topK?: number;
}

export class MultiHopRetrievalSkill implements Skill {
  readonly id = 'multi-hop-retrieval';
  readonly name = 'Multi-Hop Retrieval';
  readonly description =
    'Performs iterative multi-hop retrieval to answer complex research questions by chaining sub-queries across multiple retrieval rounds.';
  readonly requiredTools = ['retrieve-from-index'];

  private readonly maxHops: number;
  private readonly topK: number;

  constructor(
    private readonly retrieveTool: Tool,
    config: MultiHopRetrievalConfig = {},
  ) {
    this.maxHops = config.maxHops ?? 3;
    this.topK = config.topK ?? 3;
  }

  async execute(context: AgentExecutionContext, input: string): Promise<SkillResult> {
    const reasoning: string[] = [];
    const toolCallsUsed: ToolCall[] = [];

    if (!context.indexId) {
      reasoning.push('No indexId provided; cannot perform multi-hop retrieval.');
      return { output: { chunks: [], chunkIds: [] }, reasoning, toolCallsUsed };
    }

    const allChunks: string[] = [];
    const allChunkIds: string[] = [];
    let currentQuery = input;

    for (let hop = 1; hop <= this.maxHops; hop++) {
      reasoning.push(`Hop ${hop}/${this.maxHops}: querying index with "${currentQuery}"`);
      const hopStartMs = Date.now();

      try {
        const result = (await this.retrieveTool.call({
          query: currentQuery,
          indexId: context.indexId,
          topK: this.topK,
        })) as {
          chunks?: string[];
          retrievedChunkIds?: string[];
        };

        const hopChunks = result.chunks ?? [];
        const hopIds = result.retrievedChunkIds ?? [];

        allChunks.push(...hopChunks);
        allChunkIds.push(...hopIds);

        toolCallsUsed.push({
          id: `${this.id}-hop-${hop}`,
          toolName: 'retrieve-from-index',
          input: { query: currentQuery, indexId: context.indexId, topK: this.topK },
          output: result,
          status: 'success',
          durationMs: Date.now() - hopStartMs,
        });

        reasoning.push(
          `Hop ${hop} retrieved ${hopChunks.length} chunk(s). Total accumulated: ${allChunks.length}.`,
        );

        // Simple stopping heuristic: stop if we got substantial context
        if (allChunks.length >= this.topK * 2) {
          reasoning.push('Sufficient context accumulated; stopping multi-hop retrieval early.');
          break;
        }

        // Derive next sub-query from the first retrieved chunk's key terms
        // (In a real LLM-driven pipeline this would use the MULTI_HOP_RESEARCH prompt)
        if (hop < this.maxHops && hopChunks.length > 0) {
          const terms = hopChunks[0]!
            .split(/\s+/)
            .slice(0, 6)
            .filter((w) => w.length > 4)
            .join(' ');
          currentQuery = terms || currentQuery;
          reasoning.push(`Next sub-query derived: "${currentQuery}"`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        reasoning.push(`Hop ${hop} failed: ${errMsg}`);
        toolCallsUsed.push({
          id: `${this.id}-hop-${hop}`,
          toolName: 'retrieve-from-index',
          input: { query: currentQuery, indexId: context.indexId, topK: this.topK },
          status: 'error',
          error: errMsg,
          durationMs: Date.now() - hopStartMs,
        });
        break;
      }
    }

    return {
      output: { chunks: allChunks, chunkIds: allChunkIds },
      reasoning,
      toolCallsUsed,
    };
  }
}
