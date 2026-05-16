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
