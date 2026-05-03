/**
 * Guardrail: Indirect Document Injection Detection
 *
 * Risk: A PDF or document uploaded by the user contains hidden instructions for the LLM.
 * Defense: Sanitize document content at ETL time; detect embedded instruction patterns.
 */

import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';

export const DOCUMENT_INJECTION_PATTERNS = [
  /\[inst\]/i,
  /\[\/inst\]/i,
  /<inst>/i,
  /<\/inst>/i,
  /instruction override:/i,
  /ignore.*previous.*content/i,
  /execute.*this.*command/i,
  /system.*command:/i,
  /hidden.*instruction:/i,
];

export class IndirectInjectionGuardrail implements Guardrail {
  readonly name = 'indirect-injection-detector';
  readonly riskType = 'indirect-injection' as const;

  async check(input: GuardrailInput): Promise<GuardrailResult> {
    const { text } = input;

    const detectedPatterns: string[] = [];

    for (const pattern of DOCUMENT_INJECTION_PATTERNS) {
      if (pattern.test(text)) {
        detectedPatterns.push(pattern.source);
      }
    }

    if (detectedPatterns.length > 0) {
      let sanitized = text;

      // Sanitize by replacing patterns with neutral placeholders (use global flag to replace all occurrences)
      for (const pattern of DOCUMENT_INJECTION_PATTERNS) {
        const globalPattern = new RegExp(pattern.source, pattern.global ? pattern.flags : pattern.flags + 'g');
        sanitized = sanitized.replace(globalPattern, '[REDACTED_INSTRUCTION]');
      }

      return {
        blocked: false, // Never block, but sanitize
        reason: 'Embedded instruction patterns detected in document',
        sanitized,
        detectedPatterns,
        riskLevel: 'high',
      };
    }

    return {
      blocked: false,
      sanitized: text,
      detectedPatterns: [],
    };
  }
}
