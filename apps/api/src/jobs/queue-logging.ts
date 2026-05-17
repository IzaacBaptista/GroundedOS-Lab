import type { JobCorrelationIds, Phase6JobType } from "./job-queue";
import { TraceStore } from "../observability/trace-store";

export type QueueLifecycleEvent =
  | "job_created"
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "job_retry"
  | "job_dlq"
  | "dlq_redrive";

export interface QueueLogPayload {
  queueName: string;
  jobType: Phase6JobType;
  event: QueueLifecycleEvent;
  jobId?: string;
  attemptsMade?: number;
  maxAttempts?: number;
  durationMs?: number;
  error?: string;
  correlation?: JobCorrelationIds;
}

const traceStore = new TraceStore();

export function logQueueEvent(payload: QueueLogPayload): void {
  const status: "error" | "started" | "success" =
    payload.event === "job_failed" || payload.event === "job_dlq"
      ? "error"
      : payload.event === "job_retry"
        ? "started"
        : "success";

  const entry = {
    timestamp: new Date().toISOString(),
    component: "job",
    operation: payload.event,
    status,
    requestId: payload.correlation?.requestId,
    traceId: payload.correlation?.traceId,
    ...payload,
  };

  const logger = payload.event === "job_failed" ? console.error : console.log;
  logger(JSON.stringify(entry));

  void traceStore.append({
    version: "v1",
    timestamp: entry.timestamp,
    component: "job",
    operation: payload.event,
    status,
    durationMs: payload.durationMs,
    correlation: payload.correlation ?? {},
    metadata: {
      queueName: payload.queueName,
      jobType: payload.jobType,
      maxAttempts: payload.maxAttempts,
      attemptsMade: payload.attemptsMade,
      retries: payload.event === "job_retry" ? 1 : 0,
    },
    ...(payload.error ? { error: { message: payload.error } } : {}),
  });
}
