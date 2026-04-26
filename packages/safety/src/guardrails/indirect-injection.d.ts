/**
 * Guardrail: Indirect Document Injection Detection
 *
 * Risk: A PDF or document uploaded by the user contains hidden instructions for the LLM.
 * Defense: Sanitize document content at ETL time; detect embedded instruction patterns.
 */
import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
export declare const DOCUMENT_INJECTION_PATTERNS: RegExp[];
export declare class IndirectInjectionGuardrail implements Guardrail {
    readonly name = "indirect-injection-detector";
    readonly riskType: "indirect-injection";
    check(input: GuardrailInput): Promise<GuardrailResult>;
}
