import { Injectable } from "@nestjs/common";
import { readFile } from "fs/promises";
import { join } from "path";
import {
  getRagTradeoffMetrics,
  type RagModelBenchmarkResponse,
  type RagTradeoffMetricsResponse,
} from "../../rag-service";

@Injectable()
export class RagMetricsService {
  getTradeoffs(): RagTradeoffMetricsResponse {
    return getRagTradeoffMetrics();
  }

  async getModelBenchmark(): Promise<RagModelBenchmarkResponse> {
    const benchmarkPath = join(
      process.cwd(),
      "datasets/golden/baselines/phase-4-model-benchmark.json"
    );
    const content = await readFile(benchmarkPath, "utf8");
    return JSON.parse(content) as RagModelBenchmarkResponse;
  }
}
