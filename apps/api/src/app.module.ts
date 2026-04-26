import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { HealthModule } from "./health/health.module";
import { RagModule } from "./rag/rag.module";
import { AgentsModule } from "./agents/index";
import { LabModule } from "./lab/lab.module";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import type { ApiConfig } from "./config/api-config";

@Module({
  imports: [AuditModule, ConfigModule, HealthModule, AuthModule, RagModule, AgentsModule, LabModule, AdminModule],
})
export class AppModule {
  static forRoot(config: ApiConfig = {}) {
    return {
      module: AppModule,
      imports: [
        AuditModule,
        ConfigModule.forRoot(config),
        HealthModule,
        AuthModule,
        RagModule,
        AgentsModule,
        LabModule,
        AdminModule,
      ],
    };
  }
}
