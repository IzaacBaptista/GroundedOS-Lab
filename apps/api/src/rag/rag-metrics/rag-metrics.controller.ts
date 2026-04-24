import { Controller, Get } from "@nestjs/common";
import type { RagTradeoffMetricsResponse } from "../../rag-service";
import { RagMetricsService } from "./rag-metrics.service";

@Controller("rag/metrics")
export class RagMetricsController {
  constructor(private readonly ragMetrics: RagMetricsService) {}

  @Get("tradeoffs")
  getTradeoffs(): RagTradeoffMetricsResponse {
    return this.ragMetrics.getTradeoffs();
  }
}
