import { Injectable } from "@nestjs/common";
import {
  getRagTradeoffMetrics,
  type RagTradeoffMetricsResponse,
} from "../../rag-service";

@Injectable()
export class RagMetricsService {
  getTradeoffs(): RagTradeoffMetricsResponse {
    return getRagTradeoffMetrics();
  }
}
