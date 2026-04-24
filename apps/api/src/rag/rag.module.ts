import { Module } from "@nestjs/common";
import { RagController } from "./rag.controller";
import { RagService } from "./rag.service";
import { RagIndexController } from "./rag-index/rag-index.controller";
import { RagIndexService } from "./rag-index/rag-index.service";
import { RagMemoryController } from "./rag-memory/rag-memory.controller";
import { RagMemoryService } from "./rag-memory/rag-memory.service";
import { RagMetricsController } from "./rag-metrics/rag-metrics.controller";
import { RagMetricsService } from "./rag-metrics/rag-metrics.service";

@Module({
  controllers: [RagController, RagIndexController, RagMetricsController, RagMemoryController],
  providers: [RagService, RagIndexService, RagMetricsService, RagMemoryService],
  exports: [RagService, RagIndexService, RagMetricsService, RagMemoryService],
})
export class RagModule {}
