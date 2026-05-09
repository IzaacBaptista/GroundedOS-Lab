/**
 * Routing Skill
 *
 * Analyses the incoming query and current retrieval signals (when available) to
 * select the most appropriate model using the @groundedos/model-routing package.
 * The routing decision is attached to the SkillResult output for downstream use.
 *
 * Required tools: none (calls routeModel directly)
 */

import type { AgentExecutionContext, Skill, SkillResult } from '../types.js';
import { routeModel, type RetrievalRoutingSignals } from '@groundedos/model-routing';

export class RoutingSkill implements Skill {
  readonly id = 'routing';
  readonly name = 'Model Routing';
  readonly description =
    'Analyses the query intent and retrieval signals to select the optimal model for response generation.';
  readonly requiredTools: string[] = [];

  async execute(context: AgentExecutionContext, input: string): Promise<SkillResult> {
    const reasoning: string[] = [];

    reasoning.push(`Analysing query intent for: "${input}"`);

    const routingContext: {
      forcedModel?: string;
      postRetrieval?: RetrievalRoutingSignals;
    } = {};

    // If retrieval signals are available from context metadata, pass them
    const retrievalSignals = context.metadata?.retrievalSignals as
      | RetrievalRoutingSignals
      | undefined;
    if (retrievalSignals) {
      routingContext.postRetrieval = retrievalSignals;
      reasoning.push('Using post-retrieval signals to refine model selection.');
    }

    const decision = routeModel(input, routingContext);

    reasoning.push(
      `Selected model: "${decision.selectedModel}" (${decision.selectedProvider}) — ${decision.reason}`,
    );
    reasoning.push(
      `Routing confidence: ${(decision.confidence * 100).toFixed(0)}% | strategy: ${decision.strategy}`,
    );

    return {
      output: { routingDecision: decision },
      reasoning,
      toolCallsUsed: [],
    };
  }
}
