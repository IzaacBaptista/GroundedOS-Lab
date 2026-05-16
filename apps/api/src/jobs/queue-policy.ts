import type { BackoffOptions } from "bullmq";
import type { Phase6JobType } from "./job-queue";

export type QueueBackoffType = "fixed" | "exponential";

export interface QueueBackoffPolicy {
  type: QueueBackoffType;
  delayMs: number;
}

export interface QueueRetryPolicy {
  maxAttempts: number;
  backoff: QueueBackoffPolicy;
}

const DEFAULT_RETRY_POLICIES: Record<Phase6JobType, QueueRetryPolicy> = {
  "phase5-experiment": {
    maxAttempts: 5,
    backoff: {
      type: "exponential",
      delayMs: 2000,
    },
  },
  "model-benchmark": {
    maxAttempts: 4,
    backoff: {
      type: "fixed",
      delayMs: 3000,
    },
  },
};

export function resolveQueueRetryPolicy(jobType: Phase6JobType): QueueRetryPolicy {
  const policy = DEFAULT_RETRY_POLICIES[jobType];
  return {
    maxAttempts: policy.maxAttempts,
    backoff: {
      type: policy.backoff.type,
      delayMs: policy.backoff.delayMs,
    },
  };
}

export function toBullMqBackoff(policy: QueueRetryPolicy): BackoffOptions {
  return {
    type: policy.backoff.type,
    delay: policy.backoff.delayMs,
  };
}

export function computeBackoffDelayMs(policy: QueueRetryPolicy, attemptNumber: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attemptNumber));

  if (policy.backoff.type === "fixed") {
    return policy.backoff.delayMs;
  }

  return policy.backoff.delayMs * 2 ** (normalizedAttempt - 1);
}
