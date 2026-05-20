import { describe, expect, it } from "vitest";
import type { BullMqRuntime, TestJob } from "./index";
import {
  createBullMqTestQueueAdapter,
  createTestQueue,
  createTestWorker,
  waitForJobState,
  waitForQueueDrain,
} from "./index";

type MockState = "waiting" | "active" | "completed" | "failed";

interface MockBullJob<T> {
  id: string;
  data: T;
  state: MockState;
  returnvalue?: unknown;
  failedReason?: string;
  getState(): Promise<MockState>;
}

function createMockBullMqRuntime<T = unknown>(): BullMqRuntime {
  const jobs = new Map<string, MockBullJob<T>>();
  let sequence = 0;
  let worker:
    | {
        processor: (job: { id: string | number | undefined; data: unknown }) => Promise<unknown>;
      }
    | undefined;

  const processWaiting = async (): Promise<void> => {
    if (!worker) {
      return;
    }
    for (const job of jobs.values()) {
      if (job.state !== "waiting") {
        continue;
      }
      job.state = "active";
      try {
        const result = await worker.processor({ id: job.id, data: job.data });
        job.returnvalue = result;
        job.state = "completed";
      } catch (error) {
        job.failedReason = error instanceof Error ? error.message : String(error);
        job.state = "failed";
      }
    }
  };

  return {
    createQueue() {
      return {
        async add(_name: string, data: unknown) {
          const id = String(++sequence);
          const job: MockBullJob<T> = {
            id,
            data: data as T,
            state: "waiting",
            async getState() {
              return job.state;
            },
          };
          jobs.set(id, job);
          await processWaiting();
          return { id };
        },
        async getJob(id: string) {
          const job = jobs.get(id);
          if (!job) {
            return null;
          }
          return {
            id: job.id,
            data: job.data,
            returnvalue: job.returnvalue,
            failedReason: job.failedReason,
            async getState() {
              return job.state;
            },
          };
        },
        async getJobCounts() {
          const values = [...jobs.values()];
          return {
            waiting: values.filter((job) => job.state === "waiting").length,
            active: values.filter((job) => job.state === "active").length,
            delayed: 0,
            paused: 0,
            prioritized: 0,
          };
        },
        async close() {},
      };
    },
    createWorker(_queueName, processor) {
      worker = {
        processor: async (job) =>
          await processor({
            id: job.id,
            data: job.data,
            getState: async () => "waiting",
          }),
      };
      void processWaiting();
      return {
        async close() {
          worker = undefined;
        },
      };
    },
  };
}

describe("jobs harness helpers", () => {
  it("processes jobs with in-memory adapter by default", async () => {
    const queue = createTestQueue<{ value: string }>("queue-a");
    await createTestWorker("queue-a", async (job) => `done:${job.data.value}`, queue.adapter);
    const job = await queue.add({ value: "x" });
    await waitForQueueDrain(queue);
    const completed = await waitForJobState(job, "completed");
    expect(completed.result).toBe("done:x");
  });

  it("enforces queue name invariant", () => {
    expect(() => createTestQueue("")).toThrow("queue name must be a non-empty string.");
  });

  it("refreshes state while waiting for transitions", async () => {
    let state: "waiting" | "completed" = "waiting";
    const job: TestJob<{ ok: boolean }> = {
      id: "job-1",
      data: { ok: true },
      state,
      refresh: async () => {
        state = "completed";
        job.state = state;
        return job;
      },
    };
    const result = await waitForJobState(job, "completed", 200);
    expect(result.state).toBe("completed");
  });

  it("runs BullMQ adapter through TestQueueAdapter contract", async () => {
    const adapter = createBullMqTestQueueAdapter<{ task: string }>({
      queueName: "bullmq-test",
      connection: { host: "127.0.0.1", port: 6379 },
      runtime: createMockBullMqRuntime<{ task: string }>(),
    });
    await adapter.process(async (job) => `processed:${job.data.task}`);
    const job = await adapter.enqueue({ task: "index" });
    const completed = await waitForJobState(job, "completed", 500);
    expect(completed.result).toBe("processed:index");
    await adapter.drain();
    await adapter.close();
  });

  it("captures worker errors in BullMQ adapter jobs", async () => {
    const adapter = createBullMqTestQueueAdapter<{ task: string }>({
      queueName: "bullmq-test-fail",
      connection: { host: "127.0.0.1", port: 6379 },
      runtime: createMockBullMqRuntime<{ task: string }>(),
    });
    await adapter.process(async () => {
      throw new Error("boom");
    });
    const job = await adapter.enqueue({ task: "index" });
    const failed = await waitForJobState(job, "failed", 500);
    expect(failed.error).toBe("boom");
    await adapter.close();
  });
});
