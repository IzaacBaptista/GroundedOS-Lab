/**
 * Guardrail: PII Leakage Detection & Sanitization
 *
 * Risk: Document or answer contains PII (emails, phone, CPF, SSN, credit card).
 * Defense: Detect and sanitize PII tokens.
 */

import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
import { PII_PATTERNS } from '../types.js';

export class PIILeakageGuardrail implements Guardrail {
  readonly name = 'pii-leakage-sanitizer';
  readonly riskType = 'pii-leakage' as const;

  async check(input: GuardrailInput): Promise<GuardrailResult> {
    const { text } = input;

    const detectedPatterns: string[] = [];
    let sanitized = text;

    // Check each PII pattern
    for (const [piiType, pattern] of Object.entries(PII_PATTERNS)) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        detectedPatterns.push(piiType);

        // Sanitize by replacing with placeholder
        sanitized = sanitized.replace(pattern, `[REDACTED_${piiType.toUpperCase()}]`);
      }
    }

    if (detectedPatterns.length > 0) {
      return {
        blocked: false, // Never block, always sanitize
        reason: `PII detected: ${detectedPatterns.join(', ')}`,
        sanitized,
        detectedPatterns,
        riskLevel: detectedPatterns.length > 2 ? 'high' : 'medium',
      };
    }

    return {
      blocked: false,
      sanitized: text,
      detectedPatterns: [],
    };
  }
}
