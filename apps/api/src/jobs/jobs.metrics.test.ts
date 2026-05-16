import { describe, expect, it } from "vitest";
import { QueueMetricsStore } from "./queue-metrics";

describe("QueueMetricsStore", () => {
  it("tracks success, attempts, average and p95 durations", () => {
    const store = new QueueMetricsStore();

    store.recordSuccess({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
      durationMs: 100,
      attemptsMade: 1,
    });

    store.recordSuccess({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
      durationMs: 300,
      attemptsMade: 2,
    });

    const metrics = store.snapshot();
    expect(metrics).toHaveLength(1);
    expect(metrics[0].jobsSucceeded).toBe(2);
    expect(metrics[0].totalAttempts).toBe(3);
    expect(metrics[0].averageDurationMs).toBe(200);
    expect(metrics[0].p95DurationMs).toBeGreaterThan(250);
  });

  it("tracks failures, retries, DLQ and last failure context", () => {
    const store = new QueueMetricsStore();

    store.recordFailure({
      queueName: "groundedos-phase6-jobs",
      jobType: "model-benchmark",
      attemptsMade: 1,
      error: "temporary error",
      correlation: { requestId: "req-1", userId: "user-1" },
    });

    store.recordRetry({
      queueName: "groundedos-phase6-jobs",
      jobType: "model-benchmark",
    });

    store.recordDlq({
      queueName: "groundedos-phase6-jobs",
      jobType: "model-benchmark",
    });

    const [metric] = store.snapshot();
    expect(metric.jobsErrored).toBe(1);
    expect(metric.jobsRetrying).toBe(1);
    expect(metric.jobsDlq).toBe(1);
    expect(metric.lastFailure?.message).toBe("temporary error");
    expect(metric.lastFailure?.correlation?.requestId).toBe("req-1");
  });
});
