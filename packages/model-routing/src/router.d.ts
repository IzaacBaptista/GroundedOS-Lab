export type RoutingIntent = "simple" | "reasoning" | "ambiguous" | "comparative" | "procedural";
export interface RoutingCandidate {
    model: string;
    provider: "local" | "cloud" | "ollama";
    latencyTier: "low" | "medium" | "high";
    costTier: "low" | "medium" | "high";
    qualityTier: "baseline" | "strong" | "reasoning";
}
export interface QueryRoutingFeatures {
    queryLength: number;
    tokenEstimate: number;
    hasReasoningKeywords: boolean;
    hasAmbiguityKeywords: boolean;
    hasComparisonKeywords: boolean;
    hasProceduralKeywords: boolean;
    intent: RoutingIntent;
    complexityScore: number;
}
export interface ModelRoutingDecision {
    selectedModel: string;
    selectedProvider: "local" | "cloud" | "ollama";
    reason: string;
    confidence: number;
    tradeoff: {
        latency: "low" | "medium" | "high";
        cost: "low" | "medium" | "high";
        quality: "baseline" | "strong" | "reasoning";
    };
    alternatives: Array<{
        model: string;
        provider: "local" | "cloud" | "ollama";
        reason: string;
    }>;
    features: QueryRoutingFeatures;
}
export interface RoutingContext {
    forcedModel?: string;
    forceCheap?: boolean;
    forceQuality?: boolean;
}
export declare function analyzeQuery(query: string): QueryRoutingFeatures;
export declare function routeModel(query: string, context?: RoutingContext, candidates?: RoutingCandidate[]): ModelRoutingDecision;
