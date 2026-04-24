import { Controller, Get, Inject } from "@nestjs/common";
import type { RagTradeoffMetricsResponse } from "../../rag-service";
import { RagMetricsService } from "./rag-metrics.service";

@Controller("rag/metrics")
export class RagMetricsController {
  constructor(@Inject(RagMetricsService) private readonly ragMetrics: RagMetricsService) {}

  @Get("tradeoffs")
  getTradeoffs(): RagTradeoffMetricsResponse {
    return this.ragMetrics.getTradeoffs();
  }
}
