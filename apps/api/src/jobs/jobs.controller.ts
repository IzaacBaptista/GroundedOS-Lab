import { Body, Controller, Get, Inject, Param, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { getRequestUserId } from "../common/auth-context";
import { ApiRequestError } from "../errors";
import { JobsService, type EnqueuedJobResponse, type JobStatusResponse } from "./jobs.service";
import type { Phase5ExperimentTrack } from "./job-queue";

type EnqueuePhase5Request = {
  track?: unknown;
  requestId?: unknown;
  jobId?: unknown;
  sessionId?: unknown;
  tenantId?: unknown;
  userId?: unknown;
  indexId?: unknown;
};

type EnqueueModelBenchmarkRequest = {
  providers?: unknown;
  requestId?: unknown;
  jobId?: unknown;
  sessionId?: unknown;
  tenantId?: unknown;
  userId?: unknown;
  indexId?: unknown;
};

@Controller("jobs")
export class JobsController {
  constructor(@Inject(JobsService) private readonly jobs: JobsService) {}

  @Post("phase5")
  enqueuePhase5(
    @Body() body: EnqueuePhase5Request,
    @Req() request: FastifyRequest
  ): Promise<EnqueuedJobResponse> {
    const track = normalizeTrack(body.track);
    return this.jobs.enqueuePhase5Experiment(track, normalizeCorrelation(body, request));
  }

  @Post("model-benchmark")
  enqueueModelBenchmark(
    @Body() body: EnqueueModelBenchmarkRequest,
    @Req() request: FastifyRequest
  ): Promise<EnqueuedJobResponse> {
    const providers = normalizeProviders(body.providers);
    return this.jobs.enqueueModelBenchmark(providers, normalizeCorrelation(body, request));
  }

  @Get("metrics")
  getMetrics() {
    return this.jobs.getQueueMetrics();
  }

  @Get(":jobId")
  getStatus(@Param("jobId") jobId: string): Promise<JobStatusResponse> {
    const normalized = jobId.trim();
    if (!normalized) {
      throw new ApiRequestError("jobId is required.", 400);
    }

    return this.jobs.getJobStatus(normalized);
  }
}

function normalizeCorrelation(
  body: EnqueuePhase5Request | EnqueueModelBenchmarkRequest,
  request: FastifyRequest
) {
  const requestUserId = getRequestUserId(request);

  return {
    requestId: normalizeOptionalString(body.requestId),
    jobId: normalizeOptionalString(body.jobId),
    sessionId: normalizeOptionalString(body.sessionId),
    tenantId: normalizeOptionalString(body.tenantId),
    userId: normalizeOptionalString(body.userId) ?? requestUserId,
    indexId: normalizeOptionalString(body.indexId),
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeTrack(value: unknown): Phase5ExperimentTrack {
  if (typeof value !== "string") {
    throw new ApiRequestError(
      "track is required and must be one of: quantization, lora, fine-tuning, distillation.",
      400
    );
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized !== "quantization" &&
    normalized !== "lora" &&
    normalized !== "fine-tuning" &&
    normalized !== "distillation"
  ) {
    throw new ApiRequestError(
      "track must be one of: quantization, lora, fine-tuning, distillation.",
      400
    );
  }

  return normalized;
}

const ALLOWED_PROVIDERS = new Set(["local-extractive", "ollama", "openai", "groq"]);

function normalizeProviders(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ApiRequestError("providers must be an array of strings.", 400);
  }

  const providers = value
    .filter((provider): provider is string => typeof provider === "string")
    .map((provider) => provider.trim())
    .filter((provider) => provider.length > 0);

  if (providers.length === 0) {
    throw new ApiRequestError("providers must include at least one provider.", 400);
  }

  const unknown = providers.filter((p) => !ALLOWED_PROVIDERS.has(p));
  if (unknown.length > 0) {
    throw new ApiRequestError(
      `Unknown providers: ${unknown.join(", ")}. Allowed values: ${[...ALLOWED_PROVIDERS].join(", ")}.`,
      400
    );
  }

  return providers;
}
