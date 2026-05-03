/**
 * Guardrail Types
 *
 * Defines the Guardrail interface and related types.
 * All safety checks implement this contract.
 */
export interface GuardrailInput {
    text: string;
    role: 'user' | 'assistant';
    metadata?: Record<string, unknown>;
}
export interface GuardrailResult {
    blocked: boolean;
    reason?: string;
    sanitized?: string;
    riskLevel?: 'low' | 'medium' | 'high';
    detectedPatterns?: string[];
}
export interface Guardrail {
    readonly name: string;
    readonly riskType: 'prompt-injection' | 'pii-leakage' | 'jailbreak' | 'hallucination' | 'prompt-leakage' | 'indirect-injection';
    /**
     * Check input against this guardrail.
     * Returns blocked=true if the input violates the rule.
     * Returns sanitized text if the guardrail should modify (not block).
     */
    check(input: GuardrailInput): Promise<GuardrailResult>;
}
export interface GuardrailConfig {
    enabled: boolean;
    strict: boolean;
    blockThreshold?: number;
}
export interface GuardrailChainResult {
    passed: boolean;
    blockedBy?: string;
    reason?: string;
    sanitized: string;
    allResults: Map<string, GuardrailResult>;
}
/**
 * Common patterns for detecting injection attempts.
 */
export declare const PROMPT_INJECTION_PATTERNS: RegExp[];
/**
 * Common PII patterns (simplified; production should use more comprehensive detection).
 */
export declare const PII_PATTERNS: {
    email: RegExp;
    phone: RegExp;
    cpf: RegExp;
    ssn: RegExp;
    creditCard: RegExp;
};
/**
 * Jailbreak patterns (role override, capability claiming, etc.)
 */
export declare const JAILBREAK_PATTERNS: RegExp[];
