/**
 * Guardrail: Prompt Leakage Detection
 *
 * Risk: User asks for the system prompt or hidden instructions.
 * Defense: Detect and block system-prompt extraction attempts.
 */
import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
export declare const PROMPT_EXTRACTION_PATTERNS: RegExp[];
export declare class PromptLeakageGuardrail implements Guardrail {
    readonly name = "prompt-leakage-detector";
    readonly riskType: "prompt-leakage";
    check(input: GuardrailInput): Promise<GuardrailResult>;
}
