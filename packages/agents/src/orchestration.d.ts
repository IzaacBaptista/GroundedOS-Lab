export interface OrchestrationStep {
    id: string;
    model: string;
    role: "draft" | "refine" | "verify";
    inputPreview: string;
    outputPreview: string;
    durationMs: number;
    grounded?: boolean;
    qualityDelta?: number;
}
export interface OrchestrationResult {
    mode: "single-model" | "multi-model";
    finalAnswer: string;
    steps: OrchestrationStep[];
    comparison?: {
        singleModelAnswer: string;
        multiModelAnswer: string;
    };
}
export interface OrchestrationConfig {
    enabled: boolean;
    verifyGrounding?: boolean;
    draftModel?: string;
    refineModel?: string;
    verifyModel?: string;
}
export declare function orchestrateAnswerPipeline(input: {
    baseAnswer: string;
    question: string;
    retrievedContext: string;
    config?: Partial<OrchestrationConfig>;
}): OrchestrationResult;
