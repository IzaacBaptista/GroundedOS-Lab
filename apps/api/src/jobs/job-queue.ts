import type { ConnectionOptions } from "bullmq";

export const PHASE6_QUEUE_NAME = "groundedos-phase6-jobs";
export const PHASE6_DLQ_NAME = "groundedos-phase6-jobs-dlq";

export type Phase6JobType = "phase5-experiment" | "model-benchmark";

export type Phase5ExperimentTrack = "quantization" | "lora" | "fine-tuning" | "distillation";

export interface JobCorrelationIds {
  requestId?: string;
  traceId?: string;
  jobId?: string;
  sessionId?: string;
  tenantId?: string;
  userId?: string;
  indexId?: string;
  agentExecutionId?: string;
}

type BaseJobPayload = JobCorrelationIds & {
  /** W3C traceparent for OTel context propagation (see ADR-012). */
  _otel_context?: string;
};

export type Phase6JobPayload =
  | (BaseJobPayload & {
      type: "phase5-experiment";
      track: Phase5ExperimentTrack;
    })
  | (BaseJobPayload & {
      type: "model-benchmark";
      providers: string[];
    });

export interface Phase6DlqEnvelope {
  payload: Phase6JobPayload;
  jobType: Phase6JobType;
  queueName: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  failedAt: string;
  error: string;
  correlation: JobCorrelationIds;
}

export interface Phase6DlqPayload {
  type: "dlq-envelope";
  envelope: Phase6DlqEnvelope;
}

export function resolveQueueConnection(): ConnectionOptions | null {
  const explicitUrl = process.env.REDIS_URL?.trim();
  if (explicitUrl) {
    return {
      url: explicitUrl,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    };
  }

  const host = process.env.REDIS_HOST?.trim();
  if (!host) {
    return null;
  }

  const port = Number(process.env.REDIS_PORT ?? 6379);
  const password = process.env.REDIS_PASSWORD?.trim();

  return {
    host,
    port: Number.isFinite(port) && port > 0 ? port : 6379,
    password: password && password.length > 0 ? password : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
