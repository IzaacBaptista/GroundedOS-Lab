/**
 * Guardrail: Hallucination Detection
 *
 * Risk: Answer includes claims not grounded in retrieved chunks.
 * Defense: Grounding enforcement - verify factual claims are supported by context.
 * Note: This is a simplified check; production would use semantic similarity or NLP-based grounding.
 */
export class HallucinationGuardrail {
    name = 'hallucination-detector';
    riskType = 'hallucination';
    async check(input) {
        const { text, role } = input;
        // Only check assistant responses
        if (role === 'user') {
            return {
                blocked: false,
                sanitized: text,
                detectedPatterns: [],
            };
        }
        const hallucInput = input;
        const retrievedChunks = hallucInput.retrievedChunks || [];
        // If no retrieved chunks provided, cannot verify grounding
        if (retrievedChunks.length === 0) {
            return {
                blocked: false,
                reason: 'No retrieved chunks provided for grounding check',
                sanitized: text,
                detectedPatterns: [],
            };
        }
        // Simple heuristic: check if answer contains phrases like "I don't know", "according to",
        // or other grounding signals. Production would do semantic similarity or token overlap.
        const groundingSignals = [
            /according to/i,
            /based on/i,
            /the document/i,
            /retrieved.*content/i,
            /i don't know/i,
            /not mentioned/i,
        ];
        const hasGroundingSignal = groundingSignals.some((pattern) => pattern.test(text));
        // Check if answer is very long compared to source chunks
        const combinedChunkLength = retrievedChunks.reduce((sum, chunk) => sum + chunk.text.length, 0);
        const answerLength = text.length;
        // If answer is > 3x the source material and no grounding signal, might be hallucinating
        if (answerLength > combinedChunkLength * 3 && !hasGroundingSignal) {
            return {
                blocked: false,
                reason: 'Answer length exceeds source material; possible hallucination',
                sanitized: text,
                riskLevel: 'medium',
                detectedPatterns: ['excessive-length-vs-source'],
            };
        }
        return {
            blocked: false,
            sanitized: text,
            detectedPatterns: [],
        };
    }
}
//# sourceMappingURL=hallucination.js.map