import { afterEach } from "vitest";

type JobState = "waiting" | "active" | "completed" | "failed";

export interface TestJob<T = unknown> {
  id: string;
  data: T;
  state: JobState;
  result?: unknown;
  error?: string;
}

export interface TestQueueAdapter<T = unknown> {
  enqueue(data: T): Promise<TestJob<T>>;
  process(handler: (job: TestJob<T>) => Promise<unknown>): Promise<void>;
  drain(): Promise<void>;
  close(): Promise<void>;
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

const managedAdapters: TestQueueAdapter[] = [];
let teardownRegistered = false;

export function createTestQueue<T = unknown>(_name = "test-queue", adapter?: TestQueueAdapter<T>) {
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
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (job.state === state) {
      return job;
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
