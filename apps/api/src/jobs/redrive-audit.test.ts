import { describe, it, expect, beforeEach } from "vitest";
import { RedriveAuditStore } from "./redrive-audit";
import type { Phase6JobType } from "./job-queue";

describe("RedriveAuditStore", () => {
  let store: RedriveAuditStore;

  beforeEach(() => {
    store = new RedriveAuditStore();
  });

  it("should record re-drive attempts", () => {
    store.record({
      dlqJobId: "dlq:job-1",
      jobType: "phase5-experiment",
      redrivenAt: "2026-05-16T10:00:00Z",
      redrivenBy: "user-1",
      status: "scheduled",
    });

    const history = store.getHistory();
    expect(history.total).toBe(1);
    expect(history.successful).toBe(1);
    expect(history.failed).toBe(0);
  });

  it("should distinguish successful vs failed re-drives", () => {
    store.record({
      dlqJobId: "dlq:job-1",
      jobType: "phase5-experiment",
      redrivenAt: "2026-05-16T10:00:00Z",
      redrivenBy: "user-1",
      status: "scheduled",
      newJobId: "job-123",
    });

    store.record({
      dlqJobId: "dlq:job-2",
      jobType: "model-benchmark",
      redrivenAt: "2026-05-16T10:05:00Z",
      redrivenBy: "user-2",
      status: "failed",
      reason: "Queue not available",
    });

    store.record({
      dlqJobId: "dlq:job-3",
      jobType: "phase5-experiment",
      redrivenAt: "2026-05-16T10:10:00Z",
      redrivenBy: "user-3",
      status: "dry-run",
      reason: "Dry-run validation passed",
    });

    const history = store.getHistory();
    expect(history.total).toBe(3);
    expect(history.successful).toBe(1);
    expect(history.failed).toBe(1);
  });

  it("should filter history by job type", () => {
    store.record({
      dlqJobId: "dlq:job-1",
      jobType: "phase5-experiment",
      redrivenAt: "2026-05-16T10:00:00Z",
      redrivenBy: "user-1",
      status: "scheduled",
    });

    store.record({
      dlqJobId: "dlq:job-2",
      jobType: "phase5-experiment",
      redrivenAt: "2026-05-16T10:01:00Z",
      redrivenBy: "user-2",
      status: "scheduled",
    });

    store.record({
      dlqJobId: "dlq:job-3",
      jobType: "model-benchmark",
      redrivenAt: "2026-05-16T10:02:00Z",
      redrivenBy: "user-3",
      status: "scheduled",
    });

    const phase5History = store.getHistoryByJobType("phase5-experiment");
    expect(phase5History.total).toBe(2);

    const benchmarkHistory = store.getHistoryByJobType("model-benchmark");
    expect(benchmarkHistory.total).toBe(1);
  });

  it("should paginate history by job type", () => {
    for (let i = 0; i < 4; i++) {
      store.record({
        dlqJobId: `dlq:phase5-${i}`,
        jobType: "phase5-experiment",
        redrivenAt: `2026-05-16T10:1${i}:00Z`,
        status: "scheduled",
      });
    }

    const page1 = store.getHistoryByJobType("phase5-experiment", 2, 0);
    const page2 = store.getHistoryByJobType("phase5-experiment", 2, 2);

    expect(page1.total).toBe(4);
    expect(page1.entries).toHaveLength(2);
    expect(page2.entries).toHaveLength(2);
  });

  it("should support pagination", () => {
    for (let i = 0; i < 5; i++) {
      store.record({
        dlqJobId: `dlq:job-${i}`,
        jobType: "phase5-experiment",
        redrivenAt: `2026-05-16T10:0${i}:00Z`,
        redrivenBy: `user-${i}`,
        status: "scheduled",
      });
    }

    const page1 = store.getHistory(2, 0);
    const page2 = store.getHistory(2, 2);

    expect(page1.total).toBe(5);
    expect(page1.entries).toHaveLength(2);
    expect(page2.entries).toHaveLength(2);
  });

  it("should preserve newJobId on successful re-drive", () => {
    store.record({
      dlqJobId: "dlq:job-1",
      jobType: "phase5-experiment",
      redrivenAt: "2026-05-16T10:00:00Z",
      redrivenBy: "user-1",
      status: "scheduled",
      newJobId: "job-new-123",
    });

    const history = store.getHistory();
    const entry = history.entries[0];
    expect(entry.newJobId).toBe("job-new-123");
  });

  it("should get single re-drive entry by dlqJobId", () => {
    store.record({
      dlqJobId: "dlq:job-1",
      jobType: "phase5-experiment",
      redrivenAt: "2026-05-16T10:00:00Z",
      redrivenBy: "user-1",
      status: "scheduled",
    });

    const entry = store.getEntry("dlq:job-1");
    expect(entry).toBeDefined();
    expect(entry?.dlqJobId).toBe("dlq:job-1");
  });

  it("should return undefined for non-existent entry", () => {
    const entry = store.getEntry("dlq:nonexistent");
    expect(entry).toBeUndefined();
  });
});
