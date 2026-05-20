import { describe, expect, it } from "vitest";
import { createTempDir } from "@groundedos/test-harness";
import { TraceStore } from "./trace-store";

async function createStore(): Promise<TraceStore> {
  const dir = await createTempDir("groundedos-observability-");
  return new TraceStore(dir);
}

describe("TraceStore", () => {
  it("persists structured traces and reads them back", async () => {
    const store = await createStore();

    await store.append({
      version: "v1",
      timestamp: new Date().toISOString(),
      component: "retrieval",
      operation: "rag.pipeline",
      status: "success",
      durationMs: 42,
      correlation: {
        requestId: "req-1",
        traceId: "trace-1",
      },
      metadata: {
        groundedness: 1,
        costUsd: 0.01,
        cacheHit: true,
      },
    });

    const traces = await store.readRecent(10);
    expect(traces).toHaveLength(1);
    expect(traces[0].correlation.requestId).toBe("req-1");
    expect(traces[0].operation).toBe("rag.pipeline");
  });

  it("aggregates historical metrics for dashboard-ready summaries", async () => {
    const store = await createStore();

    await store.append({
      version: "v1",
      timestamp: new Date().toISOString(),
      component: "retrieval",
      operation: "rag.pipeline",
      status: "success",
      durationMs: 100,
      correlation: { requestId: "req-a" },
      metadata: { groundedness: 0.8, costUsd: 0.02, cacheHit: true, retries: 0 },
    });

    await store.append({
      version: "v1",
      timestamp: new Date().toISOString(),
      component: "job",
      operation: "job_retry",
      status: "error",
      durationMs: 30,
      correlation: { requestId: "req-b" },
      metadata: { retries: 1 },
      error: { message: "retry" },
    });

    const summary = await store.getMetricsSummary();
    expect(summary.totals.requests).toBe(2);
    expect(summary.totals.failures).toBe(1);
    expect(summary.totals.retries).toBe(1);
    expect(summary.byComponent.some((item) => item.component === "retrieval")).toBe(true);
  });

  it("finds the latest trace by correlation identifiers", async () => {
    const store = await createStore();

    await store.append({
      version: "v1",
      timestamp: "2026-01-01T00:00:00.000Z",
      component: "retrieval",
      operation: "rag.pipeline",
      status: "success",
      durationMs: 10,
      correlation: {
        requestId: "req-1",
        traceId: "trace-1",
      },
    });
    await store.append({
      version: "v1",
      timestamp: "2026-01-02T00:00:00.000Z",
      component: "retrieval",
      operation: "rag.pipeline",
      status: "success",
      durationMs: 20,
      correlation: {
        requestId: "req-1",
        traceId: "trace-1",
      },
    });

    const trace = await store.findLatestTrace({
      traceId: "trace-1",
      operation: "rag.pipeline",
      component: "retrieval",
    });

    expect(trace?.durationMs).toBe(20);
    expect(trace?.correlation.requestId).toBe("req-1");
  });
});
