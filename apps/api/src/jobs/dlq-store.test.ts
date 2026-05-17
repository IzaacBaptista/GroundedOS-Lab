import { describe, it, expect, beforeEach } from "vitest";
import { DlqStore, type DlqInspectionResult } from "./dlq-store";
import type { Phase6DlqEnvelope } from "./job-queue";

describe("DlqStore", () => {
  let store: DlqStore;

  beforeEach(() => {
    store = new DlqStore();
  });

  it("should add and retrieve DLQ entries", () => {
    const envelope: Phase6DlqEnvelope = {
      payload: {
        type: "phase5-experiment",
        track: "quantization",
        requestId: "req-1",
      },
      jobType: "phase5-experiment",
      queueName: "groundedos-phase6-jobs",
      attempts: 5,
      maxAttempts: 5,
      createdAt: "2026-05-16T10:00:00Z",
      failedAt: "2026-05-16T10:05:00Z",
      error: "Test error",
      correlation: { requestId: "req-1" },
    };

    store.add("dlq:job-123", envelope);
    const result = store.get("dlq:job-123");

    expect(result).not.toBeNull();
    expect(result?.dlqJobId).toBe("dlq:job-123");
    expect(result?.envelope.jobType).toBe("phase5-experiment");
    expect(result?.envelope.correlation.requestId).toBe("req-1");
  });

  it("should return null for non-existent entries", () => {
    const result = store.get("dlq:nonexistent");
    expect(result).toBeNull();
  });

  it("should list all DLQ entries", () => {
    const envelope1: Phase6DlqEnvelope = {
      payload: {
        type: "phase5-experiment",
        track: "quantization",
      },
      jobType: "phase5-experiment",
      queueName: "groundedos-phase6-jobs",
      attempts: 5,
      maxAttempts: 5,
      createdAt: "2026-05-16T10:00:00Z",
      failedAt: "2026-05-16T10:05:00Z",
      error: "Error 1",
      correlation: {},
    };

    const envelope2: Phase6DlqEnvelope = {
      payload: {
        type: "model-benchmark",
        providers: ["gpt-4"],
      },
      jobType: "model-benchmark",
      queueName: "groundedos-phase6-jobs",
      attempts: 3,
      maxAttempts: 4,
      createdAt: "2026-05-16T10:01:00Z",
      failedAt: "2026-05-16T10:04:00Z",
      error: "Error 2",
      correlation: {},
    };

    store.add("dlq:job-1", envelope1);
    store.add("dlq:job-2", envelope2);

    const list = store.list();
    expect(list).toHaveLength(2);
  });

  it("should filter DLQ entries by job type", () => {
    const env1: Phase6DlqEnvelope = {
      payload: { type: "phase5-experiment", track: "quantization" },
      jobType: "phase5-experiment",
      queueName: "groundedos-phase6-jobs",
      attempts: 5,
      maxAttempts: 5,
      createdAt: "2026-05-16T10:00:00Z",
      failedAt: "2026-05-16T10:05:00Z",
      error: "Error 1",
      correlation: {},
    };

    const env2: Phase6DlqEnvelope = {
      payload: { type: "model-benchmark", providers: ["gpt-4"] },
      jobType: "model-benchmark",
      queueName: "groundedos-phase6-jobs",
      attempts: 3,
      maxAttempts: 4,
      createdAt: "2026-05-16T10:01:00Z",
      failedAt: "2026-05-16T10:04:00Z",
      error: "Error 2",
      correlation: {},
    };

    store.add("dlq:job-1", env1);
    store.add("dlq:job-2", env2);

    const filtered = store.list({ jobType: "phase5-experiment" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].envelope.jobType).toBe("phase5-experiment");
  });

  it("should support pagination", () => {
    for (let i = 0; i < 5; i++) {
      const envelope: Phase6DlqEnvelope = {
        payload: { type: "phase5-experiment", track: "quantization" },
        jobType: "phase5-experiment",
        queueName: "groundedos-phase6-jobs",
        attempts: i + 1,
        maxAttempts: 5,
        createdAt: `2026-05-16T10:0${i}:00Z`,
        failedAt: `2026-05-16T10:0${i + 1}:00Z`,
        error: `Error ${i}`,
        correlation: {},
      };
      store.add(`dlq:job-${i}`, envelope);
    }

    const page1 = store.list({ limit: 2, offset: 0 });
    const page2 = store.list({ limit: 2, offset: 2 });

    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
  });

  it("should support dry-run redrive", () => {
    const envelope: Phase6DlqEnvelope = {
      payload: { type: "phase5-experiment", track: "quantization" },
      jobType: "phase5-experiment",
      queueName: "groundedos-phase6-jobs",
      attempts: 5,
      maxAttempts: 5,
      createdAt: "2026-05-16T10:00:00Z",
      failedAt: "2026-05-16T10:05:00Z",
      error: "Test error",
      correlation: {},
    };

    store.add("dlq:job-123", envelope);

    // Dry-run should not remove the entry
    const dryResult = store.redrive("dlq:job-123", true);
    expect(dryResult.dryRun).toBe(true);
    expect(dryResult.status).toBe("skipped");
    expect(store.get("dlq:job-123")).not.toBeNull();

    // Real redrive should remove it
    const realResult = store.redrive("dlq:job-123", false);
    expect(realResult.dryRun).toBe(false);
    expect(realResult.status).toBe("scheduled");
    expect(store.get("dlq:job-123")).toBeNull();
  });

  it("should return error on redrive of non-existent entry", () => {
    const result = store.redrive("dlq:nonexistent", false);
    expect(result.status).toBe("skipped");
    expect(result.reason).toContain("not found");
  });

  it("should count DLQ entries", () => {
    const envelope: Phase6DlqEnvelope = {
      payload: { type: "phase5-experiment", track: "quantization" },
      jobType: "phase5-experiment",
      queueName: "groundedos-phase6-jobs",
      attempts: 5,
      maxAttempts: 5,
      createdAt: "2026-05-16T10:00:00Z",
      failedAt: "2026-05-16T10:05:00Z",
      error: "Test error",
      correlation: {},
    };

    store.add("dlq:job-1", envelope);
    store.add("dlq:job-2", envelope);

    expect(store.count()).toBe(2);
  });

  it("should count DLQ entries by job type", () => {
    const env1: Phase6DlqEnvelope = {
      payload: { type: "phase5-experiment", track: "quantization" },
      jobType: "phase5-experiment",
      queueName: "groundedos-phase6-jobs",
      attempts: 5,
      maxAttempts: 5,
      createdAt: "2026-05-16T10:00:00Z",
      failedAt: "2026-05-16T10:05:00Z",
      error: "Error 1",
      correlation: {},
    };

    const env2: Phase6DlqEnvelope = {
      payload: { type: "model-benchmark", providers: ["gpt-4"] },
      jobType: "model-benchmark",
      queueName: "groundedos-phase6-jobs",
      attempts: 3,
      maxAttempts: 4,
      createdAt: "2026-05-16T10:01:00Z",
      failedAt: "2026-05-16T10:04:00Z",
      error: "Error 2",
      correlation: {},
    };

    store.add("dlq:job-1", env1);
    store.add("dlq:job-2", env1);
    store.add("dlq:job-3", env2);

    const counts = store.countByJobType();
    expect(counts["phase5-experiment"]).toBe(2);
    expect(counts["model-benchmark"]).toBe(1);
  });
});
