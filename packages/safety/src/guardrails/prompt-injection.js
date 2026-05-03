/**
 * Guardrail: Prompt Injection Detection
 *
 * Risk: User input contains patterns that attempt to override system instructions.
 * Defense: Detect injection patterns before passing to LLM.
 */
import { PROMPT_INJECTION_PATTERNS } from '../types.js';
export class PromptInjectionGuardrail {
    name = 'prompt-injection-detector';
    riskType = 'prompt-injection';
    async check(input) {
        const { text } = input;
        const detectedPatterns = [];
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
//# sourceMappingURL=prompt-injection.js.map