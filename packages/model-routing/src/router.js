const DEFAULT_CANDIDATES = [
    {
        model: "local-extractive",
        provider: "local",
        latencyTier: "low",
        costTier: "low",
        qualityTier: "baseline",
    },
    {
        model: "ollama",
        provider: "ollama",
        latencyTier: "medium",
        costTier: "low",
        qualityTier: "strong",
    },
    {
        model: "groq",
        provider: "cloud",
        latencyTier: "medium",
        costTier: "medium",
        qualityTier: "reasoning",
    },
];
const REASONING_KEYWORDS = [
    "why",
    "explain",
    "compare",
    "tradeoff",
    "reason",
    "because",
    "how",
    "difference",
];
const AMBIGUITY_KEYWORDS = ["maybe", "could", "might", "or", "versus", "unclear"];
const COMPARISON_KEYWORDS = ["compare", "vs", "versus", "better", "worse", "difference"];
const PROCEDURAL_KEYWORDS = ["steps", "how to", "implement", "configure", "setup", "run"];
export function analyzeQuery(query) {
    const normalized = query.trim().toLowerCase();
    const tokens = normalized.split(/\s+/).filter(Boolean);
    const tokenEstimate = Math.max(1, tokens.length);
    const hasReasoningKeywords = hasAnyKeyword(normalized, REASONING_KEYWORDS);
    const hasAmbiguityKeywords = hasAnyKeyword(normalized, AMBIGUITY_KEYWORDS);
    const hasComparisonKeywords = hasAnyKeyword(normalized, COMPARISON_KEYWORDS);
    const hasProceduralKeywords = hasAnyKeyword(normalized, PROCEDURAL_KEYWORDS);
    const complexityScore = Math.min(1, tokenEstimate / 28 +
        (hasReasoningKeywords ? 0.28 : 0) +
        (hasAmbiguityKeywords ? 0.2 : 0) +
        (hasComparisonKeywords ? 0.2 : 0));
    let intent = "simple";
    if (hasComparisonKeywords) {
        intent = "comparative";
    }
    else if (hasProceduralKeywords) {
        intent = "procedural";
    }
    else if (hasAmbiguityKeywords) {
        intent = "ambiguous";
    }
    else if (hasReasoningKeywords) {
        intent = "reasoning";
    }
    return {
        queryLength: normalized.length,
        tokenEstimate,
        hasReasoningKeywords,
        hasAmbiguityKeywords,
        hasComparisonKeywords,
        hasProceduralKeywords,
        intent,
        complexityScore: Number(complexityScore.toFixed(3)),
    };
}
export function routeModel(query, context = {}, candidates = DEFAULT_CANDIDATES) {
    const features = analyzeQuery(query);
    if (context.forcedModel) {
        const forced = candidates.find((candidate) => candidate.model === context.forcedModel) ?? candidates[0];
        return {
            selectedModel: forced.model,
            selectedProvider: forced.provider,
            reason: `Model forced by context: ${forced.model}`,
            confidence: 1,
            tradeoff: {
                latency: forced.latencyTier,
                cost: forced.costTier,
                quality: forced.qualityTier,
            },
            alternatives: buildAlternatives(candidates, forced.model),
            features,
        };
    }
    const preferred = pickCandidate(features, context, candidates);
    const confidence = computeRoutingConfidence(features, preferred);
    return {
        selectedModel: preferred.model,
        selectedProvider: preferred.provider,
        reason: buildReason(features, preferred),
        confidence,
        tradeoff: {
            latency: preferred.latencyTier,
            cost: preferred.costTier,
            quality: preferred.qualityTier,
        },
        alternatives: buildAlternatives(candidates, preferred.model),
        features,
    };
}
function pickCandidate(features, context, candidates) {
    if (context.forceCheap) {
        return candidates.find((candidate) => candidate.costTier === "low") ?? candidates[0];
    }
    if (context.forceQuality) {
        return (candidates.find((candidate) => candidate.qualityTier === "reasoning") ??
            candidates.find((candidate) => candidate.qualityTier === "strong") ??
            candidates[0]);
    }
    if (features.tokenEstimate <= 10 && features.complexityScore < 0.35) {
        return candidates.find((candidate) => candidate.costTier === "low") ?? candidates[0];
    }
    if (features.hasReasoningKeywords || features.intent === "comparative") {
        return (candidates.find((candidate) => candidate.qualityTier === "reasoning") ??
            candidates.find((candidate) => candidate.qualityTier === "strong") ??
            candidates[0]);
    }
    if (features.complexityScore >= 0.55 || features.hasAmbiguityKeywords) {
        return candidates.find((candidate) => candidate.qualityTier !== "baseline") ?? candidates[0];
    }
    return candidates.find((candidate) => candidate.provider === "ollama") ?? candidates[0];
}
function buildReason(features, candidate) {
    if (candidate.qualityTier === "reasoning") {
        return "Reasoning/comparison intent detected; routed to higher-quality reasoning model.";
    }
    if (candidate.qualityTier === "strong") {
        return "Query complexity is moderate/high; routed to stronger model for better answer quality.";
    }
    return "Query is short/simple; routed to fast low-cost model to minimize latency and cost.";
}
function buildAlternatives(candidates, selectedModel) {
    return candidates
        .filter((candidate) => candidate.model !== selectedModel)
        .slice(0, 2)
        .map((candidate) => ({
        model: candidate.model,
        provider: candidate.provider,
        reason: `${candidate.qualityTier} quality, ${candidate.costTier} cost, ${candidate.latencyTier} latency`,
    }));
}
function computeRoutingConfidence(features, selected) {
    const base = 0.6;
    const intentBoost = features.intent === "simple"
        ? 0.2
        : features.intent === "reasoning" || features.intent === "comparative"
            ? 0.28
            : 0.18;
    const complexityPenalty = selected.qualityTier === "baseline" && features.complexityScore > 0.5 ? 0.2 : 0;
    return Number(Math.max(0.4, Math.min(0.98, base + intentBoost - complexityPenalty)).toFixed(2));
}
function hasAnyKeyword(text, keywords) {
    return keywords.some((keyword) => text.includes(keyword));
}
//# sourceMappingURL=router.js.map