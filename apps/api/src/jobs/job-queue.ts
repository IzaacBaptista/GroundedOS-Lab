import type { ConnectionOptions } from "bullmq";

export const PHASE6_QUEUE_NAME = "groundedos-phase6-jobs";

export type Phase6JobType = "phase5-experiment" | "model-benchmark";

export type Phase5ExperimentTrack = "quantization" | "lora" | "fine-tuning" | "distillation";

export type Phase6JobPayload =
  | {
      type: "phase5-experiment";
      track: Phase5ExperimentTrack;
    }
  | {
      type: "model-benchmark";
      providers: string[];
    };

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
