import type {
  ProviderTradeoffMetrics,
  TradeoffAggregateMetrics,
  TradeoffMetricsSummary,
  TradeoffRequestSample,
} from "./types";

const DEFAULT_WINDOW_SIZE = 200;

export class TradeoffMetricsStore {
  private readonly windowSize: number;
  private readonly samples: TradeoffRequestSample[] = [];

  constructor(windowSize = DEFAULT_WINDOW_SIZE) {
    this.windowSize = Math.max(1, Math.floor(windowSize));
  }

  record(sample: TradeoffRequestSample): void {
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

  getSummary(): TradeoffMetricsSummary {
    const grouped = new Map<string, TradeoffRequestSample[]>();

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

  clear(): void {
    this.samples.length = 0;
  }

  get size(): number {
    return this.samples.length;
  }
}

function computeAggregate(samples: TradeoffRequestSample[]): TradeoffAggregateMetrics {
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

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const clamped = Math.min(1, Math.max(0, p));
  const index = Math.ceil(clamped * sortedValues.length) - 1;
  const safeIndex = Math.min(sortedValues.length - 1, Math.max(0, index));

  return roundMetric(sortedValues[safeIndex] ?? 0, 2);
}

function roundMetric(value: number, decimals: number): number {
  return Number(value.toFixed(decimals));
}

function sanitizePositive(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}
