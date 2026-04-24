import { describe, expect, it } from "vitest";
import { TradeoffMetricsStore } from "./tradeoffs";

describe("TradeoffMetricsStore", () => {
  it("aggregates totals and provider metrics", () => {
    const store = new TradeoffMetricsStore(10);

    store.record({
      requestId: "req-1",
      timestamp: 1,
      provider: "api-lexical",
      latencyMs: 20,
      costUsd: 0,
      grounded: true,
      cacheHit: false,
      topK: 3,
      resultCount: 3,
    });
    store.record({
      requestId: "req-2",
      timestamp: 2,
      provider: "api-lexical",
      latencyMs: 40,
      costUsd: 0,
      grounded: false,
      cacheHit: true,
      topK: 3,
      resultCount: 1,
    });
    store.record({
      requestId: "req-3",
      timestamp: 3,
      provider: "ollama",
      latencyMs: 90,
      costUsd: 0.01,
      grounded: true,
      cacheHit: false,
      topK: 2,
      resultCount: 2,
    });

    const summary = store.getSummary();

    expect(summary.totals.requests).toBe(3);
    expect(summary.totals.avgLatencyMs).toBe(50);
    expect(summary.totals.p95LatencyMs).toBe(90);
    expect(summary.totals.groundedRate).toBeCloseTo(0.6667, 4);
    expect(summary.providers).toHaveLength(2);
    expect(summary.providers[0]).toMatchObject({
      provider: "api-lexical",
      requests: 2,
      avgLatencyMs: 30,
      cacheHitRate: 0.5,
    });
  });

  it("keeps a sliding window of recent samples", () => {
    const store = new TradeoffMetricsStore(2);

    store.record({
      requestId: "old",
      timestamp: 1,
      provider: "api-lexical",
      latencyMs: 10,
      costUsd: 0,
      grounded: true,
      cacheHit: false,
      topK: 1,
      resultCount: 1,
    });
    store.record({
      requestId: "mid",
      timestamp: 2,
      provider: "api-lexical",
      latencyMs: 20,
      costUsd: 0,
      grounded: true,
      cacheHit: false,
      topK: 1,
      resultCount: 1,
    });
    store.record({
      requestId: "new",
      timestamp: 3,
      provider: "api-lexical",
      latencyMs: 30,
      costUsd: 0,
      grounded: true,
      cacheHit: true,
      topK: 1,
      resultCount: 1,
    });

    const summary = store.getSummary();

    expect(summary.totals.requests).toBe(2);
    expect(summary.recent.map((sample) => sample.requestId)).toEqual(["new", "mid"]);
  });
});
