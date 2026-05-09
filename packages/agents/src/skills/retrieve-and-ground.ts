/**
 * Retrieve-and-Ground Skill
 *
 * Retrieves relevant document chunks from an index and then generates a
 * grounded answer using a summarisation step. Encapsulates the two-step
 * retrieve → summarise pipeline that was previously hard-wired inside
 * DocumentQAAgent.reasoningStep.
 *
 * Required tools:
 *  - retrieve-from-index
 *  - summarize-with-context
 */

import type { AgentExecutionContext, Skill, SkillResult, ToolCall, Tool } from '../types.js';

export class RetrieveAndGroundSkill implements Skill {
  readonly id = 'retrieve-and-ground';
  readonly name = 'Retrieve and Ground';
  readonly description =
    'Retrieves top-K relevant document chunks from an index and generates a grounded answer.';
  readonly requiredTools = ['retrieve-from-index', 'summarize-with-context'];

  constructor(
    private readonly retrieveTool: Tool,
    private readonly summarizeTool: Tool,
  ) {}

  async execute(context: AgentExecutionContext, input: string): Promise<SkillResult> {
    const reasoning: string[] = [];
    const toolCallsUsed: ToolCall[] = [];

    if (!context.indexId) {
      reasoning.push('No indexId provided; skipping retrieval.');
      return {
        output: { answer: 'Error: No document index provided.', sources: [] },
        reasoning,
        toolCallsUsed,
      };
    }

    // Step 1: Retrieve chunks
    const retrieveStartMs = Date.now();
    let retrievedChunks: string[] = [];
    let retrievedChunkIds: string[] = [];

    try {
      reasoning.push(
        `Retrieving top-3 chunks from index "${context.indexId}" for query: "${input}"`,
      );

      const retrieval = (await this.retrieveTool.call({
        query: input,
        indexId: context.indexId,
        topK: 3,
      })) as {
        chunks?: string[];
        retrievedChunkIds?: string[];
      };

      retrievedChunks = retrieval.chunks ?? [];
      retrievedChunkIds = retrieval.retrievedChunkIds ?? [];

      toolCallsUsed.push({
        id: `${this.id}-retrieve`,
        toolName: 'retrieve-from-index',
        input: { query: input, indexId: context.indexId, topK: 3 },
        output: retrieval,
        status: 'success',
        durationMs: Date.now() - retrieveStartMs,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      reasoning.push(`Retrieval failed: ${errMsg}`);
      toolCallsUsed.push({
        id: `${this.id}-retrieve`,
        toolName: 'retrieve-from-index',
        input: { query: input, indexId: context.indexId, topK: 3 },
        status: 'error',
        error: errMsg,
        durationMs: Date.now() - retrieveStartMs,
      });
      return { output: { answer: `Retrieval error: ${errMsg}`, sources: [] }, reasoning, toolCallsUsed };
    }

    // Step 2: Summarise with retrieved context
    const summarizeStartMs = Date.now();
    let answer = '';

    try {
      reasoning.push(
        `Summarising ${retrievedChunks.length} retrieved chunk(s) to answer the question.`,
      );

      const summary = (await this.summarizeTool.call({
        query: input,
        chunks: retrievedChunks,
      })) as { summary?: string };

      answer = summary.summary ?? 'No summary generated.';

      toolCallsUsed.push({
        id: `${this.id}-summarize`,
        toolName: 'summarize-with-context',
        input: { query: input, chunks: retrievedChunks },
        output: summary,
        status: 'success',
        durationMs: Date.now() - summarizeStartMs,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      reasoning.push(`Summarisation failed: ${errMsg}`);
      toolCallsUsed.push({
        id: `${this.id}-summarize`,
        toolName: 'summarize-with-context',
        input: { query: input, chunks: retrievedChunks },
        status: 'error',
        error: errMsg,
        durationMs: Date.now() - summarizeStartMs,
      });
    }

    return {
      output: { answer, sources: retrievedChunkIds },
      reasoning,
      toolCallsUsed,
    };
  }
}
