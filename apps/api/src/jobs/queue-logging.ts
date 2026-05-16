import type { JobCorrelationIds, Phase6JobType } from "./job-queue";

export type QueueLifecycleEvent =
  | "job_created"
  | "job_started"
  | "job_completed"
  | "job_failed"
  | "job_retry"
  | "job_dlq";

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

export function logQueueEvent(payload: QueueLogPayload): void {
  const entry = {
    ts: new Date().toISOString(),
    source: "jobs",
    ...payload,
  };

  const logger = payload.event === "job_failed" ? console.error : console.log;
  logger(JSON.stringify(entry));
}
