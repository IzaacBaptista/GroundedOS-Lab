/**
 * Guardrail: Prompt Leakage Detection
 *
 * Risk: User asks for the system prompt or hidden instructions.
 * Defense: Detect and block system-prompt extraction attempts.
 */
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
export class PromptLeakageGuardrail {
    name = 'prompt-leakage-detector';
    riskType = 'prompt-leakage';
    async check(input) {
        const { text } = input;
        const detectedPatterns = [];
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
//# sourceMappingURL=prompt-leakage.js.map