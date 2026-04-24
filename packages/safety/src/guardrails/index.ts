/**
 * Guardrail Chain
 *
 * Execute multiple guardrails in sequence and aggregate results.
 */

import type { Guardrail, GuardrailInput, GuardrailChainResult } from '../types.js';

export class GuardrailChain {
  private guardrails: Map<string, Guardrail> = new Map();

  register(guardrail: Guardrail): void {
    this.guardrails.set(guardrail.name, guardrail);
  }

  deregister(name: string): void {
    this.guardrails.delete(name);
  }

  list(): Guardrail[] {
    return Array.from(this.guardrails.values());
  }

  /**
   * Execute all registered guardrails against input.
   * Stops on first blocker (unless stopOnBlock=false).
   */
  async check(input: GuardrailInput, stopOnBlock = true): Promise<GuardrailChainResult> {
    const allResults = new Map<string, any>();
    let blockedBy: string | undefined;
    let reason: string | undefined;
    let sanitized = input.text;

    for (const guardrail of this.guardrails.values()) {
      const result = await guardrail.check({
        ...input,
        text: sanitized, // Use sanitized output from previous guardrail
      });

      allResults.set(guardrail.name, result);

      // Apply sanitization
      if (result.sanitized && result.sanitized !== sanitized) {
        sanitized = result.sanitized;
      }

      // Check if blocked
      if (result.blocked) {
        blockedBy = guardrail.name;
        reason = result.reason;

        if (stopOnBlock) {
          break;
        }
      }
    }

    return {
      passed: !blockedBy,
      blockedBy,
      reason,
      sanitized,
      allResults,
    };
  }
}

export * from '../guardrails/prompt-injection.js';
export * from '../guardrails/pii-leakage.js';
export * from '../guardrails/jailbreak.js';
export * from '../guardrails/hallucination.js';
export * from '../guardrails/prompt-leakage.js';
export * from '../guardrails/indirect-injection.js';
