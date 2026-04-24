/**
 * Guardrail: Jailbreak Detection
 *
 * Risk: User attempts role-override, capability claiming, or system-identity redefinition.
 * Defense: Detect jailbreak patterns and block before LLM call.
 */

import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
import { JAILBREAK_PATTERNS } from '../types.js';

export class JailbreakGuardrail implements Guardrail {
  readonly name = 'jailbreak-detector';
  readonly riskType = 'jailbreak' as const;

  async check(input: GuardrailInput): Promise<GuardrailResult> {
    const { text } = input;

    const detectedPatterns: string[] = [];

    for (const pattern of JAILBREAK_PATTERNS) {
      if (pattern.test(text)) {
        detectedPatterns.push(pattern.source);
      }
    }

    if (detectedPatterns.length > 0) {
      return {
        blocked: true,
        reason: 'Jailbreak attempt detected: system identity override',
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
