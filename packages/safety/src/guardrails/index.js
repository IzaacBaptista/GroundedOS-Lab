/**
 * Guardrail Chain
 *
 * Execute multiple guardrails in sequence and aggregate results.
 */
export class GuardrailChain {
    guardrails = new Map();
    register(guardrail) {
        this.guardrails.set(guardrail.name, guardrail);
    }
    deregister(name) {
        this.guardrails.delete(name);
    }
    list() {
        return Array.from(this.guardrails.values());
    }
    /**
     * Execute all registered guardrails against input.
     * Stops on first blocker (unless stopOnBlock=false).
     */
    async check(input, stopOnBlock = true) {
        const allResults = new Map();
        let blockedBy;
        let reason;
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
//# sourceMappingURL=index.js.map