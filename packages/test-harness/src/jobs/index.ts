import { afterEach } from "vitest";
import { Queue, Worker, type ConnectionOptions, type JobsOptions, type WorkerOptions } from "bullmq";

export type JobState = "waiting" | "active" | "completed" | "failed" | "delayed" | "paused";

export interface TestJob<T = unknown> {
  id: string;
  data: T;
  state: JobState;
  result?: unknown;
  error?: string;
  refresh?: () => Promise<TestJob<T>>;
}

export interface TestQueueAdapter<T = unknown> {
  enqueue(data: T): Promise<TestJob<T>>;
  process(handler: (job: TestJob<T>) => Promise<unknown>): Promise<void>;
  drain(): Promise<void>;
  close(): Promise<void>;
}

export interface BullMqTestQueueAdapterOptions {
  queueName: string;
  connection: ConnectionOptions;
  defaultJobOptions?: JobsOptions;
  workerOptions?: Omit<WorkerOptions, "connection">;
  runtime?: BullMqRuntime;
}

interface BullMqJobLike {
  id?: string | number;
  data: unknown;
  returnvalue?: unknown;
  failedReason?: string;
  getState(): Promise<string>;
}

interface BullMqQueueLike {
  add(name: string, data: unknown, opts?: JobsOptions): Promise<{ id?: string | number }>;
  getJob(id: string): Promise<BullMqJobLike | null>;
  getJobCounts(
    ...types: Array<"waiting" | "active" | "delayed" | "paused" | "prioritized">
  ): Promise<Record<string, number>>;
  close(): Promise<void>;
}

interface BullMqWorkerLike {
  close(): Promise<void>;
}

export interface BullMqRuntime {
  createQueue(queueName: string, connection: ConnectionOptions): BullMqQueueLike;
  createWorker<T>(
    queueName: string,
    processor: (job: BullMqJobLike) => Promise<unknown>,
    connection: ConnectionOptions,
    workerOptions?: Omit<WorkerOptions, "connection">
  ): BullMqWorkerLike;
}

class InMemoryQueueAdapter<T = unknown> implements TestQueueAdapter<T> {
  private readonly jobs: Array<TestJob<T>> = [];
  private worker?: (job: TestJob<T>) => Promise<unknown>;

  async enqueue(data: T): Promise<TestJob<T>> {
    const job: TestJob<T> = {
      id: `${Date.now()}-${this.jobs.length + 1}`,
      data,
      state: "waiting",
    };
    this.jobs.push(job);
    await this.maybeProcess(job);
    return job;
  }

  async process(handler: (job: TestJob<T>) => Promise<unknown>): Promise<void> {
    this.worker = handler;
    await Promise.all(this.jobs.map(async (job) => await this.maybeProcess(job)));
  }

  async drain(): Promise<void> {
    await Promise.all(this.jobs.map(async (job) => await this.maybeProcess(job)));
  }

  async close(): Promise<void> {
    this.jobs.splice(0);
    this.worker = undefined;
  }

  private async maybeProcess(job: TestJob<T>): Promise<void> {
    if (!this.worker || job.state !== "waiting") {
      return;
    }

    job.state = "active";
    try {
      job.result = await this.worker(job);
      job.state = "completed";
    } catch (error) {
      job.state = "failed";
      job.error = error instanceof Error ? error.message : String(error);
    }
  }
}

class BullMqQueueAdapter<T = unknown> implements TestQueueAdapter<T> {
  private readonly queue: BullMqQueueLike;
  private readonly queueName: string;
  private readonly connection: ConnectionOptions;
  private readonly defaultJobOptions?: JobsOptions;
  private readonly workerOptions?: Omit<WorkerOptions, "connection">;
  private readonly runtime: BullMqRuntime;
  private worker?: BullMqWorkerLike;
  private closed = false;
  private readonly trackedJobs = new Map<string, TestJob<T>>();

  constructor(options: BullMqTestQueueAdapterOptions) {
    assertNonEmptyString(options.queueName, "queueName");
    this.queueName = options.queueName;
    this.connection = options.connection;
    this.defaultJobOptions = options.defaultJobOptions;
    this.workerOptions = options.workerOptions;
    this.runtime = options.runtime ?? defaultBullMqRuntime;
    this.queue = this.runtime.createQueue(this.queueName, this.connection);
  }

  async enqueue(data: T): Promise<TestJob<T>> {
    this.assertOpen();
    const queued = await this.queue.add(this.queueName, data as unknown, this.defaultJobOptions);
    if (queued.id === undefined || queued.id === null || queued.id === "") {
      throw new Error("BullMQ adapter received an enqueue result without job id.");
    }
    const job = await this.mapBullMqJob(String(queued.id), data);
    this.trackedJobs.set(job.id, job);
    return job;
  }

  async process(handler: (job: TestJob<T>) => Promise<unknown>): Promise<void> {
    this.assertOpen();
    if (this.worker) {
      throw new Error("BullMQ test adapter already has an active worker.");
    }

    this.worker = this.runtime.createWorker<T>(
      this.queueName,
      async (bullJob) => {
        const id = String(bullJob.id ?? "");
        if (id.length === 0) {
          throw new Error("BullMQ worker received a job without id.");
        }
        const tracked = this.trackedJobs.get(id) ?? this.createTrackedJob(id, bullJob.data as T);
        tracked.state = "active";
        tracked.error = undefined;
        try {
          const result = await handler(tracked);
          tracked.result = result;
          tracked.state = "completed";
          return result;
        } catch (error) {
          tracked.state = "failed";
          tracked.error = error instanceof Error ? error.message : String(error);
          throw error;
        }
      },
      this.connection,
      this.workerOptions
    );
  }

