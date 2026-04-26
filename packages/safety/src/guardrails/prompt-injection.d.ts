/**
 * Guardrail: Prompt Injection Detection
 *
 * Risk: User input contains patterns that attempt to override system instructions.
 * Defense: Detect injection patterns before passing to LLM.
 */
import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
export declare class PromptInjectionGuardrail implements Guardrail {
    readonly name = "prompt-injection-detector";
    readonly riskType: "prompt-injection";
    check(input: GuardrailInput): Promise<GuardrailResult>;
}
