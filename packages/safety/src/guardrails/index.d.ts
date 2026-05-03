/**
 * Guardrail Chain
 *
 * Execute multiple guardrails in sequence and aggregate results.
 */
import type { Guardrail, GuardrailInput, GuardrailChainResult } from '../types.js';
export declare class GuardrailChain {
    private guardrails;
    register(guardrail: Guardrail): void;
    deregister(name: string): void;
    list(): Guardrail[];
    /**
     * Execute all registered guardrails against input.
     * Stops on first blocker (unless stopOnBlock=false).
     */
    check(input: GuardrailInput, stopOnBlock?: boolean): Promise<GuardrailChainResult>;
}
export * from '../guardrails/prompt-injection.js';
export * from '../guardrails/pii-leakage.js';
export * from '../guardrails/jailbreak.js';
export * from '../guardrails/hallucination.js';
export * from '../guardrails/prompt-leakage.js';
export * from '../guardrails/indirect-injection.js';