  async drain(): Promise<void> {
    this.assertOpen();
    const start = Date.now();
    while (Date.now() - start < 5_000) {
      const counts = await this.queue.getJobCounts(
        "waiting",
        "active",
        "delayed",
        "paused",
        "prioritized"
      );
      if (
        (counts.waiting ?? 0) === 0 &&
        (counts.active ?? 0) === 0 &&
        (counts.delayed ?? 0) === 0 &&
        (counts.paused ?? 0) === 0 &&
        (counts.prioritized ?? 0) === 0
      ) {
        return;
      }
      await sleep(10);
    }
    throw new Error(`Timed out draining BullMQ queue "${this.queueName}".`);
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.trackedJobs.clear();
    if (this.worker) {
      await this.worker.close();
      this.worker = undefined;
    }
    await this.queue.close();
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new Error("BullMQ test adapter is already closed.");
    }
  }

  private async mapBullMqJob(id: string, data: T): Promise<TestJob<T>> {
    const job = this.createTrackedJob(id, data);
    const latest = await this.loadLatest(id);
    if (latest) {
      this.applySnapshot(job, latest);
    }
    return job;
  }

  private createTrackedJob(id: string, data: T): TestJob<T> {
    const tracked: TestJob<T> = {
      id,
      data,
      state: "waiting",
      refresh: async () => {
        const latest = await this.loadLatest(id);
        if (latest) {
          this.applySnapshot(tracked, latest);
        }
        return tracked;
      },
    };
    this.trackedJobs.set(id, tracked);
    return tracked;
  }

  private async loadLatest(id: string): Promise<TestJob<T> | null> {
    const latest = await this.queue.getJob(id);
    if (!latest) {
      return null;
    }
    return {
      id,
      data: latest.data as T,
      state: normalizeBullMqState(await latest.getState()),
      result: latest.returnvalue,
      error: latest.failedReason ?? undefined,
    };
  }

  private applySnapshot(target: TestJob<T>, latest: TestJob<T>): void {
    target.data = latest.data;
    target.state = latest.state;
    target.result = latest.result;
    target.error = latest.error;
  }
}

const managedAdapters: TestQueueAdapter[] = [];
let teardownRegistered = false;

const defaultBullMqRuntime: BullMqRuntime = {
  createQueue(queueName: string, connection: ConnectionOptions) {
    const queue = new Queue<unknown, unknown, string>(queueName, { connection });
    return {
      add: async (name: string, data: unknown, opts?: JobsOptions) => await queue.add(name, data, opts),
      getJob: async (id: string) => {
        const job = await queue.getJob(id);
        return job ?? null;
      },
      getJobCounts: async (
        ...types: Array<"waiting" | "active" | "delayed" | "paused" | "prioritized">
      ) => await queue.getJobCounts(...types),
      close: async () => await queue.close(),
    };
  },
  createWorker(
    queueName: string,
    processor: (job: BullMqJobLike) => Promise<unknown>,
    connection: ConnectionOptions,
    workerOptions?: Omit<WorkerOptions, "connection">
  ) {
    return new Worker<unknown, unknown, string>(queueName, async (job) => {
      return await processor({
        id: job.id,
        data: job.data,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        getState: async () => await job.getState(),
      });
    }, {
      connection,
      ...workerOptions,
    });
  },
};

export function createBullMqTestQueueAdapter<T = unknown>(
  options: BullMqTestQueueAdapterOptions
): TestQueueAdapter<T> {
  return new BullMqQueueAdapter<T>(options);
}

export function createTestQueue<T = unknown>(name = "test-queue", adapter?: TestQueueAdapter<T>) {
  assertNonEmptyString(name, "queue name");
  registerTeardown();
  const queueAdapter = adapter ?? new InMemoryQueueAdapter<T>();
  managedAdapters.push(queueAdapter as TestQueueAdapter);
  return {
    adapter: queueAdapter,
    add: async (data: T) => await queueAdapter.enqueue(data),
    close: async () => await queueAdapter.close(),
  };
}

export async function createTestWorker<T = unknown>(
  queueName: string,
  handler: (job: TestJob<T>) => Promise<unknown>,
  adapter?: TestQueueAdapter<T>
): Promise<{ queueName: string; close: () => Promise<void> }> {
  const queue = createTestQueue<T>(queueName, adapter);
  await queue.adapter.process(handler);
  return {
    queueName,
    close: async () => await queue.close(),
  };
}

export async function waitForJobState<T = unknown>(
  job: TestJob<T>,
  state: JobState,
  timeoutMs = 3_000
): Promise<TestJob<T>> {
  let observed = job;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (observed.state === state) {
      return observed;
    }
    if (observed.refresh) {
      observed = await observed.refresh();
      if (observed.state === state) {
        return observed;
      }
    }
    await sleep(10);
  }
  throw new Error(`Timed out waiting for job ${job.id} to reach state ${state}.`);
}

export async function waitForQueueDrain(queue: { adapter: TestQueueAdapter }): Promise<void> {
  await queue.adapter.drain();
}

function registerTeardown(): void {
  if (teardownRegistered) {
    return;
  }
  teardownRegistered = true;
  afterEach(async () => {
    await Promise.all(managedAdapters.splice(0).map(async (adapter) => await adapter.close()));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function assertNonEmptyString(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function normalizeBullMqState(state: string): JobState {
  if (
    state === "waiting" ||
    state === "active" ||
    state === "completed" ||
    state === "failed" ||
    state === "delayed" ||
    state === "paused"
  ) {
    return state;
  }

  return "waiting";
}
