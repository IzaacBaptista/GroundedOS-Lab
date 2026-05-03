export interface TradeoffRequestSample {
    requestId: string;
    timestamp: number;
    provider: string;
    latencyMs: number;
    costUsd: number;
    grounded: boolean;
    cacheHit: boolean;
    topK: number;
    resultCount: number;
}
export interface TradeoffAggregateMetrics {
    requests: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    avgCostUsd: number;
    groundedRate: number;
    cacheHitRate: number;
    avgResultCount: number;
}
export interface ProviderTradeoffMetrics extends TradeoffAggregateMetrics {
    provider: string;
}
export interface TradeoffMetricsSummary {
    generatedAt: number;
    windowSize: number;
    totals: TradeoffAggregateMetrics;
    providers: ProviderTradeoffMetrics[];
    recent: TradeoffRequestSample[];
}
