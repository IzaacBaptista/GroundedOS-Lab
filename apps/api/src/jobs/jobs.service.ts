import { Injectable } from "@nestjs/common";
import { Job, Queue, QueueEvents } from "bullmq";
import { ApiRequestError } from "../errors";
import { getActiveTraceparent } from "../otel";
import { DlqStore, type DlqInspectionResult, type DlqListFilter, type DlqRedriveResult } from "./dlq-store";
import {
  PHASE6_DLQ_NAME,
  PHASE6_QUEUE_NAME,
  type JobCorrelationIds,
  type Phase6DlqEnvelope,
  type Phase6DlqPayload,
  type Phase5ExperimentTrack,
  type Phase6JobPayload,
  type Phase6JobType,
  resolveQueueConnection,
} from "./job-queue";
import { logQueueEvent } from "./queue-logging";
import { QueueMetricsStore, type QueueMetricSnapshot } from "./queue-metrics";
import { resolveQueueRetryPolicy, toBullMqBackoff } from "./queue-policy";

export interface EnqueuedJobResponse {
  jobId: string;
  name: string;
  status: "waiting" | "active";
  queuedAt: string;
}

export interface JobStatusResponse {
  jobId: string;
  name: string;
  status:
    | "waiting"
    | "active"
    | "completed"
    | "failed"
    | "delayed"
    | "paused"
    | "unknown";
  progress?: number;
  attemptsMade: number;
  queuedAt?: string;
  finishedAt?: string;
  returnValue?: unknown;
  failedReason?: string;
}

@Injectable()
export class JobsService {
  private readonly queue = this.createQueue();
  private readonly dlq = this.createDlq();
  private readonly queueEvents = this.createQueueEvents();
  private readonly metrics = new QueueMetricsStore();
  private readonly dlqStore = new DlqStore();

  constructor() {
    this.attachObservers();
  }

  async enqueuePhase5Experiment(
    track: Phase5ExperimentTrack,
    correlation: JobCorrelationIds = {}
  ): Promise<EnqueuedJobResponse> {
    const job = await this.enqueue("phase5-experiment", {
      type: "phase5-experiment",
      track,
      _otel_context: getActiveTraceparent(),
      ...correlation,
    });

    return toEnqueuedJobResponse(job);
  }

  async enqueueModelBenchmark(
    providers: string[],
    correlation: JobCorrelationIds = {}
  ): Promise<EnqueuedJobResponse> {
    const normalizedProviders = providers
      .map((provider) => provider.trim())
      .filter((provider) => provider.length > 0);

    if (normalizedProviders.length === 0) {
      throw new ApiRequestError("At least one provider is required.", 400);
    }

    const job = await this.enqueue("model-benchmark", {
      type: "model-benchmark",
      providers: normalizedProviders,
      _otel_context: getActiveTraceparent(),
      ...correlation,
    });

    return toEnqueuedJobResponse(job);
  }

  getQueueMetrics(): QueueMetricSnapshot[] {
    return this.metrics.snapshot();
  }

  getQueueMetricsPrometheus(): string {
    return this.metrics.toPrometheusFormat();
  }

  async getJobStatus(jobId: string): Promise<JobStatusResponse> {
    const queue = this.requireQueue();
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new ApiRequestError(`Job ${jobId} not found.`, 404);
    }

    const state = await job.getState();

