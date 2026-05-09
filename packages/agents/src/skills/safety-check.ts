/**
 * Safety Check Skill
 *
 * Runs the configured guardrail chain against a piece of text (user input or
 * agent output) and returns a structured safety assessment.
 *
 * Required tools: none (uses GuardrailChain directly)
 */

import type { AgentExecutionContext, Skill, SkillResult } from '../types.js';
import {
  GuardrailChain,
  PromptInjectionGuardrail,
  PIILeakageGuardrail,
  JailbreakGuardrail,
} from '@groundedos/safety';
import type { GuardrailInput } from '@groundedos/safety';

export class SafetyCheckSkill implements Skill {
  readonly id = 'safety-check';
  readonly name = 'Safety Check';
  readonly description =
    'Evaluates text against guardrail rules (prompt injection, PII, jailbreak) and returns a risk assessment.';
  readonly requiredTools: string[] = [];

  private readonly chain: GuardrailChain;

  constructor(chain?: GuardrailChain) {
    if (chain) {
      this.chain = chain;
    } else {
      // Default chain: prompt injection + PII + jailbreak
      this.chain = new GuardrailChain();
      this.chain.register(new PromptInjectionGuardrail());
      this.chain.register(new PIILeakageGuardrail());
      this.chain.register(new JailbreakGuardrail());
    }
  }

  async execute(context: AgentExecutionContext, input: string): Promise<SkillResult> {
    const reasoning: string[] = [];

    const role: GuardrailInput['role'] = 'user';

    reasoning.push(`Running safety checks on input (${input.length} chars, role="${role}").`);

    const result = await this.chain.check({ text: input, role }, true);

    if (result.passed) {
      reasoning.push('All guardrails passed. Input is safe.');
    } else {
      reasoning.push(
        `Input blocked by guardrail "${result.blockedBy}": ${result.reason ?? 'no reason given'}.`,
      );
    }

    if (result.sanitized !== input) {
      reasoning.push('Input was sanitized (PII or injections redacted).');
    }

    const flags: string[] = [];
    for (const [name, guardrailResult] of result.allResults.entries()) {
      if (guardrailResult.detectedPatterns && guardrailResult.detectedPatterns.length > 0) {
        flags.push(`${name}: ${guardrailResult.detectedPatterns.join(', ')}`);
      }
    }

    return {
      output: {
        passed: result.passed,
        blockedBy: result.blockedBy ?? null,
        reason: result.reason ?? null,
        sanitized: result.sanitized,
        flags,
        riskLevel: result.passed ? 'low' : 'high',
      },
      reasoning,
      toolCallsUsed: [],
    };
  }
}
