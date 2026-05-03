/**
 * Guardrail: PII Leakage Detection & Sanitization
 *
 * Risk: Document or answer contains PII (emails, phone, CPF, SSN, credit card).
 * Defense: Detect and sanitize PII tokens.
 */
import { PII_PATTERNS } from '../types.js';
export class PIILeakageGuardrail {
    name = 'pii-leakage-sanitizer';
    riskType = 'pii-leakage';
    async check(input) {
        const { text } = input;
        const detectedPatterns = [];
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
//# sourceMappingURL=pii-leakage.js.map