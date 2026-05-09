/**
 * Memory Recall Skill
 *
 * Searches the session memory store for prior conversation turns relevant to the
 * current query and surfaces them as context for the agent.
 *
 * Required tools: none (uses SessionMemoryStore directly)
 */

import type { AgentExecutionContext, Skill, SkillResult } from '../types.js';
import type { SessionMemoryStore } from '@groundedos/memory';

export class MemoryRecallSkill implements Skill {
  readonly id = 'memory-recall';
  readonly name = 'Memory Recall';
  readonly description =
    'Searches session memory for prior turns relevant to the current query and injects them as context.';
  readonly requiredTools: string[] = [];

  constructor(private readonly memoryStore: SessionMemoryStore) {}

  async execute(context: AgentExecutionContext, input: string): Promise<SkillResult> {
    const reasoning: string[] = [];

    reasoning.push(`Searching session memory for "${input}" in session "${context.sessionId}".`);

    const results = await this.memoryStore.search(context.sessionId, input, 3);

    if (results.length === 0) {
      reasoning.push('No relevant prior turns found in session memory.');
      return {
        output: { entries: [] },
        reasoning,
        toolCallsUsed: [],
      };
    }

    reasoning.push(
      `Found ${results.length} relevant prior turn(s) with scores: ${results.map((r) => r.score.toFixed(3)).join(', ')}.`,
    );

    const entries = results.map((r) => ({
      query: r.entry.query,
      answer: r.entry.answer,
      score: r.score,
      createdAt: r.entry.createdAt,
    }));

    return {
      output: { entries },
      reasoning,
      toolCallsUsed: [],
    };
  }
}
