import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { RagModule } from "./rag/rag.module";
import type { ApiConfig } from "./config/api-config";

@Module({
  imports: [ConfigModule, HealthModule, RagModule],
})
export class AppModule {
  static forRoot(config: ApiConfig = {}) {
    return {
      module: AppModule,
      imports: [ConfigModule.forRoot(config), HealthModule, RagModule],
    };
  }
}
