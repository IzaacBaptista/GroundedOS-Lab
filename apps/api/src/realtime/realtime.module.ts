import { Module } from "@nestjs/common";
import { AgentsModule } from "../agents";
import { JobsModule } from "../jobs/jobs.module";
import { RagModule } from "../rag/rag.module";
import { RealtimeController } from "./realtime.controller";
import { RealtimeGateway } from "./realtime.gateway";
import { StreamingResponseManager } from "./streaming-response.manager";

@Module({
  imports: [RagModule, AgentsModule, JobsModule],
  controllers: [RealtimeController],
  providers: [RealtimeGateway, StreamingResponseManager],
  exports: [RealtimeGateway, StreamingResponseManager],
})
export class RealtimeModule {}
