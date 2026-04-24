/**
 * Guardrail: Prompt Leakage Detection
 *
 * Risk: User asks for the system prompt or hidden instructions.
 * Defense: Detect and block system-prompt extraction attempts.
 */

import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';

export const PROMPT_EXTRACTION_PATTERNS = [
  /what.*system.*prompt/i,
  /what.*are.*your.*instructions/i,
  /show.*me.*prompt/i,
  /reveal.*system.*message/i,
  /what.*are.*your.*rules/i,
  /how.*are.*you.*programmed/i,
  /what.*are.*your.*constraints/i,
  /system.*prompt.*now/i,
];

export class PromptLeakageGuardrail implements Guardrail {
  readonly name = 'prompt-leakage-detector';
  readonly riskType = 'prompt-leakage' as const;

  async check(input: GuardrailInput): Promise<GuardrailResult> {
    const { text } = input;

    const detectedPatterns: string[] = [];

    for (const pattern of PROMPT_EXTRACTION_PATTERNS) {
      if (pattern.test(text)) {
        detectedPatterns.push(pattern.source);
      }
    }

    if (detectedPatterns.length > 0) {
      return {
        blocked: true,
        reason: 'System prompt extraction attempt detected',
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
