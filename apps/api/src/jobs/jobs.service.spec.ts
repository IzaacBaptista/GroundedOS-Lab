import Redis from "ioredis";
import { Queue } from "bullmq";
import { JobsService } from "./jobs.service";
import { PHASE6_QUEUE_NAME, PHASE6_DLQ_NAME } from "./job-queue";

/**
 * Integration tests for JobsService queue enqueue + status query flow
 * Validates: job creation via API → queue persistence → status retrieval
 * 
 * Note: These tests require a running Redis instance on localhost:6379
 * Set REDIS_URL env var to override the connection string.
 */
describe("JobsService Integration", () => {
  let jobsService: JobsService;
  let redis: Redis;
  let queue: Queue;

  const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

  beforeAll(async () => {
    redis = new Redis(REDIS_URL);
    queue = new Queue(PHASE6_QUEUE_NAME, { connection: redis });

    // Initialize JobsService with Redis connection
    jobsService = new JobsService();

    // Clean queues
    await queue.clean(0, 1000, "active");
    await queue.clean(0, 1000, "completed");
    await queue.clean(0, 1000, "failed");
  });

  afterAll(async () => {
    await queue.close();
    await redis.disconnect();
  });

  describe("Job Enqueueing", () => {
    it("should enqueue phase5-experiment job via jobsService", async () => {
      // This calls jobsService.enqueuePhase5Experiment which should:
      // 1. Inject _otel_context (if tracing active)
      // 2. Set retry config (5 attempts, exponential backoff)
      // 3. Add job to queue
      const response = await jobsService.enqueuePhase5Experiment("quantization");

      expect(response.jobId).toBeDefined();
      expect(response.status).toBe("waiting");

      // Verify job persisted in queue
      const fetchedJob = await queue.getJob(response.jobId);
      expect(fetchedJob).toBeDefined();
      expect(fetchedJob?.data.track).toBe("quantization");
    });

    it("should enqueue model-benchmark job with provider list", async () => {
      const response = await jobsService.enqueueModelBenchmark(["openai", "anthropic"]);

      expect(response.jobId).toBeDefined();

      const fetchedJob = await queue.getJob(response.jobId);
      expect(fetchedJob?.data.providers).toContain("anthropic");
    });

    it("should apply exponential retry policy for phase5 jobs", async () => {
      const response = await jobsService.enqueuePhase5Experiment("lora");

      expect(response.jobId).toBeDefined();
      const job = await queue.getJob(response.jobId);
      expect(job?.opts.attempts).toBe(5);
      expect(job?.opts.backoff).toMatchObject({ type: "exponential", delay: 2000 });
    });

    it("should apply fixed retry policy for model-benchmark jobs", async () => {
      const response = await jobsService.enqueueModelBenchmark(["openai"]);

      expect(response.jobId).toBeDefined();
      const job = await queue.getJob(response.jobId);
      expect(job?.opts.attempts).toBe(4);
      expect(job?.opts.backoff).toMatchObject({ type: "fixed", delay: 3000 });
    });

    it("should inject trace context if available", async () => {
      const response = await jobsService.enqueuePhase5Experiment("fine-tuning");
      const job = await queue.getJob(response.jobId);
      const data = job?.data;

      // _otel_context may or may not be present depending on active tracing
      // But if injected, it should be a valid W3C traceparent string
      if (data?._otel_context) {
        expect(data._otel_context).toMatch(/^00-[a-f0-9]{32}-[a-f0-9]{16}-[01]{2}$/);
      }
    });

    it("should preserve correlation IDs in job payload", async () => {
      const response = await jobsService.enqueuePhase5Experiment("quantization", {
        requestId: "req-123",
        sessionId: "sess-9",
        tenantId: "tenant-a",
        userId: "user-7",
        indexId: "idx-42",
      });

      const job = await queue.getJob(response.jobId);
      expect(job?.data.requestId).toBe("req-123");
      expect(job?.data.sessionId).toBe("sess-9");
      expect(job?.data.tenantId).toBe("tenant-a");
      expect(job?.data.userId).toBe("user-7");
      expect(job?.data.indexId).toBe("idx-42");
    });

    it("should reject empty provider list", async () => {
      await expect(jobsService.enqueueModelBenchmark([])).rejects.toThrow(
        "At least one provider is required"
      );
    });

    it("should reject null or undefined providers", async () => {
      await expect(jobsService.enqueueModelBenchmark(["", "  "])).rejects.toThrow(
        "At least one provider is required"
      );
    });
  });

  describe("Job Status Queries", () => {
    it("should retrieve job state via getJobStatus", async () => {
      const response = await jobsService.enqueuePhase5Experiment("fine-tuning");
      const jobId = response.jobId;

      // Query via service
      const statusResponse = await jobsService.getJobStatus(jobId);
      expect(statusResponse).toBeDefined();
      expect(statusResponse.jobId).toBe(jobId);
      expect(["waiting", "active", "completed", "failed", "delayed", "paused"]).toContain(
        statusResponse.status
      );
    });

    it("should return 404 for non-existent job", async () => {
      await expect(jobsService.getJobStatus("non-existent-job-id")).rejects.toThrow(
        "not found"
      );
    });

    it("should include job metadata in status response", async () => {
      const response = await jobsService.enqueuePhase5Experiment("distillation");
      const status = await jobsService.getJobStatus(response.jobId);

      expect(status.jobId).toBeDefined();
      expect(status.name).toBeDefined();
      expect(status.status).toBe("waiting");
      expect(status.attemptsMade).toBe(0);
      expect(status.queuedAt).toBeDefined();
    });
  });

  describe("DLQ Handling", () => {
    it("should access DLQ queue", async () => {
      const dlqQueue = new Queue(PHASE6_DLQ_NAME, { connection: redis });

      const dlqJobs = await dlqQueue.getJobs(["waiting", "failed"]);
      // DLQ may be empty initially
      expect(Array.isArray(dlqJobs)).toBe(true);

      await dlqQueue.close();
    });
  });

  describe("Job Data Persistence", () => {
    it("should persist phase5-experiment payload correctly", async () => {
      const response = await jobsService.enqueuePhase5Experiment("distillation");
      const job = await queue.getJob(response.jobId);
      const data = job?.data;

      expect(data?.type).toBe("phase5-experiment");
      expect(data?.track).toBe("distillation");
    });

    it("should persist model-benchmark payload correctly", async () => {
      const response = await jobsService.enqueueModelBenchmark(["gpt-4", "claude-3", "gemini-pro"]);
      const job = await queue.getJob(response.jobId);
      const data = job?.data;

      expect(data?.type).toBe("model-benchmark");
      expect(data?.providers).toEqual(["gpt-4", "claude-3", "gemini-pro"]);
    });
  });

  describe("Job Progress Tracking", () => {
    it("should update and retrieve job progress", async () => {
      const response = await jobsService.enqueuePhase5Experiment("quantization");
      const job = await queue.getJob(response.jobId);

      await job?.updateProgress(25);
      const job25 = await queue.getJob(response.jobId);
      expect(job25?.progress).toBe(25);

      await job?.updateProgress(75);
      const job75 = await queue.getJob(response.jobId);
      expect(job75?.progress).toBe(75);
    });
  });
});
