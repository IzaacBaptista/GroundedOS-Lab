const DEFAULT_WINDOW_SIZE = 200;
export class TradeoffMetricsStore {
    windowSize;
    samples = [];
    constructor(windowSize = DEFAULT_WINDOW_SIZE) {
        this.windowSize = Math.max(1, Math.floor(windowSize));
    }
    record(sample) {
        this.samples.push({
            ...sample,
            latencyMs: sanitizePositive(sample.latencyMs),
            costUsd: sanitizePositive(sample.costUsd),
            resultCount: sanitizePositive(sample.resultCount),
            topK: Math.max(1, Math.floor(sample.topK || 1)),
            timestamp: sanitizePositive(sample.timestamp),
        });
        while (this.samples.length > this.windowSize) {
            this.samples.shift();
        }
    }
    getSummary() {
        const grouped = new Map();
        for (const sample of this.samples) {
            const bucket = grouped.get(sample.provider) ?? [];
            bucket.push(sample);
            grouped.set(sample.provider, bucket);
        }
        const providers = [...grouped.entries()]
            .map(([provider, samples]) => ({
            provider,
            ...computeAggregate(samples),
        }))
            .sort((a, b) => b.requests - a.requests || a.provider.localeCompare(b.provider));
        return {
            generatedAt: Date.now(),
            windowSize: this.windowSize,
            totals: computeAggregate(this.samples),
            providers,
            recent: this.samples.slice(-20).reverse(),
        };
    }
    clear() {
        this.samples.length = 0;
    }
    get size() {
        return this.samples.length;
    }
}
function computeAggregate(samples) {
    if (samples.length === 0) {
        return {
            requests: 0,
            avgLatencyMs: 0,
            p95LatencyMs: 0,
            avgCostUsd: 0,
            groundedRate: 0,
            cacheHitRate: 0,
            avgResultCount: 0,
        };
    }
    const requests = samples.length;
    const latencies = samples.map((sample) => sanitizePositive(sample.latencyMs)).sort((a, b) => a - b);
    const totalLatency = latencies.reduce((sum, value) => sum + value, 0);
    const totalCost = samples.reduce((sum, sample) => sum + sanitizePositive(sample.costUsd), 0);
    const groundedCount = samples.filter((sample) => sample.grounded).length;
    const cacheHitCount = samples.filter((sample) => sample.cacheHit).length;
    const totalResults = samples.reduce((sum, sample) => sum + sanitizePositive(sample.resultCount), 0);
    return {
        requests,
        avgLatencyMs: roundMetric(totalLatency / requests, 2),
        p95LatencyMs: percentile(latencies, 0.95),
        avgCostUsd: roundMetric(totalCost / requests, 6),
        groundedRate: roundMetric(groundedCount / requests, 4),
        cacheHitRate: roundMetric(cacheHitCount / requests, 4),
        avgResultCount: roundMetric(totalResults / requests, 2),
    };
}
function percentile(sortedValues, p) {
    if (sortedValues.length === 0) {
        return 0;
    }
    const clamped = Math.min(1, Math.max(0, p));
    const index = Math.ceil(clamped * sortedValues.length) - 1;
    const safeIndex = Math.min(sortedValues.length - 1, Math.max(0, index));
    return roundMetric(sortedValues[safeIndex] ?? 0, 2);
}
function roundMetric(value, decimals) {
    return Number(value.toFixed(decimals));
}
function sanitizePositive(value) {
    if (!Number.isFinite(value) || value < 0) {
        return 0;
    }
    return value;
}
//# sourceMappingURL=tradeoffs.js.map