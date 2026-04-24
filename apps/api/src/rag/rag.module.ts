import { Module } from "@nestjs/common";
import { RagController } from "./rag.controller";
import { RagService } from "./rag.service";
import { RagIndexController } from "./rag-index/rag-index.controller";
import { RagIndexService } from "./rag-index/rag-index.service";

@Module({
  controllers: [RagController, RagIndexController],
  providers: [RagService, RagIndexService],
  exports: [RagService, RagIndexService],
})
export class RagModule {}
