import { exec } from "node:child_process";
import { promisify } from "node:util";
import { Worker } from "bullmq";
import {
  PHASE6_QUEUE_NAME,
  resolveQueueConnection,
  type Phase6JobPayload,
} from "./job-queue";

const execAsync = promisify(exec);

async function main(): Promise<void> {
  const connection = resolveQueueConnection();
  if (!connection) {
    throw new Error(
      "Queue worker requires REDIS_URL or REDIS_HOST/REDIS_PORT to be configured."
    );
  }

  const worker = new Worker<Phase6JobPayload>(
    PHASE6_QUEUE_NAME,
    async (job) => {
      if (job.name === "phase5-experiment" && job.data.type === "phase5-experiment") {
        return runShellCommand(`npm run experiment:${job.data.track}`);
      }

      if (job.name === "model-benchmark" && job.data.type === "model-benchmark") {
        const providers = job.data.providers.join(",");
        return runShellCommand(`npm run benchmark:models -- --providers ${providers}`);
      }

      throw new Error(`Unsupported job type: ${job.name}`);
    },
    {
      connection,
      concurrency: 1,
    }
  );

  worker.on("completed", (job) => {
    console.log(`[jobs-worker] completed ${job.id} (${job.name})`);
  });

  worker.on("failed", (job, error) => {
    console.error(`[jobs-worker] failed ${job?.id ?? "unknown"}:`, error.message);
  });

  console.log(`[jobs-worker] listening on queue ${PHASE6_QUEUE_NAME}`);
}

async function runShellCommand(command: string): Promise<{
  command: string;
  stdout: string;
  stderr: string;
}> {
  const { stdout, stderr } = await execAsync(command, {
    cwd: process.cwd(),
    env: process.env,
    maxBuffer: 1024 * 1024,
  });

  return {
    command,
    stdout,
    stderr,
  };
}

main().catch((error) => {
  console.error("[jobs-worker] fatal error:", error);
  process.exitCode = 1;
});
