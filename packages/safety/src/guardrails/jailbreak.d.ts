/**
 * Guardrail: Jailbreak Detection
 *
 * Risk: User attempts role-override, capability claiming, or system-identity redefinition.
 * Defense: Detect jailbreak patterns and block before LLM call.
 */
import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
export declare class JailbreakGuardrail implements Guardrail {
    readonly name = "jailbreak-detector";
    readonly riskType: "jailbreak";
    check(input: GuardrailInput): Promise<GuardrailResult>;
}
