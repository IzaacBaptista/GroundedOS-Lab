import { describe, expect, it } from "vitest";
import {
  computeBackoffDelayMs,
  resolveQueueRetryPolicy,
  toBullMqBackoff,
} from "./queue-policy";

describe("queue-policy", () => {
  it("resolves policy per job type", () => {
    const phase5 = resolveQueueRetryPolicy("phase5-experiment");
    const benchmark = resolveQueueRetryPolicy("model-benchmark");

    expect(phase5.maxAttempts).toBe(5);
    expect(phase5.backoff.type).toBe("exponential");

    expect(benchmark.maxAttempts).toBe(4);
    expect(benchmark.backoff.type).toBe("fixed");
  });

  it("computes fixed backoff deterministically", () => {
    const policy = resolveQueueRetryPolicy("model-benchmark");

    expect(computeBackoffDelayMs(policy, 1)).toBe(3000);
    expect(computeBackoffDelayMs(policy, 3)).toBe(3000);
  });

  it("computes exponential backoff deterministically", () => {
    const policy = resolveQueueRetryPolicy("phase5-experiment");

    expect(computeBackoffDelayMs(policy, 1)).toBe(2000);
    expect(computeBackoffDelayMs(policy, 2)).toBe(4000);
    expect(computeBackoffDelayMs(policy, 3)).toBe(8000);
  });

  it("converts policy to BullMQ backoff shape", () => {
    const policy = resolveQueueRetryPolicy("phase5-experiment");
    expect(toBullMqBackoff(policy)).toEqual({
      type: "exponential",
      delay: 2000,
    });
  });
});
