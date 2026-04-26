/**
 * Guardrail: PII Leakage Detection & Sanitization
 *
 * Risk: Document or answer contains PII (emails, phone, CPF, SSN, credit card).
 * Defense: Detect and sanitize PII tokens.
 */
import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
export declare class PIILeakageGuardrail implements Guardrail {
    readonly name = "pii-leakage-sanitizer";
    readonly riskType: "pii-leakage";
    check(input: GuardrailInput): Promise<GuardrailResult>;
}
