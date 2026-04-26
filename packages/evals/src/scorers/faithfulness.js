/**
 * Faithfulness Evaluator
 *
 * Measures whether the answer's facts are supported by retrieved chunks.
 * Uses token overlap and semantic similarity heuristics.
 */
export class FaithfulnessEvaluator {
    name = 'faithfulness';
    async evaluate(input) {
        const { answer, retrievedChunks } = input;
        if (retrievedChunks.length === 0) {
            return {
                score: 0,
                passed: false,
                label: 'faithfulness',
                reason: 'No retrieved chunks to verify against',
                details: { strategy: 'no-context' },
            };
        }
        // Combine all retrieved text
        const combinedContext = retrievedChunks.map((c) => c.text).join(' ');
        // Simple heuristic: check token overlap and grounding signals
        const answerTokens = this.tokenize(answer);
        const contextTokens = this.tokenize(combinedContext);
        // Measure how many answer tokens appear in context
        const overlap = answerTokens.filter((token) => contextTokens.includes(token)).length;
        const overlapRatio = overlap / Math.max(answerTokens.length, 1);
        // Check for explicit grounding phrases
        const groundingSignals = [
            'according to',
            'based on',
            'the document',
            'retrieved',
            'found',
            'stated',
            'mentioned',
        ];
        const hasGroundingSignal = groundingSignals.some((phrase) => answer.toLowerCase().includes(phrase));
        // Check for ungrounded claims (hedging phrases)
        const ungroundedSignals = [
            'I think',
            'I believe',
            'I assume',
            'probably',
            'maybe',
            'perhaps',
            'it is likely',
            'based on my knowledge',
        ];
        const hasUngroundedClaims = ungroundedSignals.some((phrase) => answer.toLowerCase().includes(phrase));
        // Calculate score
        let score = overlapRatio;
        if (hasGroundingSignal) {
            score = Math.min(1, score + 0.2);
        }
        if (hasUngroundedClaims) {
            score = Math.max(0, score - 0.3);
        }
        const passed = score >= 0.5;
        return {
            score: Math.round(score * 1000) / 1000,
            passed,
            label: 'faithfulness',
            reason: buildFaithfulnessReason(score, {
                overlapRatio,
                hasGroundingSignal,
                hasUngroundedClaims,
            }),
            details: {
                strategy: 'token-overlap-with-signals',
                overlapRatio: Math.round(overlapRatio * 1000) / 1000,
                answerTokenCount: answerTokens.length,
                contextTokenCount: contextTokens.length,
                groundingSignalsDetected: hasGroundingSignal,
                ungroundedClaimsDetected: hasUngroundedClaims,
            },
        };
    }
    tokenize(text) {
        return text
            .toLowerCase()
            .split(/\W+/)
            .filter((token) => token.length > 2);
    }
}
function buildFaithfulnessReason(score, details) {
    if (score >= 0.8) {
        return 'Answer appears well-grounded in retrieved context';
    }
    if (score >= 0.5) {
        const factors = [];
        if (details.overlapRatio < 0.4)
            factors.push('low token overlap');
        if (!details.groundingSignalsDetected)
            factors.push('missing grounding signals');
        if (details.ungroundedClaimsDetected)
            factors.push('ungrounded claims detected');
        return `Answer has moderate grounding: ${factors.join(', ')}`;
    }
    return 'Answer contains claims not well-supported by retrieved context';
}
//# sourceMappingURL=faithfulness.js.map