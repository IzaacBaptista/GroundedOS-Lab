import { DynamicModule, Global, Module } from "@nestjs/common";
import { API_CONFIG, ApiConfig, ApiConfigService } from "./api-config";

@Global()
@Module({
  providers: [
    {
      provide: API_CONFIG,
      useValue: {} as ApiConfig,
    },
    ApiConfigService,
  ],
  exports: [ApiConfigService, API_CONFIG],
})
export class ConfigModule {
  static forRoot(config: ApiConfig = {}): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        {
          provide: API_CONFIG,
          useValue: config,
        },
        ApiConfigService,
      ],
      exports: [ApiConfigService, API_CONFIG],
    };
  }
}
