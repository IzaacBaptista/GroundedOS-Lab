import type { CostBudget, CostEvent, CostStage, RequestCostSummary } from "./types";
export declare class BudgetExceededError extends Error {
    readonly requestId: string;
    constructor(requestId: string, message: string);
}
export declare class CostTracker {
    private readonly requestId;
    private readonly events;
    constructor(requestId: string);
    trackEvent(stage: CostStage, provider: string, units: number, unitCost: number, metadata?: Record<string, unknown>): CostEvent;
    getEvents(): CostEvent[];
    getTotalCostUsd(): number;
    summarize(withinBudget?: boolean, budgetRemainingUsd?: number): RequestCostSummary;
}
export declare class CostLedger {
    private readonly ledgerPath;
    constructor(baseDir?: string, ledgerFile?: string);
    get path(): string;
    appendSummary(summary: RequestCostSummary): Promise<void>;
    readSummaries(): Promise<RequestCostSummary[]>;
    getDailyTotalUsd(targetDate?: Date): Promise<number>;
}
export declare class CostBudgetEnforcer {
    private readonly budget;
    constructor(budget: CostBudget);
    validateBudget(requestId: string, projectedRequestCostUsd: number, dailySpentUsd: number): void;
    computeBudgetRemaining(projectedRequestCostUsd: number, dailySpentUsd: number): number | undefined;
}
export declare function resolveUnitCostUsd(provider: string, stage: CostStage): number;
export declare function resolveCostBudgetFromEnv(): CostBudget;
