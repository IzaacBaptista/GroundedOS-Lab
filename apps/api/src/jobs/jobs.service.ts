import { Injectable } from "@nestjs/common";
import { Job, Queue } from "bullmq";
import { ApiRequestError } from "../errors";
import { getActiveTraceparent } from "../otel";
import {
  PHASE6_DLQ_NAME,
  PHASE6_QUEUE_NAME,
  type Phase5ExperimentTrack,
  type Phase6JobPayload,
  resolveQueueConnection,
} from "./job-queue";

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

  async enqueuePhase5Experiment(track: Phase5ExperimentTrack): Promise<EnqueuedJobResponse> {
    const job = await this.enqueue("phase5-experiment", {
      type: "phase5-experiment",
      track,
      _otel_context: getActiveTraceparent(),
    });

    return toEnqueuedJobResponse(job);
  }

  async enqueueModelBenchmark(providers: string[]): Promise<EnqueuedJobResponse> {
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
    });

    return toEnqueuedJobResponse(job);
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

  private async enqueue(name: string, payload: Phase6JobPayload): Promise<Job<Phase6JobPayload>> {
    const queue = this.requireQueue();
    return queue.add(name, payload, {
      removeOnComplete: 100,
      removeOnFail: 100,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
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

  private createDlq(): Queue<Phase6JobPayload> | null {
    const connection = resolveQueueConnection();
    if (!connection) {
      return null;
    }
    return new Queue<Phase6JobPayload>(PHASE6_DLQ_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
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
