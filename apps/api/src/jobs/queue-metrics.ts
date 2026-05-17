import type { JobCorrelationIds, Phase6JobType } from "./job-queue";

export interface QueueMetricFailure {
  message: string;
  timestamp: string;
  correlation?: JobCorrelationIds;
}

export interface QueueMetricSnapshot {
  queueName: string;
  jobType: Phase6JobType;
  jobsSucceeded: number;
  jobsErrored: number;
  jobsRetrying: number;
  jobsDlq: number;
  totalAttempts: number;
  averageDurationMs: number;
  p95DurationMs: number;
  lastFailure?: QueueMetricFailure;
}

interface QueueMetricState {
  queueName: string;
  jobType: Phase6JobType;
  jobsSucceeded: number;
  jobsErrored: number;
  jobsRetrying: number;
  jobsDlq: number;
  totalAttempts: number;
  durationSamples: number[];
  lastFailure?: QueueMetricFailure;
}

export class QueueMetricsStore {
  private readonly byKey = new Map<string, QueueMetricState>();

  recordSuccess(input: {
    queueName: string;
    jobType: Phase6JobType;
    durationMs: number;
    attemptsMade: number;
  }): void {
    const state = this.ensureState(input.queueName, input.jobType);
    state.jobsSucceeded += 1;
    state.totalAttempts += Math.max(1, input.attemptsMade);

    if (Number.isFinite(input.durationMs) && input.durationMs >= 0) {
      state.durationSamples.push(input.durationMs);
      if (state.durationSamples.length > 512) {
        state.durationSamples.shift();
      }
    }
  }

  /**
   * Export metrics in Prometheus text format (OpenMetrics).
   * Can be scraped by Prometheus or used with custom collectors.
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    // HELP and TYPE declarations
    lines.push(
      "# HELP queue_jobs_succeeded_total Total jobs succeeded per queue and job type"
    );
    lines.push("# TYPE queue_jobs_succeeded_total counter");
    lines.push(
      "# HELP queue_jobs_failed_total Total jobs failed per queue and job type"
    );
    lines.push("# TYPE queue_jobs_failed_total counter");
    lines.push(
      "# HELP queue_jobs_retrying_total Total jobs retrying per queue and job type"
    );
    lines.push("# TYPE queue_jobs_retrying_total counter");
    lines.push("# HELP queue_jobs_dlq_total Total jobs in DLQ per queue and job type");
    lines.push("# TYPE queue_jobs_dlq_total counter");
    lines.push("# HELP queue_attempts_total Total attempts made per queue and job type");
    lines.push("# TYPE queue_attempts_total counter");
    lines.push(
      "# HELP queue_duration_ms_average Average job duration in milliseconds per queue and job type"
    );
    lines.push("# TYPE queue_duration_ms_average gauge");
    lines.push(
      "# HELP queue_duration_ms_p95 95th percentile job duration in milliseconds per queue and job type"
    );
    lines.push("# TYPE queue_duration_ms_p95 gauge");

    // Metrics
    const snapshots = this.snapshot();
    for (const snap of snapshots) {
      const labels = this.formatLabels({
        queue: snap.queueName,
        job_type: snap.jobType,
      });

      lines.push(`queue_jobs_succeeded_total${labels} ${snap.jobsSucceeded}`);
      lines.push(`queue_jobs_failed_total${labels} ${snap.jobsErrored}`);
      lines.push(`queue_jobs_retrying_total${labels} ${snap.jobsRetrying}`);
      lines.push(`queue_jobs_dlq_total${labels} ${snap.jobsDlq}`);
      lines.push(`queue_attempts_total${labels} ${snap.totalAttempts}`);
      lines.push(`queue_duration_ms_average${labels} ${snap.averageDurationMs}`);
      lines.push(`queue_duration_ms_p95${labels} ${snap.p95DurationMs}`);
    }

    lines.push("# EOF");
    return lines.join("\n");
  }

  /**
   * Export metrics as JSON (OpenMetrics-compatible structure).
   * Useful for custom exporters or applications that prefer JSON.
   */
  toPrometheusJson(): Array<{
    name: string;
    labels: Record<string, string>;
    value: number;
    type: "counter" | "gauge";
  }> {
    const result: Array<{
      name: string;
      labels: Record<string, string>;
      value: number;
      type: "counter" | "gauge";
    }> = [];

    const snapshots = this.snapshot();
    for (const snap of snapshots) {
      const baseLabels = { queue: snap.queueName, job_type: snap.jobType };

      result.push({
        name: "queue_jobs_succeeded_total",
        labels: baseLabels,
        value: snap.jobsSucceeded,
        type: "counter",
      });
      result.push({
        name: "queue_jobs_failed_total",
        labels: baseLabels,
        value: snap.jobsErrored,
        type: "counter",
      });
      result.push({
        name: "queue_jobs_retrying_total",
        labels: baseLabels,
        value: snap.jobsRetrying,
        type: "counter",
      });
      result.push({
        name: "queue_jobs_dlq_total",
        labels: baseLabels,
        value: snap.jobsDlq,
        type: "counter",
      });
      result.push({
        name: "queue_attempts_total",
        labels: baseLabels,
        value: snap.totalAttempts,
        type: "counter",
      });
      result.push({
        name: "queue_duration_ms_average",
        labels: baseLabels,
        value: snap.averageDurationMs,
        type: "gauge",
      });
      result.push({
        name: "queue_duration_ms_p95",
        labels: baseLabels,
        value: snap.p95DurationMs,
        type: "gauge",
      });
    }

    return result;
  }

