import { Body, Controller, Get, Inject, Post, Query } from "@nestjs/common";
import type {
  RagModelBenchmarkResponse,
  RagModelBenchmarkPrecheckResponse,
  RagModelBenchmarkRunResponse,
  RagTradeoffMetricsResponse,
} from "../../rag-service";
import { RagMetricsService } from "./rag-metrics.service";
import type {
  ObservabilityMetricsSummary,
  StructuredTraceRecord,
} from "../../observability/trace-store";

@Controller("rag/metrics")
export class RagMetricsController {
  constructor(@Inject(RagMetricsService) private readonly ragMetrics: RagMetricsService) {}

  @Get("tradeoffs")
  getTradeoffs(): RagTradeoffMetricsResponse {
    return this.ragMetrics.getTradeoffs();
  }

  @Get("observability")
  getObservabilitySummary(@Query("limit") limit?: string): Promise<ObservabilityMetricsSummary> {
    return this.ragMetrics.getObservabilitySummary(limit ? Number(limit) : undefined);
  }

  @Get("traces")
  getRecentTraces(@Query("limit") limit?: string): Promise<StructuredTraceRecord[]> {
    return this.ragMetrics.getRecentTraces(limit ? Number(limit) : undefined);
  }

  @Get("model-benchmark")
  getModelBenchmark(): Promise<RagModelBenchmarkResponse> {
    return this.ragMetrics.getModelBenchmark();
  }

  @Get("model-benchmark/precheck")
  getModelBenchmarkPrecheck(
    @Query("providers") providers?: string,
    @Query("strict") strict?: string
  ): Promise<RagModelBenchmarkPrecheckResponse> {
    return this.ragMetrics.getModelBenchmarkPrecheck({
      providers,
      strict,
    });
  }

  @Post("model-benchmark/run")
  runModelBenchmark(
    @Body() body?: { providers?: string[] }
  ): Promise<RagModelBenchmarkRunResponse> {
    return this.ragMetrics.runModelBenchmark({
      providers: body?.providers,
    });
  }
}
