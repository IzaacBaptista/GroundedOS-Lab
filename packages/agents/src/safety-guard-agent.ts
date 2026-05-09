/**
 * Safety Guard Agent
 *
 * Specialised agent that evaluates text for safety violations using the full
 * guardrail chain (prompt injection, PII leakage, jailbreak).
 *
 * Flow:
 * 1. Runs SafetyCheckSkill against the input.
 * 2. Returns a structured risk assessment with pass/fail, flags, and sanitized text.
 *
 * Use this agent as a pre- or post-processing step around other agents.
 */

import { BaseAgent } from './agent.js';
import { SafetyCheckSkill } from './skills/index.js';
import type { GuardrailChain } from '@groundedos/safety';

export interface SafetyGuardAgentConfig {
  id?: string;
  name?: string;
  description?: string;
  /** Optional pre-configured guardrail chain. Defaults to injection + PII + jailbreak. */
  chain?: GuardrailChain;
}

export class SafetyGuardAgent extends BaseAgent {
  constructor(config?: SafetyGuardAgentConfig) {
    super(
      config?.id ?? 'safety-guard-agent',
      config?.name ?? 'Safety Guard Agent',
      config?.description ??
        'Evaluates inputs and outputs for prompt injections, PII leakage, and jailbreak attempts.',
      'Assess incoming text for safety violations and return a structured risk report.',
    );

    this.addSkill(new SafetyCheckSkill(config?.chain));
  }

  /**
   * Override reasoning to run the safety check skill.
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
    const skill = this.skills.get('safety-check');
    if (!skill) {
      return {
        reasoning: 'SafetyCheckSkill not registered.',
        toolName: null,
        toolInput: null,
        directAnswer: JSON.stringify({
          passed: false,
          riskLevel: 'high',
          flags: ['safety-skill-missing'],
          sanitized: input,
        }),
      };
    }

    const result = await skill.execute(context, input);
    const out = result.output as {
      passed: boolean;
      blockedBy: string | null;
      reason: string | null;
      sanitized: string;
      flags: string[];
      riskLevel: 'low' | 'medium' | 'high';
    };

    // Push skill reasoning into agent state
    for (const r of result.reasoning) {
      this.state.reasoning.push(r);
    }

    const lastReasoning = result.reasoning.length > 0
      ? result.reasoning[result.reasoning.length - 1]!
      : 'Safety check complete.';

    const answer = JSON.stringify({
      passed: out.passed,
      riskLevel: out.riskLevel,
      blockedBy: out.blockedBy,
      reason: out.reason,
      flags: out.flags,
      sanitized: out.sanitized,
    });

    return {
      reasoning: lastReasoning,
      toolName: null,
      toolInput: null,
      directAnswer: answer,
    };
  }
}