  private formatLabels(labels: Record<string, string>): string {
    const pairs = Object.entries(labels)
      .map(([key, value]) => `${key}="${this.escapePrometheusLabel(value)}"`)
      .join(",");
    return `{${pairs}}`;
  }

  private escapePrometheusLabel(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n");
  }

  recordFailure(input: {
    queueName: string;
    jobType: Phase6JobType;
    attemptsMade: number;
    error: string;
    correlation?: JobCorrelationIds;
  }): void {
    const state = this.ensureState(input.queueName, input.jobType);
    state.jobsErrored += 1;
    state.totalAttempts += Math.max(1, input.attemptsMade);
    state.lastFailure = {
      message: input.error,
      timestamp: new Date().toISOString(),
      correlation: input.correlation,
    };
  }

  recordRetry(input: { queueName: string; jobType: Phase6JobType }): void {
    const state = this.ensureState(input.queueName, input.jobType);
    state.jobsRetrying += 1;
  }

  recordDlq(input: { queueName: string; jobType: Phase6JobType }): void {
    const state = this.ensureState(input.queueName, input.jobType);
    state.jobsDlq += 1;
  }

  snapshot(): QueueMetricSnapshot[] {
    return [...this.byKey.values()].map((state) => {
      const durations = [...state.durationSamples].sort((a, b) => a - b);
      const averageDurationMs =
        durations.length === 0
          ? 0
          : Number((durations.reduce((sum, value) => sum + value, 0) / durations.length).toFixed(2));

      const p95DurationMs = durations.length === 0 ? 0 : quantile(durations, 0.95);

      return {
        queueName: state.queueName,
        jobType: state.jobType,
        jobsSucceeded: state.jobsSucceeded,
        jobsErrored: state.jobsErrored,
        jobsRetrying: state.jobsRetrying,
        jobsDlq: state.jobsDlq,
        totalAttempts: state.totalAttempts,
        averageDurationMs,
        p95DurationMs,
        lastFailure: state.lastFailure,
      };
    });
  }

  private ensureState(queueName: string, jobType: Phase6JobType): QueueMetricState {
    const key = `${queueName}:${jobType}`;
    const existing = this.byKey.get(key);
    if (existing) {
      return existing;
    }

    const created: QueueMetricState = {
      queueName,
      jobType,
      jobsSucceeded: 0,
      jobsErrored: 0,
      jobsRetrying: 0,
      jobsDlq: 0,
      totalAttempts: 0,
      durationSamples: [],
    };

    this.byKey.set(key, created);
    return created;
  }
}

function quantile(sortedValues: number[], q: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  const position = Math.max(0, Math.min(1, q)) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return Number(sortedValues[lowerIndex].toFixed(2));
  }

  const weight = position - lowerIndex;
  const interpolated =
    sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
  return Number(interpolated.toFixed(2));
}
