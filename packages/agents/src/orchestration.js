export function orchestrateAnswerPipeline(input) {
    const config = {
        enabled: true,
        verifyGrounding: true,
        draftModel: "local-extractive",
        refineModel: "groq",
        verifyModel: "local-verifier",
        ...input.config,
    };
    if (!config.enabled) {
        return {
            mode: "single-model",
            finalAnswer: input.baseAnswer,
            steps: [],
        };
    }
    const steps = [];
    const draft = simulateDraft(input.baseAnswer, input.question);
    steps.push({
        id: "draft",
        model: config.draftModel ?? "local-extractive",
        role: "draft",
        inputPreview: preview(input.question),
        outputPreview: preview(draft),
        durationMs: 12,
        qualityDelta: 0.05,
    });
    const refined = simulateRefinement(draft, input.retrievedContext);
    steps.push({
        id: "refine",
        model: config.refineModel ?? "groq",
        role: "refine",
        inputPreview: preview(draft),
        outputPreview: preview(refined),
        durationMs: 18,
        qualityDelta: 0.12,
    });
    let finalAnswer = refined;
    if (config.verifyGrounding) {
        const grounded = verifyGrounding(finalAnswer, input.retrievedContext);
        finalAnswer = grounded ? refined : `${refined}\n\nNote: some claims may be weakly grounded; review citations.`;
        steps.push({
            id: "verify",
            model: config.verifyModel ?? "local-verifier",
            role: "verify",
            inputPreview: preview(refined),
            outputPreview: grounded ? "Grounding check passed" : "Grounding check flagged gaps",
            durationMs: 8,
            grounded,
            qualityDelta: grounded ? 0.03 : -0.06,
        });
    }
    return {
        mode: "multi-model",
        finalAnswer,
        steps,
        comparison: {
            singleModelAnswer: input.baseAnswer,
            multiModelAnswer: finalAnswer,
        },
    };
}
function simulateDraft(baseAnswer, question) {
    if (!baseAnswer.trim()) {
        return `Draft response for: ${question}`;
    }
    return baseAnswer;
}
function simulateRefinement(draft, context) {
    const contextHint = context.trim().length > 0 ? "Grounded with retrieved context." : "Limited context available.";
    return `${draft}\n\n${contextHint}`;
}
function verifyGrounding(answer, context) {
    if (!context.trim()) {
        return false;
    }
    const answerTerms = new Set(tokenize(answer));
    const contextTerms = new Set(tokenize(context));
    let overlap = 0;
    for (const term of answerTerms) {
        if (contextTerms.has(term)) {
            overlap += 1;
        }
    }
    return overlap >= Math.max(2, Math.floor(answerTerms.size * 0.08));
}
function tokenize(text) {
    return text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
}
function preview(text, max = 120) {
    const normalized = text.replace(/\s+/g, " ").trim();
    return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}
//# sourceMappingURL=orchestration.js.map