import type { TradeoffMetricsSummary, TradeoffRequestSample } from "./types";
export declare class TradeoffMetricsStore {
    private readonly windowSize;
    private readonly samples;
    constructor(windowSize?: number);
    record(sample: TradeoffRequestSample): void;
    getSummary(): TradeoffMetricsSummary;
    clear(): void;
    get size(): number;
}
