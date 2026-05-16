import { describe, it, expect, beforeEach } from "vitest";
import { QueueMetricsStore } from "./queue-metrics";

describe("QueueMetricsStore - Prometheus Export", () => {
  let store: QueueMetricsStore;

  beforeEach(() => {
    store = new QueueMetricsStore();
  });

  it("should export metrics in Prometheus text format", () => {
    store.recordSuccess({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
      durationMs: 100,
      attemptsMade: 1,
    });

    store.recordFailure({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
      attemptsMade: 2,
      error: "Test error",
    });

    const prometheusText = store.toPrometheusFormat();

    // Verify HELP and TYPE comments are present
    expect(prometheusText).toContain(
      "# HELP queue_jobs_succeeded_total Total jobs succeeded per queue and job type"
    );
    expect(prometheusText).toContain("# TYPE queue_jobs_succeeded_total counter");
    expect(prometheusText).toContain(
      "# HELP queue_jobs_failed_total Total jobs failed per queue and job type"
    );
    expect(prometheusText).toContain("# TYPE queue_jobs_failed_total counter");

    // Verify metrics with labels are present
    expect(prometheusText).toContain('queue="groundedos-phase6-jobs"');
    expect(prometheusText).toContain('job_type="phase5-experiment"');
    expect(prometheusText).toContain("queue_jobs_succeeded_total");
    expect(prometheusText).toContain("queue_jobs_failed_total");

    // Verify EOF marker
    expect(prometheusText).toContain("# EOF");
  });

  it("should export metrics as JSON (OpenMetrics format)", () => {
    store.recordSuccess({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
      durationMs: 150,
      attemptsMade: 1,
    });

    store.recordRetry({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
    });

    const prometheusJson = store.toPrometheusJson();

    // Verify structure
    expect(Array.isArray(prometheusJson)).toBe(true);
    expect(prometheusJson.length).toBeGreaterThan(0);

    // Verify metric objects have required fields
    for (const metric of prometheusJson) {
      expect(metric).toHaveProperty("name");
      expect(metric).toHaveProperty("labels");
      expect(metric).toHaveProperty("value");
      expect(metric).toHaveProperty("type");
      expect(["counter", "gauge"]).toContain(metric.type);
    }

    // Verify specific metrics
    const succeeded = prometheusJson.find((m) => m.name === "queue_jobs_succeeded_total");
    expect(succeeded?.value).toBe(1);
    expect(succeeded?.labels.job_type).toBe("phase5-experiment");

    const retrying = prometheusJson.find((m) => m.name === "queue_jobs_retrying_total");
    expect(retrying?.value).toBe(1);
  });

  it("should include p95 percentile in Prometheus export", () => {
    // Add multiple samples to have meaningful p95
    for (let i = 100; i <= 500; i += 50) {
      store.recordSuccess({
        queueName: "groundedos-phase6-jobs",
        jobType: "phase5-experiment",
        durationMs: i,
        attemptsMade: 1,
      });
    }

    const prometheusText = store.toPrometheusFormat();

    // Verify p95 metric is present
    expect(prometheusText).toContain("queue_duration_ms_p95");

    // Verify it has label values
    expect(prometheusText).toContain('queue="groundedos-phase6-jobs"');

    // Verify average is also present
    expect(prometheusText).toContain("queue_duration_ms_average");
  });

  it("should escape special characters in Prometheus labels", () => {
    store.recordSuccess({
      queueName: 'groundedos-phase6"jobs',
      jobType: "phase5-experiment",
      durationMs: 100,
      attemptsMade: 1,
    });

    const prometheusText = store.toPrometheusFormat();

    // Verify escaped quote in label value
    expect(prometheusText).toContain('groundedos-phase6\\"jobs');
  });

  it("should handle multiple job types in Prometheus export", () => {
    store.recordSuccess({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
      durationMs: 100,
      attemptsMade: 1,
    });

    store.recordSuccess({
      queueName: "groundedos-phase6-jobs",
      jobType: "model-benchmark",
      durationMs: 200,
      attemptsMade: 1,
    });

    const prometheusText = store.toPrometheusFormat();

    // Verify both job types are present
    const lines = prometheusText.split("\n");
    const metricsForPhase5 = lines.filter(
      (l) => l.includes('job_type="phase5-experiment"') && l.startsWith("queue_")
    );
    const metricsForBenchmark = lines.filter(
      (l) => l.includes('job_type="model-benchmark"') && l.startsWith("queue_")
    );

    expect(metricsForPhase5.length).toBeGreaterThan(0);
    expect(metricsForBenchmark.length).toBeGreaterThan(0);
  });

  it("should include all metric types (counter and gauge)", () => {
    store.recordSuccess({
      queueName: "groundedos-phase6-jobs",
      jobType: "phase5-experiment",
      durationMs: 100,
      attemptsMade: 1,
    });

    const prometheusJson = store.toPrometheusJson();

    const counters = prometheusJson.filter((m) => m.type === "counter");
    const gauges = prometheusJson.filter((m) => m.type === "gauge");

    // Should have both types
    expect(counters.length).toBeGreaterThan(0);
    expect(gauges.length).toBeGreaterThan(0);

    // Counters: succeeded, failed, retrying, dlq, attempts
    const counterNames = new Set(counters.map((c) => c.name));
    expect(counterNames.has("queue_jobs_succeeded_total")).toBe(true);
    expect(counterNames.has("queue_jobs_failed_total")).toBe(true);

    // Gauges: average duration, p95 duration
    const gaugeNames = new Set(gauges.map((g) => g.name));
    expect(gaugeNames.has("queue_duration_ms_average")).toBe(true);
    expect(gaugeNames.has("queue_duration_ms_p95")).toBe(true);
  });
});
