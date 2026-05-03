/**
 * Guardrail: Hallucination Detection
 *
 * Risk: Answer includes claims not grounded in retrieved chunks.
 * Defense: Grounding enforcement - verify factual claims are supported by context.
 * Note: This is a simplified check; production would use semantic similarity or NLP-based grounding.
 */
import type { Guardrail, GuardrailInput, GuardrailResult } from '../types.js';
export interface HallucinationCheckInput extends GuardrailInput {
    retrievedChunks?: Array<{
        text: string;
        score: number;
    }>;
    expectedChunkIds?: string[];
}
export declare class HallucinationGuardrail implements Guardrail {
    readonly name = "hallucination-detector";
    readonly riskType: "hallucination";
    check(input: GuardrailInput | HallucinationCheckInput): Promise<GuardrailResult>;
}
