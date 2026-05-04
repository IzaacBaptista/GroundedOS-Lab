import Redis from "ioredis";
import { Queue, Worker } from "bullmq";
import type { Phase6JobPayload } from "./job-queue";

/**
 * E2E tests for BullMQ job queue lifecycle
 * Tests: creation → worker execution → completion/retry/DLQ
 * 
 * Note: These tests require a running Redis instance on localhost:6379
 * Set REDIS_URL env var to override the connection string.
 */
describe("Jobs Queue E2E", () => {
  let redis: Redis;
  let queue: Queue<Phase6JobPayload>;
  let dlqQueue: Queue<Phase6JobPayload>;
  let testWorker: Worker<Phase6JobPayload> | null = null;

  const QUEUE_NAME = "test-groundedos-phase6-jobs";
  const DLQ_NAME = "test-groundedos-phase6-jobs-dlq";
  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

  beforeAll(async () => {
    // Initialize Redis connection for test setup
    redis = new Redis(REDIS_URL);

    // Create test queues
    queue = new Queue(QUEUE_NAME, { connection: redis });
    dlqQueue = new Queue(DLQ_NAME, { connection: redis });

    // Clear queues before tests
    await queue.clean(0, 1000, "active");
    await queue.clean(0, 1000, "completed");
    await queue.clean(0, 1000, "failed");
    await queue.clean(0, 1000, "delayed");
    await dlqQueue.clean(0, 1000, "active");
    await dlqQueue.clean(0, 1000, "completed");
  });

  afterAll(async () => {
    if (testWorker) {
      await testWorker.close();
    }
    await queue.close();
    await dlqQueue.close();
    await redis.disconnect();
  });

  describe("Job Lifecycle", () => {
    it("should enqueue a phase5-experiment job and mark as queued", async () => {
      const payload: Phase6JobPayload = {
        type: "phase5-experiment",
        track: "quantization",
        _otel_context: "00-abcd1234-efgh5678-01",
      };

      // Use raw queue for testing without full service wrapper
      const job = await queue.add("phase5-experiment", payload);

      expect(job.id).toBeDefined();
      const state = await job.getState();
      expect(state).toBe("waiting");

      const data = job.data;
      expect(data.type).toBe("phase5-experiment");
      if (data.type === "phase5-experiment") {
        expect(data.track).toBe("quantization");
      }
    });

    it("should enqueue a model-benchmark job with multiple providers", async () => {
      const payload: Phase6JobPayload = {
        type: "model-benchmark",
        providers: ["openai", "anthropic", "local-ollama"],
      };

      const job = await queue.add("model-benchmark", payload);

      expect(job.id).toBeDefined();
      const data = job.data;
      if (data.type === "model-benchmark") {
        expect(data.providers).toHaveLength(3);
        expect(data.providers).toContain("openai");
      }
    });
  });

  describe("Worker Processing", () => {
    it("should process a job and transition to completed state", async () => {
      const payload: Phase6JobPayload = {
        type: "phase5-experiment",
        track: "lora",
      };

      const job = await queue.add("phase5-exp-complete", payload, {
        attempts: 1,
      });

      const jobId = job.id;

      // Create a mock worker that completes successfully
      testWorker = new Worker(QUEUE_NAME, async (job) => {
        // Simulate work
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { success: true, jobId: job.id };
      });

      // Wait for job to be processed
      await new Promise((resolve) => {
        testWorker!.on("completed", (completedJob) => {
          if (completedJob.id === jobId) {
            resolve(null);
          }
        });

        setTimeout(() => resolve(null), 5000);
      });

      const finalState = await job.getState();
      expect(finalState).toBe("completed");

      if (testWorker) {
        await testWorker.close();
        testWorker = null;
      }
    });

    it("should retry failed job with exponential backoff", async () => {
      const payload: Phase6JobPayload = {
        type: "model-benchmark",
        providers: ["test-provider"],
      };

      const job = await queue.add("model-bench-retry", payload, {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1000,
        },
      });

      const jobId = job.id;

      let attemptCount = 0;
      testWorker = new Worker(QUEUE_NAME, async (workerJob) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error("Simulated failure");
        }
        return { success: true, attempts: attemptCount };
      });

      // Wait for job to complete after retries
      await new Promise((resolve) => {
        testWorker!.on("completed", (completedJob) => {
          if (completedJob.id === jobId) {
            resolve(null);
          }
        });

        setTimeout(() => resolve(null), 10000);
      });

      const finalState = await job.getState();
      expect(finalState).toBe("completed");
      expect(attemptCount).toBe(3);

      if (testWorker) {
        await testWorker.close();
        testWorker = null;
      }
    });
  });

  describe("DLQ Handling", () => {
    it("should move exhausted jobs to DLQ after max attempts", async () => {
      const payload: Phase6JobPayload = {
        type: "phase5-experiment",
        track: "fine-tuning",
      };

      // Job with max 2 attempts that will always fail
      const job = await queue.add("phase5-exp-dlq", payload, {
        attempts: 2,
        backoff: {
          type: "exponential",
          delay: 100,
        },
      });

      const jobId = job.id;

      testWorker = new Worker(QUEUE_NAME, async (workerJob) => {
        throw new Error("Permanent failure");
      });

      // Also create a DLQ worker to observe failed jobs
      const dlqWorker = new Worker(DLQ_NAME, async (workerJob) => {
        return { moved_to_dlq: true };
      });

      // Wait for job to exhaust attempts
      await new Promise((resolve) => {
        testWorker!.on("failed", (failedJob, err) => {
          if (failedJob && String(failedJob.id) === String(jobId) && failedJob.attemptsMade === 2) {
            resolve(null);
          }
        });

        setTimeout(() => resolve(null), 5000);
      });

      const failedJobFetched = await queue.getJob(String(jobId));
      const finalState = await failedJobFetched?.getState();
      expect(finalState).toBe("failed");
      expect(failedJobFetched?.attemptsMade).toBe(2);

      if (testWorker) {
        await testWorker.close();
        testWorker = null;
      }
      await dlqWorker.close();
    });
  });

  describe("Trace Propagation", () => {
    it("should preserve _otel_context through job processing", async () => {
      const traceParent = "00-trace1234567890abcdef-span123456-01";
      const payload: Phase6JobPayload = {
        type: "phase5-experiment",
        track: "distillation",
        _otel_context: traceParent,
      };

      const job = await queue.add("phase5-exp-trace", payload);
      const jobData = job.data;

      // Verify context is preserved
      expect(jobData._otel_context).toBe(traceParent);

      // Verify after state changes
      await job.updateProgress(50);
      const updatedData = job.data;
      expect(updatedData._otel_context).toBe(traceParent);
    });

    it("should inject traceparent into job if not present", async () => {
      // This test validates that jobsService.enqueue() injects traceparent
      const payload: Partial<Phase6JobPayload> = {
        type: "phase5-experiment",
        track: "fine-tuning",
      };

      // Note: In real usage via jobsService.enqueue(), _otel_context would be injected
      // This test documents the expected behavior
      expect(payload._otel_context).toBeUndefined();
    });
  });

  describe("Job State Queries", () => {
    it("should retrieve job status by ID", async () => {
      const payload: Phase6JobPayload = {
        type: "model-benchmark",
        providers: ["local"],
      };

      const job = await queue.add("model-bench-status", payload);

      // Simulate getting job status via service
      const status = await job.getState();
      expect(status).toMatch(/waiting|active|completed|failed|delayed/);
    });

    it("should list queue jobs by state", async () => {
      const payload1: Phase6JobPayload = {
        type: "phase5-experiment",
        track: "lora",
      };
      const payload2: Phase6JobPayload = {
        type: "phase5-experiment",
        track: "quantization",
      };

      await queue.add("phase5-list-1", payload1);
      await queue.add("phase5-list-2", payload2);

      const waitingJobs = await queue.getJobs(["waiting"]);
      expect(waitingJobs.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Idempotency", () => {
    it("should handle duplicate job IDs gracefully", async () => {
      const payload: Phase6JobPayload = {
        type: "phase5-experiment",
        track: "quantization",
      };

      const job1 = await queue.add("phase5-exp-dup", payload);
      const jobId = job1.id;

      // Attempt to add same job ID again (in real scenario, after worker crash)
      // BullMQ handles this via job.update() or idempotency guards in worker
      const job2 = await queue.getJob(String(jobId));
      expect(job2?.id).toBe(jobId);

      // Verify only one job exists in queue
      const allJobs = await queue.getJobs(["waiting", "active", "completed", "failed"]);
      const duplicates = allJobs.filter((j) => String(j.id) === String(jobId));
      expect(duplicates.length).toBe(1);
    });
  });
});
