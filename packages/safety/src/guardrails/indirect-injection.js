/**
 * Guardrail: Indirect Document Injection Detection
 *
 * Risk: A PDF or document uploaded by the user contains hidden instructions for the LLM.
 * Defense: Sanitize document content at ETL time; detect embedded instruction patterns.
 */
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
export class IndirectInjectionGuardrail {
    name = 'indirect-injection-detector';
    riskType = 'indirect-injection';
    async check(input) {
        const { text, metadata } = input;
        // This guardrail is primarily for document content
        const isDocumentContent = metadata?.source === 'document' || metadata?.type === 'chunk';
        const detectedPatterns = [];
        for (const pattern of DOCUMENT_INJECTION_PATTERNS) {
            if (pattern.test(text)) {
                detectedPatterns.push(pattern.source);
            }
        }
        if (detectedPatterns.length > 0) {
            let sanitized = text;
            // Sanitize by replacing patterns with neutral placeholders
            for (const pattern of DOCUMENT_INJECTION_PATTERNS) {
                sanitized = sanitized.replace(pattern, '[REDACTED_INSTRUCTION]');
            }
            return {
                blocked: isDocumentContent ? false : false, // Never block, but sanitize
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
//# sourceMappingURL=indirect-injection.js.map