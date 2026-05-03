export interface CostEvent {
    requestId: string;
    stage: CostStage;
    provider: string;
    units: number;
    unitCost: number;
    totalCost: number;
    metadata?: Record<string, unknown>;
}
export type CostStage = "embedding-index" | "embedding-query" | "llm-inference" | "retrieval" | "reranking";
export interface RequestCostSummary {
    requestId: string;
    totalCostUsd: number;
    breakdown: CostEvent[];
    withinBudget: boolean;
    budgetRemainingUsd?: number;
}
export interface CostBudget {
    perRequestLimitUsd: number;
    dailyLimitUsd: number;
    alertThresholdPct: number;
}
