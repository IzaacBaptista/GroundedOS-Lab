import { Module } from "@nestjs/common";
import { MemoryController } from "../memory/memory.controller";
import { MemoryService } from "../memory/memory.service";
import { RagController } from "./rag.controller";
import { RagService } from "./rag.service";
import { RagIndexController } from "./rag-index/rag-index.controller";
import { RagIndexService } from "./rag-index/rag-index.service";
import { RagMemoryController } from "./rag-memory/rag-memory.controller";
import { RagMemoryService } from "./rag-memory/rag-memory.service";
import { RagMetricsController } from "./rag-metrics/rag-metrics.controller";
import { RagMetricsService } from "./rag-metrics/rag-metrics.service";
import { RetrievalDiagnosticsController } from "./retrieval-diagnostics.controller";

@Module({
  controllers: [
    RagController,
    RagIndexController,
    RagMetricsController,
    RagMemoryController,
    RetrievalDiagnosticsController,
    MemoryController,
  ],
  providers: [RagService, RagIndexService, RagMetricsService, RagMemoryService, MemoryService],
  exports: [RagService, RagIndexService, RagMetricsService, RagMemoryService, MemoryService],
})
export class RagModule {}