    return {
      jobId: String(job.id),
      name: job.name,
      status: normalizeState(state),
      progress: typeof job.progress === "number" ? job.progress : undefined,
      attemptsMade: job.attemptsMade,
      queuedAt: toIso(job.timestamp),
      finishedAt: toIso(job.finishedOn),
      returnValue: job.returnvalue,
      failedReason: job.failedReason || undefined,
    };
  }

  /**
   * Get a single DLQ entry by ID.
   */
  getDlqEntry(dlqJobId: string): DlqInspectionResult | null {
    return this.dlqStore.get(dlqJobId);
  }

  /**
   * List all DLQ entries with optional filtering.
   */
  listDlqEntries(filter: DlqListFilter = {}): DlqInspectionResult[] {
    return this.dlqStore.list(filter);
  }

  /**
   * Attempt to re-drive a DLQ entry.
   * In a full implementation, this would re-enqueue the job and remove it from DLQ.
   *
   * @param dlqJobId - The DLQ job ID
   * @param dryRun - If true, validate without taking action
   */
  redriveDlqJob(dlqJobId: string, dryRun: boolean = false): DlqRedriveResult {
    const entry = this.dlqStore.get(dlqJobId);
    if (!entry) {
      throw new ApiRequestError(`DLQ entry ${dlqJobId} not found.`, 404);
    }

    const result = this.dlqStore.redrive(dlqJobId, dryRun);

    if (!dryRun && result.status === "scheduled") {
      logQueueEvent({
        event: "dlq_redrive",
        queueName: PHASE6_QUEUE_NAME,
        jobType: entry.envelope.jobType,
        jobId: String(entry.envelope.payload.jobId || "unknown"),
        correlation: entry.envelope.correlation,
      });
    }

    return result;
  }

  /**
   * Get DLQ store count.
   */
  getDlqCount(): number {
    return this.dlqStore.count();
  }

  /**
   * Get DLQ count by job type.
   */
  getDlqCountByJobType(): Record<Phase6JobType, number> {
    return this.dlqStore.countByJobType();
  }

  private async enqueue(name: string, payload: Phase6JobPayload): Promise<Job<Phase6JobPayload>> {
    const queue = this.requireQueue();
    const retryPolicy = resolveQueueRetryPolicy(payload.type);

    const job = await queue.add(name, payload, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: retryPolicy.maxAttempts,
      backoff: toBullMqBackoff(retryPolicy),
      timestamp: Date.now(),
    });

    logQueueEvent({
      event: "job_created",
      queueName: PHASE6_QUEUE_NAME,
      jobType: payload.type,
      jobId: String(job.id),
      maxAttempts: retryPolicy.maxAttempts,
      correlation: extractCorrelation(payload),
    });

    return job;
  }

  private attachObservers(): void {
    if (!this.queueEvents || !this.queue) {
      return;
    }

    this.queueEvents.on("active", async ({ jobId }) => {
      const job = await this.queue?.getJob(jobId);
      if (!job || !isKnownJobType(job.name)) {
        return;
      }

      logQueueEvent({
        event: "job_started",
        queueName: PHASE6_QUEUE_NAME,
        jobType: job.name,
        jobId: String(job.id),
        attemptsMade: job.attemptsMade,
        correlation: extractCorrelation(job.data),
      });
    });

    this.queueEvents.on("completed", async ({ jobId }) => {
      const job = await this.queue?.getJob(jobId);
      if (!job || !isKnownJobType(job.name)) {
        return;
      }

      const durationMs = computeDurationMs(job);
      this.metrics.recordSuccess({
        queueName: PHASE6_QUEUE_NAME,
        jobType: job.name,
        durationMs,
        attemptsMade: job.attemptsMade,
      });

      logQueueEvent({
        event: "job_completed",
        queueName: PHASE6_QUEUE_NAME,
        jobType: job.name,
        jobId: String(job.id),
        attemptsMade: job.attemptsMade,
        durationMs,
        correlation: extractCorrelation(job.data),
      });
    });

    this.queueEvents.on("failed", async ({ jobId, failedReason }) => {
      const job = await this.queue?.getJob(jobId);
      if (!job || !isKnownJobType(job.name)) {
        return;
      }

      const maxAttempts = job.opts.attempts ?? resolveQueueRetryPolicy(job.name).maxAttempts;
      const retryPending = job.attemptsMade < maxAttempts;
      const correlation = extractCorrelation(job.data);

      this.metrics.recordFailure({
        queueName: PHASE6_QUEUE_NAME,
        jobType: job.name,
        attemptsMade: job.attemptsMade,
        error: failedReason,
        correlation,
      });

      if (retryPending) {
        this.metrics.recordRetry({
          queueName: PHASE6_QUEUE_NAME,
          jobType: job.name,
        });

        logQueueEvent({
          event: "job_retry",
          queueName: PHASE6_QUEUE_NAME,
          jobType: job.name,
          jobId: String(job.id),
          attemptsMade: job.attemptsMade,
          maxAttempts,
          error: failedReason,
          correlation,
        });
        return;
      }

      await this.moveToDlq(job, failedReason);

      this.metrics.recordDlq({
        queueName: PHASE6_QUEUE_NAME,
        jobType: job.name,
      });

      logQueueEvent({
        event: "job_dlq",
        queueName: PHASE6_QUEUE_NAME,
        jobType: job.name,
        jobId: String(job.id),
        attemptsMade: job.attemptsMade,
        maxAttempts,
        error: failedReason,
        correlation,
      });
    });
  }

  private async moveToDlq(job: Job<Phase6JobPayload>, failedReason: string): Promise<void> {
    if (!this.dlq || !isKnownJobType(job.name)) {
      return;
    }

    const dlqJobId = `dlq:${String(job.id)}`;
    const existing = await this.dlq.getJob(dlqJobId);
    if (existing) {
      return;
    }

    const maxAttempts = job.opts.attempts ?? resolveQueueRetryPolicy(job.name).maxAttempts;
    const envelope: Phase6DlqEnvelope = {
      payload: job.data,
      jobType: job.name,
      queueName: PHASE6_QUEUE_NAME,
      attempts: job.attemptsMade,
      maxAttempts,
      createdAt: toIso(job.timestamp) ?? new Date().toISOString(),
      failedAt: toIso(job.finishedOn) ?? new Date().toISOString(),
      error: failedReason,
      correlation: extractCorrelation(job.data),
    };

    const dlqPayload: Phase6DlqPayload = {
      type: "dlq-envelope",
      envelope,
    };

    // Add to in-memory DLQ store for inspection/redrive endpoints
    this.dlqStore.add(dlqJobId, envelope);

    await this.dlq.add("dlq-envelope", dlqPayload, {
      jobId: dlqJobId,
      removeOnComplete: false,
      removeOnFail: false,
    });

    logQueueEvent({
      event: "job_failed",
      queueName: PHASE6_QUEUE_NAME,
      jobType: job.name,
      jobId: String(job.id),
      attemptsMade: job.attemptsMade,
      maxAttempts,
      error: failedReason,
      correlation: extractCorrelation(job.data),
    });
  }

  private requireQueue(): Queue<Phase6JobPayload> {
    if (!this.queue) {
      throw new ApiRequestError(
        "Async job queue is not configured. Set REDIS_URL or REDIS_HOST/PORT.",
        503
      );
    }

    return this.queue;
  }

  private createQueue(): Queue<Phase6JobPayload> | null {
    const connection = resolveQueueConnection();
    if (!connection) {
      return null;
    }

    return new Queue<Phase6JobPayload>(PHASE6_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    });
  }

  private createDlq(): Queue<Phase6DlqPayload> | null {
    const connection = resolveQueueConnection();
    if (!connection) {
      return null;
    }
    return new Queue<Phase6DlqPayload>(PHASE6_DLQ_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  private createQueueEvents(): QueueEvents | null {
    const connection = resolveQueueConnection();
    if (!connection) {
      return null;
    }

    return new QueueEvents(PHASE6_QUEUE_NAME, { connection });
  }
}

function toIso(value: number | undefined): string | undefined {
  if (!Number.isFinite(value)) {
    return undefined;
  }

  return new Date(value as number).toISOString();
}

function toEnqueuedJobResponse(job: Job<Phase6JobPayload>): EnqueuedJobResponse {
  return {
    jobId: String(job.id),
    name: job.name,
    status: "waiting",
    queuedAt: new Date(job.timestamp).toISOString(),
  };
}

function normalizeState(
  state: string
): "waiting" | "active" | "completed" | "failed" | "delayed" | "paused" | "unknown" {
  if (
    state === "waiting" ||
    state === "active" ||
    state === "completed" ||
    state === "failed" ||
    state === "delayed" ||
    state === "paused"
  ) {
    return state;
  }

  return "unknown";
}

function isKnownJobType(value: string): value is Phase6JobType {
  return value === "phase5-experiment" || value === "model-benchmark";
}

function computeDurationMs(job: Job<Phase6JobPayload>): number {
  if (!Number.isFinite(job.processedOn) || !Number.isFinite(job.finishedOn)) {
    return 0;
  }

  return Math.max(0, (job.finishedOn as number) - (job.processedOn as number));
}

function extractCorrelation(payload: Phase6JobPayload): JobCorrelationIds {
  return {
    requestId: payload.requestId,
    jobId: payload.jobId,
    sessionId: payload.sessionId,
    tenantId: payload.tenantId,
    userId: payload.userId,
    indexId: payload.indexId,
  };
}
