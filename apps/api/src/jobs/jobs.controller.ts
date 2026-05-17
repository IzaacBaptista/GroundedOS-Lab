import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { FastifyRequest, FastifyReply } from "fastify";
import { getRequestUser } from "../common/auth-context";
import { ApiRequestError } from "../errors";
import { getActiveTraceContext } from "../otel";
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
  traceId?: unknown;
  agentExecutionId?: unknown;
};

type EnqueueModelBenchmarkRequest = {
  providers?: unknown;
  requestId?: unknown;
  jobId?: unknown;
  sessionId?: unknown;
  tenantId?: unknown;
  userId?: unknown;
  indexId?: unknown;
  traceId?: unknown;
  agentExecutionId?: unknown;
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
  async getMetrics(
    @Query("format") format?: string,
    @Res({ passthrough: true }) response?: FastifyReply
  ) {
    if (format === "prometheus") {
      const prometheusText = this.jobs.getQueueMetricsPrometheus();
      if (response) {
        response.header("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
      }
      return prometheusText;
    }

    // Default JSON format
    return this.jobs.getQueueMetrics();
  }

  @Get("dlq/list")
  listDlq() {
    return this.jobs.listDlqEntries();
  }

  @Get("dlq/history")
  getDlqRedriveHistory(@Query("limit") limit?: string, @Query("offset") offset?: string) {
    return this.jobs.getRedriveHistory(
      limit ? Math.min(parseInt(limit, 10), 100) : 100,
      offset ? parseInt(offset, 10) : 0
    );
  }

  @Get("dlq/history/:jobType")
  getDlqRedriveHistoryByJobType(
    @Param("jobType") jobType: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string
  ) {
    if (jobType !== "phase5-experiment" && jobType !== "model-benchmark") {
      throw new ApiRequestError(
        `Invalid jobType: ${jobType}. Must be 'phase5-experiment' or 'model-benchmark'.`,
        400
      );
    }
    return this.jobs.getRedriveHistoryByJobType(
      jobType,
      limit ? Math.min(parseInt(limit, 10), 100) : 100,
      offset ? parseInt(offset, 10) : 0
    );
  }

  @Get("dlq/entry/:dlqJobId")
  getDlqEntry(@Param("dlqJobId") dlqJobId: string) {
    const normalized = dlqJobId.trim();
    if (!normalized) {
      throw new ApiRequestError("dlqJobId is required.", 400);
    }

    const entry = this.jobs.getDlqEntry(normalized);
    if (!entry) {
      throw new ApiRequestError(`DLQ entry ${normalized} not found.`, 404);
    }

    return entry;
  }

  @Post("dlq/:dlqJobId/redrive")
  async redriveDlq(
    @Param("dlqJobId") dlqJobId: string,
    @Body() body: { dryRun?: boolean },
    @Req() request: FastifyRequest
  ) {
    const normalized = dlqJobId.trim();
    if (!normalized) {
      throw new ApiRequestError("dlqJobId is required.", 400);
    }

    const redrivenBy = getRequestUser(request)?.userId;
    return this.jobs.redriveDlqJob(normalized, body.dryRun ?? false, redrivenBy);
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
  const requestUser = getRequestUser(request);
  const activeTrace = getActiveTraceContext();

  return {
    requestId: normalizeOptionalString(body.requestId) ?? String(request.id),
    traceId: normalizeOptionalString(body.traceId) ?? activeTrace?.traceId,
    jobId: normalizeOptionalString(body.jobId),
    sessionId: normalizeOptionalString(body.sessionId),
    tenantId: normalizeOptionalString(body.tenantId) ?? requestUser?.tenantId,
    userId: normalizeOptionalString(body.userId) ?? requestUser?.userId,
    indexId: normalizeOptionalString(body.indexId),
    agentExecutionId: normalizeOptionalString(body.agentExecutionId),
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
