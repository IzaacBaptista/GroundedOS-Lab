import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { RagModule } from "./rag/rag.module";
import { AgentsModule } from "./agents/index";
import { LabModule } from "./lab/lab.module";
import type { ApiConfig } from "./config/api-config";

@Module({
  imports: [ConfigModule, HealthModule, RagModule, AgentsModule, LabModule],
})
export class AppModule {
  static forRoot(config: ApiConfig = {}) {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), HealthModule, RagModule, AgentsModule, LabModule],
    };
  }
}
