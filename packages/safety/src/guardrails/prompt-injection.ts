/**
 * Guardrail: Prompt Injection Detection
 *
 * Risk: User input contains patterns that attempt to override system instructions.
 * Defense: Detect injection patterns before passing to LLM.
 */

import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
import { PROMPT_INJECTION_PATTERNS } from '../types.js';

export class PromptInjectionGuardrail implements Guardrail {
  readonly name = 'prompt-injection-detector';
  readonly riskType = 'prompt-injection' as const;

  async check(input: GuardrailInput): Promise<GuardrailResult> {
    const { text } = input;

    const detectedPatterns: string[] = [];

    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        detectedPatterns.push(pattern.source);
      }
    }

    if (detectedPatterns.length > 0) {
      return {
        blocked: true,
        reason: 'Prompt injection patterns detected',
        detectedPatterns,
        riskLevel: 'high',
      };
    }

    return {
      blocked: false,
      detectedPatterns: [],
    };
  }
}
